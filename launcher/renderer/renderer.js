"use strict";
const api = window.tabletop;
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

let S = null; // último estado completo
let roomsTimer = null;

// ------------------------------------------------------------------ utilidades
function toast(text) {
  const t = $("toast");
  t.textContent = text;
  t.classList.remove("hidden");
  clearTimeout(toast.t);
  toast.t = setTimeout(() => t.classList.add("hidden"), 2200);
}

function say(id, kind, html) {
  const el = $(id);
  el.className = "msg " + kind;
  el.innerHTML = html;
}
const hide = (id) => $(id).classList.add("hidden");

async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast("Copiado!");
  } catch {
    toast("Não consegui copiar; selecione o texto e use Ctrl+C.");
  }
}

// ------------------------------------------------------------------ abas
document.querySelectorAll("#tabs button").forEach((b) =>
  b.addEventListener("click", () => {
    document.querySelectorAll("#tabs button").forEach((x) => x.classList.toggle("active", x === b));
    document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t.id === "tab-" + b.dataset.tab));
    if (b.dataset.tab === "assets") loadAssets();
    if (b.dataset.tab === "master") refreshRooms();
    if (b.dataset.tab === "log") loadLog();
  })
);
document.querySelectorAll("[data-copy]").forEach((b) => b.addEventListener("click", () => copy($(b.dataset.copy).textContent)));

// ------------------------------------------------------------------ servidor
function renderServer(srv) {
  const st = srv.status;
  const top = $("top-status");
  const btn = $("btn-server");
  const label = { stopped: "Servidor desligado", starting: "Ligando…", running: "Servidor ligado", stopping: "Desligando…" }[st];
  top.className = "pill " + (st === "running" ? "on" : st === "stopped" ? "off" : "mid");
  top.textContent = "● " + label;
  btn.textContent = st === "running" ? "Desligar servidor" : st === "stopped" ? "Ligar servidor" : "Aguarde…";
  btn.className = "big " + (st === "running" ? "stop" : "primary");
  btn.disabled = st === "starting" || st === "stopping";
  $("port").disabled = st !== "stopped";
  $("srv-text").textContent =
    st === "running" ? `Ligado na porta ${srv.port}. Os jogadores já podem entrar.` :
    st === "stopped" ? "Desligado. Ligue para os jogadores poderem entrar." : label;
  $("open-local").disabled = st !== "running";
  $("btn-tunnel").disabled = st !== "running";
  if (st !== "running") $("rooms").innerHTML = '<div class="muted">Ligue o servidor para ver as salas ao vivo.</div>';
}

function renderAddresses() {
  $("url-local").textContent = S.localUrl;
  $("lan-list").innerHTML = S.lan
    .map((u, i) => `<div class="addr"><div><span class="label">Mesma rede</span><code id="lan-${i}">${esc(u)}</code></div><button data-lan="${i}">Copiar</button></div>`)
    .join("");
  document.querySelectorAll("[data-lan]").forEach((b) => b.addEventListener("click", () => copy($("lan-" + b.dataset.lan).textContent)));
  $("data-dir").textContent = S.settings.dataDir;
}

$("btn-server").addEventListener("click", async () => {
  hide("srv-error");
  const running = S.server.status === "running";
  const r = await api.invoke(running ? "server:stop" : "server:start");
  if (r && r.ok === false) say("srv-error", "err", esc(r.error));
});

$("port").addEventListener("change", async () => {
  const r = await api.invoke("settings:set", { port: Number($("port").value) });
  if (!r.ok) {
    say("srv-error", "err", esc(r.error));
    $("port").value = S.settings.port;
  } else {
    hide("srv-error");
    S = r.snapshot;
    renderAddresses();
  }
});
$("autostart").addEventListener("change", () => api.invoke("settings:set", { autoStart: $("autostart").checked }));
$("open-local").addEventListener("click", () => api.invoke("open:url", S.localUrl));

