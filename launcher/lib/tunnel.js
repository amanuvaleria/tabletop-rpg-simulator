const { spawn } = require("child_process");
const { EventEmitter } = require("events");
const fs = require("fs");
const path = require("path");

/** Localiza o cloudflared.exe (PATH ou pastas de instalação conhecidas). */
function findCloudflared() {
  const candidates = [
    process.env.CLOUDFLARED_PATH,
    path.join(process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)", "cloudflared", "cloudflared.exe"),
    path.join(process.env.ProgramFiles || "C:\\Program Files", "cloudflared", "cloudflared.exe"),
    path.join(process.env.LOCALAPPDATA || "", "Microsoft", "WinGet", "Links", "cloudflared.exe"),
  ].filter(Boolean);
  for (const c of candidates) if (fs.existsSync(c)) return c;
  for (const dir of (process.env.PATH || "").split(path.delimiter)) {
    const f = path.join(dir, "cloudflared.exe");
    if (dir && fs.existsSync(f)) return f;
  }
  return null;
}

/** Link público temporário (Cloudflare Quick Tunnel) apontando para a porta do jogo. */
class Tunnel extends EventEmitter {
  constructor() {
    super();
    this.child = null;
    this.status = "stopped"; // stopped | starting | running
    this.url = null;
    this.logs = [];
  }

  snapshot() {
    return { status: this.status, url: this.url, installed: !!findCloudflared() };
  }

  _set(status, url = this.url) {
    this.status = status;
    this.url = url;
    this.emit("status", this.snapshot());
  }

  start(port) {
    if (this.child) return { ok: false, error: "O link público já está ligado." };
    const exe = findCloudflared();
    if (!exe) return { ok: false, error: "cloudflared não está instalado.", needInstall: true };
    this.url = null;
    this._set("starting", null);
    const child = spawn(exe, ["tunnel", "--url", `http://localhost:${port}`, "--no-autoupdate"], { windowsHide: true });
    this.child = child;
    const onData = (d) => {
      const text = d.toString("utf8");
      this.logs.push(text.trim());
      if (this.logs.length > 200) this.logs.shift();
      const m = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i);
      if (m && !this.url) this._set("running", m[0]);
    };
    child.stdout.on("data", onData);
    child.stderr.on("data", onData);
    child.on("exit", () => {
      this.child = null;
      this._set("stopped", null);
    });
    child.on("error", (err) => {
      this.logs.push("erro: " + err.message);
      this.child = null;
      this._set("stopped", null);
    });
    return { ok: true };
  }

  stop() {
    if (!this.child) return { ok: true };
    const pid = this.child.pid;
    try {
      spawn("taskkill", ["/PID", String(pid), "/T", "/F"], { windowsHide: true });
    } catch { /* ignore */ }
    return { ok: true };
  }
}

module.exports = { Tunnel, findCloudflared };
