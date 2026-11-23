const { spawn } = require("child_process");
const { EventEmitter } = require("events");
const net = require("net");
const path = require("path");
const crypto = require("crypto");

/** Procura uma porta livre em 127.0.0.1 (usada para a API de administração). */
function freePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.once("error", reject);
    s.listen(0, "127.0.0.1", () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
  });
}

/** Confere se uma porta TCP já está em uso (em qualquer interface). */
function portInUse(port) {
  return new Promise((resolve) => {
    const s = net.createServer();
    s.once("error", () => resolve(true));
    s.listen(port, "0.0.0.0", () => s.close(() => resolve(false)));
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Liga/desliga o servidor do tabletop como processo filho.
 * O servidor é executado com o próprio Node embutido no Electron (ELECTRON_RUN_AS_NODE),
 * então não é preciso ter Node instalado no computador.
 */
class ServerManager extends EventEmitter {
  /** @param {{ serverDir: string, execPath?: string }} opts */
  constructor({ serverDir, execPath = process.execPath }) {
    super();
    this.serverDir = serverDir;
    this.execPath = execPath;
    this.child = null;
    this.status = "stopped"; // stopped | starting | running | stopping
    this.port = 4000;
    this.adminPort = 0;
    this.adminToken = "";
    this.logs = [];
  }

  log(line, kind = "info") {
    const entry = { t: Date.now(), kind, line: String(line).replace(/\r?\n$/, "") };
    this.logs.push(entry);
    if (this.logs.length > 800) this.logs.shift();
    this.emit("log", entry);
  }

  setStatus(s) {
    this.status = s;
    this.emit("status", this.snapshot());
  }

  snapshot() {
    return { status: this.status, port: this.port, pid: this.child ? this.child.pid : null };
  }

  async start({ port, dataDir }) {
    if (this.status !== "stopped") return { ok: false, error: "O servidor já está ligado." };
    port = Number(port);
    if (!Number.isInteger(port) || port < 1024 || port > 65535) return { ok: false, error: "Porta inválida (use um número entre 1024 e 65535)." };
    if (await portInUse(port)) {
      return { ok: false, error: `A porta ${port} já está em uso por outro programa. Feche-o ou escolha outra porta.` };
    }
    this.port = port;
    this.setStatus("starting");
    this.adminPort = await freePort();
    this.adminToken = crypto.randomBytes(24).toString("hex");
    const entry = path.join(this.serverDir, "index.js");
    this.log(`Iniciando servidor na porta ${port}…`);
    let child;
    try {
      child = spawn(this.execPath, [entry], {
        cwd: this.serverDir,
        windowsHide: true,
        env: {
          ...process.env,
          ELECTRON_RUN_AS_NODE: "1",
          PORT: String(port),
          TABLETOP_DATA_DIR: dataDir,
          TABLETOP_ADMIN_PORT: String(this.adminPort),
          TABLETOP_ADMIN_TOKEN: this.adminToken,
        },
      });
    } catch (err) {
      this.setStatus("stopped");
      return { ok: false, error: "Não foi possível iniciar: " + err.message };
    }
    this.child = child;
    const pipe = (stream, kind) => {
      let buf = "";
      stream.on("data", (d) => {
        buf += d.toString("utf8");
        let i;
        while ((i = buf.indexOf("\n")) >= 0) {
          this.log(buf.slice(0, i), kind);
          buf = buf.slice(i + 1);
        }
      });
    };
    pipe(child.stdout, "info");
    pipe(child.stderr, "error");
    child.on("exit", (code, signal) => {
      this.log(`Servidor encerrado (código ${code ?? "-"}${signal ? ", sinal " + signal : ""}).`, code === 0 || code === null ? "info" : "error");
      this.child = null;
      this.setStatus("stopped");
    });
    child.on("error", (err) => this.log("Erro no processo: " + err.message, "error"));

    // espera o servidor responder em /health (até 15 s)
    const t0 = Date.now();
    while (Date.now() - t0 < 15000) {
      if (!this.child) return { ok: false, error: "O servidor fechou logo ao iniciar. Veja a aba Registro." };
      try {
        const r = await fetch(`http://127.0.0.1:${port}/health`);
        if (r.ok) {
          this.setStatus("running");
          this.log("Servidor pronto.");
          return { ok: true };
        }
      } catch { /* ainda subindo */ }
      await sleep(250);
    }
    await this.stop();
    return { ok: false, error: "O servidor não respondeu a tempo." };
  }

  /** Desliga com salvamento: pede ao servidor para gravar todas as salas e sair; força só se travar. */
  async stop() {
    if (!this.child) {
      this.setStatus("stopped");
      return { ok: true };
    }
    if (this.status === "stopping") return { ok: true };
    this.setStatus("stopping");
    const child = this.child;
    const exited = new Promise((r) => child.once("exit", r));
    try {
      await this.admin("POST", "/admin/shutdown");
    } catch { /* se a API não responder, cai no encerramento forçado */ }
    const done = await Promise.race([exited.then(() => true), sleep(6000).then(() => false)]);
    if (!done) {
      this.log("O servidor não encerrou sozinho; forçando.", "error");
      try {
        spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true });
      } catch { /* ignore */ }
      await Promise.race([exited, sleep(3000)]);
    }
    return { ok: true };
  }

  /** Chamada à API de administração (somente 127.0.0.1, com token). */
  async admin(method, route, body) {
    if (!this.child || !this.adminPort) throw new Error("Servidor desligado.");
    const r = await fetch(`http://127.0.0.1:${this.adminPort}${route}`, {
      method,
      headers: { "x-admin-token": this.adminToken, "content-type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    return r.json();
  }
}

module.exports = { ServerManager, portInUse, freePort };