// ------------------------------------------------------------------ link público
function renderTunnel(t) {
  const btn = $("btn-tunnel");
  btn.textContent = t.status === "stopped" ? "Ligar link público" : t.status === "starting" ? "Criando link…" : "Desligar link público";
  btn.className = t.status === "running" ? "stop" : "";
  $("tun-url-row").classList.toggle("hidden", !t.url);
  $("tun-url").textContent = t.url || "";
  $("tun-text").textContent =
    t.status === "running" ? "Link ativo. Envie para os jogadores." :
    t.status === "starting" ? "Criando o link; leva alguns segundos…" :
    "Cria um endereço temporário que seus amigos podem abrir de qualquer lugar.";
  $("tun-install").classList.toggle("hidden", t.installed || t.status !== "stopped");
  if (S) S.tunnel = t;
}

$("btn-tunnel").addEventListener("click", async () => {
  if (S.tunnel.status === "stopped") {
    const r = await api.invoke("tunnel:start");
    if (!r.ok) {
      if (r.needInstall) $("tun-install").classList.remove("hidden");
      else toast(r.error);
    }
  } else {
    await api.invoke("tunnel:stop");
  }
});
$("btn-install").addEventListener("click", async () => {
  await api.invoke("tunnel:install");
  toast("Instalando… acompanhe na aba Registro. Depois clique em “Ligar link público”.");
});
$("open-tun").addEventListener("click", () => api.invoke("open:url", $("tun-url").textContent));

// ------------------------------------------------------------------ dados
$("data-open").addEventListener("click", () => api.invoke("data:open"));
$("data-choose").addEventListener("click", async () => {
  const r = await api.invoke("data:choose");
  if (r.ok) {
    S = r.snapshot;
    renderAddresses();
    say("data-msg", "ok", "Pasta de dados alterada. As salas e cenários dessa pasta serão usados na próxima vez que o servidor ligar.");
  } else if (!r.canceled) say("data-msg", "err", esc(r.error));
});
$("data-backup").addEventListener("click", async () => {
  const r = await api.invoke("data:backup");
  say("data-msg", r.ok ? "ok" : "err", r.ok ? `Backup criado em <code>${esc(r.path)}</code>` : esc(r.error));
});

// ------------------------------------------------------------------ Mestre e salas
$("m-show").addEventListener("change", () => ($("m-pin").type = $("m-show").checked ? "text" : "password"));

async function saveMaster(name, pin, ip) {
  const r = await api.invoke("master:save", { masterName: name, masterPin: pin, masterIp: ip });
  if (!r.ok) return say("m-msg", "err", esc(r.error));
  S.master = r.master;
  const bits = [];
  if (r.master.masterName) bits.push(`nome <b>${esc(r.master.masterName)}</b>${r.master.masterPin ? " (com senha)" : " (sem senha)"}`);
  if (r.master.masterIp) bits.push(`IP <b>${esc(r.master.masterIp)}</b>`);
  say(
    "m-msg",
    "ok",
    bits.length
      ? `Mestre fixo: ${bits.join(" ou ")}. Vale para as próximas entradas; quem já está na sala mantém o papel atual até você usar “Tornar Mestre”.`
      : "Mestre fixo removido: volta a valer “o primeiro a entrar vira Mestre”."
  );
}
$("m-save").addEventListener("click", () => {
  const name = $("m-name").value.trim();
  const ip = $("m-ip").value.trim();
  if (!name && !ip) return say("m-msg", "err", "Digite o nome do Mestre e/ou o IP do computador dele.");
  saveMaster(name, $("m-pin").value, ip);
});
$("m-clear").addEventListener("click", () => {
  $("m-name").value = "";
  $("m-pin").value = "";
  $("m-ip").value = "";
  saveMaster("", "", "");
});
function renderIpPicker() {
  const sel = $("m-ip-pick");
  sel.innerHTML = '<option value="">Usar meu IP…</option>' + (S.lanIps || []).map((ip) => `<option value="${esc(ip)}">${esc(ip)}</option>`).join("");
  sel.addEventListener("change", () => {
    if (sel.value) $("m-ip").value = sel.value;
    sel.value = "";
  });
}

