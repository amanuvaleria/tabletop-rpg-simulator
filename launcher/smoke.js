/**
 * Teste de fumaça: `electron . --smoke=<pasta>`. Roda o aplicativo de verdade (servidor real, dados isolados),
 * exercita cada função do painel e salva capturas de tela + smoke.json. Não é usado no uso normal.
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function runSmoke({ outDir, win, handlers, server, tunnel, saveSettings, getSettings, findCloudflared, APP_ROOT }) {
  const results = [];
  const ok = (cond, name, extra) => {
    results.push({ ok: !!cond, name, extra });
    console.log(`${cond ? "PASS" : "FAIL"} ${name}${extra ? " — " + extra : ""}`);
  };
  const fixtures = process.env.SMOKE_FIXTURES;
  const PORT = 4510;
  const dataDir = path.join(outDir, "data");
  fs.rmSync(dataDir, { recursive: true, force: true });
  saveSettings({ port: PORT, dataDir, autoStart: false });
  const shot = async (name) => {
    const img = await win.webContents.capturePage();
    fs.writeFileSync(path.join(outDir, name + ".png"), img.toPNG());
  };
  const ui = (js) => win.webContents.executeJavaScript(js);
  const tab = async (t) => {
    await ui(`document.querySelector('#tabs button[data-tab="${t}"]').click()`);
    await sleep(500);
  };
  let code = 0;

  try {
    win.setSize(1000, 740);
    await sleep(400);
    ok(await ui(`document.getElementById('top-status').textContent.includes('desligado')`), "interface abre com servidor desligado");
    await shot("1-servidor-desligado");

    // ---------- ligar o servidor pela própria interface
    await ui(`document.getElementById('btn-server').click()`);
    for (let i = 0; i < 80 && server.status !== "running"; i++) await sleep(250);
    ok(server.status === "running", "servidor liga pelo botão");
    const health = await fetch(`http://127.0.0.1:${PORT}/health`).then((r) => r.json()).catch(() => null);
    ok(health && health.ok, "servidor responde na porta configurada");
    await sleep(400);
    ok(await ui(`document.getElementById('top-status').textContent.includes('ligado') && document.getElementById('btn-server').textContent.includes('Desligar')`), "interface mostra servidor ligado");
    const busy = await handlers["server:start"]();
    ok(busy.ok === false, "ligar de novo é recusado", busy.error);
    const portClash = await handlers["settings:set"](null, { port: 4511 });
    ok(portClash.ok === false, "não deixa trocar a porta com o servidor ligado");

    // ---------- porta ocupada
    const net = require("net");
    const blocker = net.createServer();
    await new Promise((r) => blocker.listen(4520, "0.0.0.0", r));
    const { ServerManager } = require("./lib/server-manager");
    const probe = new ServerManager({ serverDir: path.join(APP_ROOT, "server") });
    const clash = await probe.start({ port: 4520, dataDir: path.join(outDir, "x") });
    ok(clash.ok === false && /em uso/.test(clash.error), "porta ocupada gera mensagem clara", clash.error);
    blocker.close();

    // ---------- Mestre fixo + jogadores reais
    const { io } = require(path.join(APP_ROOT, "web", "node_modules", "socket.io-client"));
    const connect = () => new Promise((r) => { const s = io(`http://127.0.0.1:${PORT}`, { transports: ["websocket"] }); s.events = []; s.on("role:update", (p) => s.events.push(p)); s.on("connect", () => r(s)); });
    const join = (s, room, name, pin) => new Promise((r) => s.emit("room:join", { roomId: room, name, pin }, r));
    const sv = await handlers["master:save"](null, { masterName: "Marina", masterPin: "1234" });
    ok(sv.ok && JSON.parse(fs.readFileSync(path.join(dataDir, "config.json"), "utf8")).masterName === "Marina", "Mestre fixo gravado em disco");
    const pedro = await connect(), marina = await connect();
    const jp = await join(pedro, "SMOKE", "Pedro");
    const jm0 = await join(await connect(), "SMOKE", "Marina", "errada");
    const jm = await join(marina, "SMOKE", "Marina", "1234");
    ok(jp.role === "player", "primeiro a entrar NÃO é Mestre com Mestre fixo");
    ok(jm0.role === "player" && jm0.pinRejected, "senha errada recusada");
    ok(jm.role === "gm", "Marina com a senha certa vira Mestre");
    await tab("master");
    await sleep(2400);
    ok(await ui(`document.getElementById('rooms').innerText.includes('Sala SMOKE') && document.getElementById('rooms').innerText.includes('Marina')`), "aba Mestre mostra a sala e os jogadores ao vivo");
    await shot("2-mestre-salas");
    const state = await handlers["rooms:get"]();
    const pedroId = state.rooms.find((r) => r.id === "SMOKE").users.find((u) => u.name === "Pedro").id;
    const swap = await handlers["rooms:master"](null, { roomId: "SMOKE", socketId: pedroId });
    await sleep(300);
    ok(swap.ok && pedro.events.some((e) => e.role === "gm") && marina.events.some((e) => e.role === "player"), "botão Tornar Mestre troca o papel dos dois");

    // ---------- salvar ao desligar (sem esperar o autosave de 1,5 s)
    const gm = pedro;
    gm.emit("prop:add", { id: "smoke-prop", kind: "crate", position: [2, 0, 2], rotationY: 0, scale: 1 });
    await sleep(150);

    // ---------- assets
    await tab("assets");
    if (fixtures && fs.existsSync(fixtures)) {
      const f = (n) => path.join(fixtures, n);
      fs.copyFileSync(f("mesa_user.png"), path.join(outDir, "mesa_copia_nome_diferente.png"));
      const r = await handlers["assets:addPaths"](null, {
        packName: "Pacote Teste", category: "furniture",
        files: [f("mesa_user.png"), f("mancha.webp"), f("pentagrama.svg"), f("malicioso.svg"), f("quebrado.png"), path.join(outDir, "mesa_copia_nome_diferente.png"), f("falso.png")],
      });
      ok(r.ok && r.added.length === 3, "3 imagens válidas adicionadas (PNG, WebP, SVG)", JSON.stringify(r.added));
      const why = Object.fromEntries(r.skipped.map((s) => [s.file, s.reason]));
      ok(/inseguro/.test(why["malicioso.svg"] || ""), "SVG com script recusado");
      ok(/válido/.test(why["quebrado.png"] || "") && /válido/.test(why["falso.png"] || ""), "arquivo corrompido e arquivo que não é imagem recusados");
      ok(/idêntica/.test(why["mesa_copia_nome_diferente.png"] || ""), "duplicata (outro nome, mesmo conteúdo) recusada");
      ok(fs.existsSync(path.join(dataDir, "packs", "Pacote Teste", "furniture", "mesa_user.png")), "arquivo copiado para <dados>/packs/<pacote>/<categoria>");
      const cat = await fetch(`http://127.0.0.1:${PORT}/api/assets`).then((x) => x.json());
      const mesa = cat.assets.find((a) => a.name.toLowerCase().includes("mesa user"));
      ok(!!mesa && mesa.category === "furniture" && mesa.width === 64 && mesa.alpha === true, "servidor em execução já enxerga o asset novo (sem reiniciar)", mesa && mesa.id);
      const img = mesa && (await fetch(`http://127.0.0.1:${PORT}${mesa.url}`));
      ok(img && img.status === 200 && /png/.test(img.headers.get("content-type")), "imagem do asset é servida");
      const list = await handlers["assets:list"]();
      ok(list.assets.some((a) => a.file && fs.existsSync(a.file)), "lista do painel traz caminhos das miniaturas");
      await sleep(600);
      await ui(`document.getElementById('a-add').scrollIntoView()`);
      await tab("assets");
      await sleep(800);
      await shot("3-assets");
      const rm = await handlers["assets:removePack"](null, { name: "Pacote Teste" });
      ok(rm.ok && !fs.existsSync(path.join(dataDir, "packs", "Pacote Teste")) && fs.existsSync(path.join(dataDir, ".trash-packs")), "remover pacote move para a lixeira");
      ok(!(await handlers["assets:removePack"](null, { name: "..\\..\\" })).ok, "remover pacote não aceita caminho fora da pasta de pacotes");
    } else {
      ok(false, "fixtures de imagem não encontradas (defina SMOKE_FIXTURES)");
    }

    // ---------- backup
    const bk = await handlers["data:backup"]();
    ok(bk.ok && fs.existsSync(path.join(bk.path, "config.json")), "backup copia a pasta de dados", bk.path);

    // ---------- link público (real)
    if (findCloudflared() && !process.env.SMOKE_NO_TUNNEL) {
      const t = await handlers["tunnel:start"]();
      ok(t.ok, "link público inicia");
      for (let i = 0; i < 100 && !tunnel.url; i++) await sleep(300);
      ok(!!tunnel.url, "link público recebe um endereço", tunnel.url);
      if (tunnel.url) {
        let status = 0;
        for (let i = 0; i < 20 && status !== 200; i++) {
          status = await fetch(tunnel.url + "/health").then((r) => r.status).catch(() => 0);
          if (status !== 200) await sleep(1500);
        }
        ok(status === 200, "o link público responde de fora", String(status));
        await tab("server");
        await sleep(500);
        await shot("4-servidor-ligado-com-link");
      }
      handlers["tunnel:stop"]();
      for (let i = 0; i < 30 && tunnel.child; i++) await sleep(200);
      ok(!tunnel.child, "link público desliga");
    }

    await tab("log");
    await sleep(500);
    await shot("5-registro");
    ok((await ui(`document.getElementById('log').innerText.length`)) > 20, "aba Registro mostra o log do servidor");

    // ---------- desligar com salvamento
    pedro.close(); marina.close();
    await ui(`document.getElementById('btn-server').click()`);
    for (let i = 0; i < 60 && server.status !== "stopped"; i++) await sleep(250);
    ok(server.status === "stopped", "servidor desliga pelo botão");
    const roomFile = path.join(dataDir, "rooms", "SMOKE.json");
    ok(fs.existsSync(roomFile) && JSON.parse(fs.readFileSync(roomFile, "utf8")).props.some((p) => p.id === "smoke-prop"), "desligar salva a sala na hora (nada se perde)");
    ok((await fetch(`http://127.0.0.1:${PORT}/health`).then(() => true).catch(() => false)) === false, "porta liberada depois de desligar");

    // ---------- religar: o estado volta do disco
    const again = await handlers["server:start"]();
    ok(again.ok, "servidor liga de novo");
    const c2 = await connect();
    const j2 = await join(c2, "SMOKE", "Marina", "1234");
    ok(j2.props.some((p) => p.id === "smoke-prop") && j2.role === "gm", "ao religar, a sala volta com o objeto e a Marina é Mestre de novo");
    c2.close();
    await handlers["server:stop"]();
    ok(server.status === "stopped", "desliga novamente");
  } catch (e) {
    ok(false, "erro inesperado no teste", e && e.stack);
  }

  const failed = results.filter((r) => !r.ok).length;
  fs.writeFileSync(path.join(outDir, "smoke.json"), JSON.stringify({ passed: results.length - failed, failed, results }, null, 2));
  console.log(`\nRESULTADO: ${results.length - failed} passaram, ${failed} falharam`);
  code = failed ? 1 : 0;
  try { tunnel.stop(); await server.stop(); } catch { /* ignore */ }
  setTimeout(() => require("electron").app.exit(code), 400);
}

module.exports = { runSmoke };