async function refreshRooms() {
  if (!S || S.server.status !== "running") return;
  const r = await api.invoke("rooms:get");
  const box = $("rooms");
  if (!r.ok) return void (box.innerHTML = `<div class="muted">${esc(r.error || "Sem resposta do servidor.")}</div>`);
  $("rooms-info").textContent = `${r.rooms.length} sala(s) ativa(s)`;
  if (!r.rooms.length) return void (box.innerHTML = '<div class="muted">Nenhuma sala ativa agora. As salas aparecem aqui quando alguém entra.</div>');
  box.innerHTML = r.rooms
    .map(
      (room) => `
    <div class="room">
      <div class="room-head"><b>Sala ${esc(room.id)}</b>
        <span class="muted">${room.tokens} tokens · ${room.props + room.sprites} objetos${room.scenario ? " · cenário: " + esc(room.scenario.name) : ""}</span></div>
      ${room.users
        .map(
          (u) => `<div class="user"><div>${u.role === "gm" ? "👑" : "🎭"} ${esc(u.name)}
            <span class="badge ${u.role === "gm" ? "" : "p"}">${u.role === "gm" ? "Mestre" : "Jogador"}</span>
            ${u.ip ? `<span class="muted"> · ${esc(u.ip)}</span>` : ""}</div>
            <div class="row gap">
              ${u.role === "gm" ? "" : `<button data-act="master" data-room="${esc(room.id)}" data-id="${esc(u.id)}">Tornar Mestre</button>`}
              <button class="danger" data-act="kick" data-room="${esc(room.id)}" data-id="${esc(u.id)}">Expulsar</button>
            </div></div>`
        )
        .join("")}
    </div>`
    )
    .join("");
  box.querySelectorAll("button[data-act]").forEach((b) =>
    b.addEventListener("click", async () => {
      const res = await api.invoke(b.dataset.act === "master" ? "rooms:master" : "rooms:kick", { roomId: b.dataset.room, socketId: b.dataset.id });
      toast(res.ok ? (b.dataset.act === "master" ? "Mestre trocado." : "Jogador removido.") : res.error || "Falhou.");
      refreshRooms();
    })
  );
}

// ------------------------------------------------------------------ assets
let assetData = null;

function showAddResult(r) {
  if (!r.ok) return r.canceled ? null : say("a-msg", "err", esc(r.error));
  const skipped = r.skipped || [];
  let html = r.added && r.added.length ? `✔ ${r.added.length} imagem(ns) adicionada(s) em <b>${esc(r.pack)}</b> › ${esc(r.category)}.` : "Nenhuma imagem nova foi adicionada.";
  if (skipped.length) html += `<br>Ignoradas (${skipped.length}):<ul>${skipped.map((s) => `<li>${esc(s.file)}: ${esc(s.reason)}</li>`).join("")}</ul>`;
  say("a-msg", r.added && r.added.length ? (skipped.length ? "warn" : "ok") : "err", html);
  loadAssets();
}

$("a-add").addEventListener("click", async () => showAddResult(await api.invoke("assets:addFiles", { packName: $("a-pack").value, category: $("a-cat").value })));
$("a-pack-add").addEventListener("click", async () => {
  const r = await api.invoke("assets:addPack");
  if (r.canceled) return;
  say("a-msg", r.ok ? "ok" : "err", r.ok ? `Pacote <b>${esc(r.name)}</b> adicionado.` : esc(r.error));
  loadAssets();
});
$("a-open").addEventListener("click", () => api.invoke("assets:openDir"));
$("a-search").addEventListener("input", renderAssetGrid);

const drop = $("drop");
["dragenter", "dragover"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("over"); }));
["dragleave", "drop"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove("over"); }));
drop.addEventListener("drop", async (e) => {
  const files = api.pathsOf(e.dataTransfer.files).filter(Boolean);
  if (!files.length) return;
  showAddResult(await api.invoke("assets:addPaths", { packName: $("a-pack").value, category: $("a-cat").value, files }));
});
// soltar fora da caixa não deve abrir o arquivo na janela
document.addEventListener("dragover", (e) => e.preventDefault());
document.addEventListener("drop", (e) => e.preventDefault());

async function loadAssets() {
  assetData = await api.invoke("assets:list");
  $("a-packs").innerHTML = assetData.packs
    .map((p) => `<span class="pack-chip">${esc(p.name)} <span class="muted">(${p.count})</span>${p.removable ? ` <button data-rm="${esc(p.name)}" title="Remover pacote">✕</button>` : ""}</span>`)
    .join("");
  document.querySelectorAll("[data-rm]").forEach((b) =>
    b.addEventListener("click", async () => {
      if (!confirm(`Remover o pacote “${b.dataset.rm}”? Os arquivos vão para a pasta .trash-packs e podem ser recuperados.`)) return;
      const r = await api.invoke("assets:removePack", { name: b.dataset.rm });
      toast(r.ok ? "Pacote removido." : r.error);
      loadAssets();
    })
  );
  renderAssetGrid();
}

function renderAssetGrid() {
  if (!assetData) return;
  const q = $("a-search").value.trim().toLowerCase();
  const catLabel = Object.fromEntries(S.categories.map((c) => [c.id, c.label]));
  const list = assetData.assets.filter((a) => !q || a.name.toLowerCase().includes(q) || a.tags.some((t) => t.includes(q)) || (catLabel[a.category] || "").toLowerCase().includes(q));
  $("a-grid").innerHTML = list
    .map(
      (a) => `<div class="tile" title="${esc(a.name)} — ${a.w}×${a.h}">
        <div class="thumb">${a.file ? `<img loading="lazy" src="file:///${encodeURI(a.file.replace(/\\/g, "/"))}" />` : ""}</div>
        <div class="name">${esc(a.name)}</div><div class="cat">${esc(catLabel[a.category] || a.category)}</div></div>`
    )
    .join("");
  $("a-count").textContent = assetData.total
    ? `${list.length} de ${assetData.total} asset(s)${assetData.total > assetData.assets.length ? " (mostrando os primeiros " + assetData.assets.length + ")" : ""}.`
    : "A biblioteca está vazia. Adicione imagens acima.";
  if (assetData.warnings.length) $("a-count").textContent += ` ⚠ ${assetData.warnings.length} aviso(s): ${assetData.warnings.slice(0, 3).join(" | ")}`;
}

// ------------------------------------------------------------------ registro
function appendLog(e) {
  const pre = $("log");
  const stick = pre.scrollTop + pre.clientHeight >= pre.scrollHeight - 20;
  const time = new Date(e.t).toLocaleTimeString("pt-BR");
  const line = document.createElement("div");
  if (e.kind === "error") line.className = "e";
  line.textContent = `[${time}] ${e.line}`;
  pre.appendChild(line);
  while (pre.childElementCount > 800) pre.firstChild.remove();
  if (stick) pre.scrollTop = pre.scrollHeight;
}
async function loadLog() {
  $("log").innerHTML = "";
  (await api.invoke("logs:get")).forEach(appendLog);
}
$("log-copy").addEventListener("click", () => copy($("log").innerText));
$("log-clear").addEventListener("click", async () => {
  await api.invoke("logs:clear");
  $("log").innerHTML = "";
});

// ------------------------------------------------------------------ eventos do programa
api.on("server:status", (srv) => {
  S.server = srv;
  renderServer(srv);
});
api.on("server:log", appendLog);
api.on("tunnel:status", (t) => renderTunnel(t));

// ------------------------------------------------------------------ início
(async function init() {
  S = await api.invoke("state:get");
  $("port").value = S.settings.port;
  $("autostart").checked = S.settings.autoStart;
  $("m-name").value = S.master.masterName;
  $("m-pin").value = S.master.masterPin;
  $("m-ip").value = S.master.masterIp || "";
  renderIpPicker();
  $("a-cat").innerHTML = S.categories.map((c) => `<option value="${c.id}">${esc(c.label)}</option>`).join("");
  $("a-cat").value = "furniture";
  renderAddresses();
  renderServer(S.server);
  renderTunnel(S.tunnel);
  roomsTimer = setInterval(() => {
    if (document.getElementById("tab-master").classList.contains("active")) refreshRooms();
  }, 2000);
})();
