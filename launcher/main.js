const { app, BrowserWindow, ipcMain, dialog, shell, Menu } = require("electron");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");
const { ServerManager } = require("./lib/server-manager");
const { Tunnel, findCloudflared } = require("./lib/tunnel");
const { addFiles, addPackFolder, safeName } = require("./lib/assets-import");

// ---------------------------------------------------------------- caminhos
// Empacotado: o servidor e o site ficam em <app>/resources/tabletop. Em desenvolvimento, na raiz do projeto.
const APP_ROOT = app.isPackaged ? path.join(process.resourcesPath, "tabletop") : path.join(__dirname, "..");
const SERVER_DIR = path.join(APP_ROOT, "server");
const SERVER_LIB = path.join(SERVER_DIR, "lib");
const BUILTIN_PACKS = path.join(APP_ROOT, "web", "public", "assets", "packs");
const CATEGORIES = [
  ["tiles", "Pisos"], ["walls", "Paredes"], ["doors", "Portas"], ["windows", "Janelas"], ["stairs", "Escadas"],
  ["furniture", "Mobiliário"], ["investigation", "Investigação"], ["hospital", "Hospital e laboratório"],
  ["paranormal", "Paranormal"], ["nature", "Exteriores e natureza"], ["urban", "Urbano"], ["effects", "Efeitos"],
  ["tokens", "Tokens"], ["misc", "Outros"],
];

const SMOKE = process.argv.find((a) => a.startsWith("--smoke="));

// Em testes, cada execução usa uma pasta de configuração própria para não mexer na do usuário.
if (SMOKE) app.setPath("userData", path.join(SMOKE.slice(8), "userdata"));

const settingsFile = () => path.join(app.getPath("userData"), "settings.json");

function defaultDataDir() {
  if (!app.isPackaged) return path.join(SERVER_DIR, "data");
  const beside = path.join(path.dirname(process.execPath), "dados");
  try {
    fs.mkdirSync(beside, { recursive: true });
    fs.accessSync(beside, fs.constants.W_OK);
    return beside;
  } catch {
    return path.join(app.getPath("userData"), "data");
  }
}

function loadSettings() {
  let s = {};
  try { s = JSON.parse(fs.readFileSync(settingsFile(), "utf8")); } catch { /* primeira execução */ }
  return {
    port: Number.isInteger(s.port) ? s.port : 4000,
    autoStart: s.autoStart === true,
    dataDir: typeof s.dataDir === "string" && s.dataDir ? s.dataDir : defaultDataDir(),
  };
}
let settings;
function saveSettings(patch) {
  settings = { ...settings, ...patch };
  fs.mkdirSync(path.dirname(settingsFile()), { recursive: true });
  fs.writeFileSync(settingsFile(), JSON.stringify(settings, null, 2));
}

const packsDir = () => path.join(settings.dataDir, "packs");
const configFile = () => path.join(settings.dataDir, "config.json");

function readMasterConfig() {
  try {
    const c = JSON.parse(fs.readFileSync(configFile(), "utf8"));
    return { masterName: String(c.masterName || ""), masterPin: String(c.masterPin || "") };
  } catch {
    return { masterName: "", masterPin: "" };
  }
}

function lanAddresses(port) {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const i of list || []) if (i.family === "IPv4" && !i.internal) out.push(`http://${i.address}:${port}`);
  }
  return out;
}

// ---------------------------------------------------------------- serviços
const server = new ServerManager({ serverDir: SERVER_DIR });
const tunnel = new Tunnel();
let win = null;
const send = (ch, payload) => win && !win.isDestroyed() && win.webContents.send(ch, payload);
server.on("status", (s) => {
  send("server:status", s);
  if (s.status === "stopped" && tunnel.child) tunnel.stop(); // sem servidor o link público não serve para nada
});
server.on("log", (e) => send("server:log", e));
tunnel.on("status", (s) => send("tunnel:status", s));

async function snapshot() {
  return {
    settings,
    server: server.snapshot(),
    tunnel: tunnel.snapshot(),
    localUrl: `http://localhost:${settings.port}`,
    lan: lanAddresses(settings.port),
    packsDir: packsDir(),
    categories: CATEGORIES.map(([id, label]) => ({ id, label })),
    master: readMasterConfig(),
    version: app.getVersion(),
    packaged: app.isPackaged,
  };
}

async function listAssets() {
  const { AssetLibrary } = require(path.join(SERVER_LIB, "assets.js"));
  const lib = new AssetLibrary({ packDirs: [BUILTIN_PACKS, packsDir()], userDir: path.join(settings.dataDir, "assets") });
  const cat = lib.publicCatalog({ refresh: true });
  const custom = new Set();
  try {
    for (const d of fs.readdirSync(packsDir(), { withFileTypes: true })) if (d.isDirectory() && !d.name.startsWith(".")) custom.add(d.name);
  } catch { /* sem pacotes ainda */ }
  const fileOf = (a) => {
    if (a.source === "upload") return path.join(settings.dataDir, "assets", "files", decodeURIComponent(a.url.split("/").pop()));
    const rel = a.url.replace(/^\/assets\/packs\//, "").split("/").map(decodeURIComponent);
    for (const root of [packsDir(), BUILTIN_PACKS]) {
      const f = path.join(root, ...rel);
      if (fs.existsSync(f)) return f;
    }
    return null;
  };
  return {
    packs: cat.packs.map((p) => ({ ...p, removable: [...custom].some((n) => n.toLowerCase().replace(/[^a-z0-9]+/g, "_") === p.id) })),
    assets: cat.assets.slice(0, 600).map((a) => ({ id: a.id, name: a.name, category: a.category, pack: a.pack, tags: a.tags, w: a.width, h: a.height, file: fileOf(a) })),
    total: cat.assets.length,
    warnings: cat.warnings,
  };
}

async function refreshServerAssets() {
  try { if (server.status === "running") await server.admin("POST", "/admin/assets/refresh"); } catch { /* servidor ocupado: o catálogo se atualiza sozinho em instantes */ }
}

function backupData() {
  const stamp = new Date().toISOString().replace(/[:T]/g, "-").slice(0, 19);
  const dest = path.join(path.dirname(settings.dataDir), "backups", `dados-${stamp}`);
  if (!fs.existsSync(settings.dataDir)) return { ok: false, error: "A pasta de dados ainda não existe (ligue o servidor ao menos uma vez)." };
  fs.mkdirSync(dest, { recursive: true });
  fs.cpSync(settings.dataDir, dest, { recursive: true, filter: (s) => !/[\\/]\.trash([\\/]|$)/.test(s) });
  return { ok: true, path: dest };
}

// ---------------------------------------------------------------- IPC
const handlers = {
  "state:get": () => snapshot(),

  "server:start": async () => {
    fs.mkdirSync(settings.dataDir, { recursive: true });
    const r = await server.start({ port: settings.port, dataDir: settings.dataDir });
    if (r.ok) {
      // reaplica a senha/nome do Mestre gravados (o servidor lê o arquivo ao iniciar; isto é só garantia)
      const m = readMasterConfig();
      try { await server.admin("POST", "/admin/config", m); } catch { /* ok */ }
    }
    return r;
  },
  "server:stop": () => server.stop(),

  "settings:set": async (_e, patch = {}) => {
    const next = {};
    if (patch.port !== undefined) {
      if (server.status !== "stopped") return { ok: false, error: "Desligue o servidor antes de trocar a porta." };
      const p = Number(patch.port);
      if (!Number.isInteger(p) || p < 1024 || p > 65535) return { ok: false, error: "Porta inválida (1024 a 65535)." };
      next.port = p;
    }
    if (patch.autoStart !== undefined) next.autoStart = !!patch.autoStart;
    saveSettings(next);
    return { ok: true, snapshot: await snapshot() };
  },

  "data:choose": async () => {
    if (server.status !== "stopped") return { ok: false, error: "Desligue o servidor antes de trocar a pasta de dados." };
    const r = await dialog.showOpenDialog(win, { title: "Escolha a pasta de dados", properties: ["openDirectory", "createDirectory"] });
    if (r.canceled || !r.filePaths[0]) return { ok: false, canceled: true };
    saveSettings({ dataDir: r.filePaths[0] });
    return { ok: true, snapshot: await snapshot() };
  },
  "data:open": () => shell.openPath(settings.dataDir).then((e) => ({ ok: !e, error: e || undefined })),
  "data:backup": () => {
    try { return backupData(); } catch (e) { return { ok: false, error: e.message }; }
  },

  "tunnel:start": () => {
    if (server.status !== "running") return { ok: false, error: "Ligue o servidor primeiro." };
    return tunnel.start(settings.port);
  },
  "tunnel:stop": () => tunnel.stop(),
  "tunnel:install": () => {
    const c = spawn(
      "winget",
      ["install", "--id", "Cloudflare.cloudflared", "-e", "--silent", "--accept-package-agreements", "--accept-source-agreements"],
      { windowsHide: true }
    );
    server.log("Instalando cloudflared pelo winget…");
    c.stdout.on("data", (d) => server.log("[winget] " + d.toString().trim()));
    c.stderr.on("data", (d) => server.log("[winget] " + d.toString().trim(), "error"));
    c.on("exit", (code) => {
      server.log(code === 0 ? "cloudflared instalado." : `winget terminou com código ${code}.`, code === 0 ? "info" : "error");
      send("tunnel:status", tunnel.snapshot());
    });
    c.on("error", () => server.log("winget não encontrado neste computador.", "error"));
    return { ok: true };
  },

  "master:save": async (_e, { masterName = "", masterPin = "" } = {}) => {
    const cfg = { masterName: String(masterName).trim().slice(0, 32), masterPin: String(masterPin).slice(0, 64) };
    fs.mkdirSync(settings.dataDir, { recursive: true });
    fs.writeFileSync(configFile(), JSON.stringify(cfg));
    if (server.status === "running") {
      try { await server.admin("POST", "/admin/config", cfg); } catch (e) { return { ok: false, error: e.message }; }
    }
    return { ok: true, master: cfg };
  },
  "rooms:get": async () => {
    if (server.status !== "running") return { ok: false, offline: true };
    try { return await server.admin("GET", "/admin/state"); } catch (e) { return { ok: false, error: e.message }; }
  },
  "rooms:master": async (_e, p) => {
    try { return await server.admin("POST", "/admin/master", { roomId: p.roomId, socketId: p.socketId }); } catch (e) { return { ok: false, error: e.message }; }
  },
  "rooms:kick": async (_e, p) => {
    try { return await server.admin("POST", "/admin/kick", { roomId: p.roomId, socketId: p.socketId }); } catch (e) { return { ok: false, error: e.message }; }
  },

  "assets:list": () => listAssets(),
  "assets:addFiles": async (_e, { packName, category }) => {
    const r = await dialog.showOpenDialog(win, {
      title: "Escolha as imagens (PNG, WebP ou SVG)",
      properties: ["openFile", "multiSelections"],
      filters: [{ name: "Imagens", extensions: ["png", "webp", "svg"] }],
    });
    if (r.canceled || !r.filePaths.length) return { ok: false, canceled: true };
    return handlers["assets:addPaths"](null, { packName, category, files: r.filePaths });
  },
  "assets:addPaths": async (_e, { packName, category, files }) => {
    try {
      const res = addFiles({ files, packName, category, packsDir: packsDir(), serverLib: SERVER_LIB, categories: CATEGORIES.map((c) => c[0]) });
      if (res.added.length) await refreshServerAssets();
      return { ok: true, ...res };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  },
  "assets:addPack": async () => {
    const r = await dialog.showOpenDialog(win, { title: "Escolha a pasta do pacote de assets", properties: ["openDirectory"] });
    if (r.canceled || !r.filePaths[0]) return { ok: false, canceled: true };
    const res = addPackFolder({ folder: r.filePaths[0], packsDir: packsDir() });
    if (res.ok) await refreshServerAssets();
    return res;
  },
  "assets:removePack": async (_e, { name }) => {
    const dir = path.join(packsDir(), safeName(name, "x"));
    // só remove pastas que existam dentro de <dados>/packs; vai para .trash (recuperável)
    const real = fs.existsSync(dir) ? fs.realpathSync(dir) : null;
    if (!real || path.dirname(real) !== fs.realpathSync(packsDir())) return { ok: false, error: "Pacote não encontrado." };
    const trash = path.join(settings.dataDir, ".trash-packs");
    fs.mkdirSync(trash, { recursive: true });
    fs.renameSync(real, path.join(trash, `${Date.now()}-${path.basename(real)}`));
    await refreshServerAssets();
    return { ok: true };
  },
  "assets:openDir": () => {
    fs.mkdirSync(packsDir(), { recursive: true });
    return shell.openPath(packsDir()).then((e) => ({ ok: !e, error: e || undefined }));
  },

  "open:url": (_e, url) => {
    // só abre endereços que o próprio programa mostra (jogo local, rede local e link público)
    if (!/^https?:\/\/(localhost|127\.0\.0\.1|(\d{1,3}\.){3}\d{1,3}|[a-z0-9-]+\.trycloudflare\.com)(:\d+)?(\/|$)/i.test(String(url))) return { ok: false };
    shell.openExternal(url);
    return { ok: true };
  },
  "logs:get": () => server.logs,
  "logs:clear": () => { server.logs.length = 0; return { ok: true }; },
};

for (const [channel, fn] of Object.entries(handlers)) ipcMain.handle(channel, (e, arg) => fn(e, arg));

// ---------------------------------------------------------------- janela
function createWindow() {
  win = new BrowserWindow({
    width: 1000,
    height: 740,
    minWidth: 820,
    minHeight: 560,
    backgroundColor: "#161210",
    title: "Tabletop RPG — Painel do Mestre",
    show: !SMOKE,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  Menu.setApplicationMenu(null);
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.webContents.on("will-navigate", (e) => e.preventDefault());
  win.loadFile(path.join(__dirname, "renderer", "index.html"));

  let closing = false;
  win.on("close", async (e) => {
    if (closing || SMOKE) return;
    if (server.status === "running" || server.status === "starting") {
      e.preventDefault();
      const r = await dialog.showMessageBox(win, {
        type: "question",
        buttons: ["Desligar e sair", "Continuar aberto"],
        defaultId: 1,
        cancelId: 1,
        title: "Servidor ligado",
        message: "O servidor está ligado.",
        detail: "Se você sair, os jogadores serão desconectados. As salas são salvas antes de desligar.",
      });
      if (r.response !== 0) return;
    }
    e.preventDefault();
    closing = true;
    tunnel.stop();
    await server.stop();
    win.destroy();
  });
}

const gotLock = SMOKE ? true : app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });
  app.whenReady().then(async () => {
    settings = loadSettings();
    createWindow();
    if (SMOKE) {
      await new Promise((r) => win.webContents.once("did-finish-load", r));
      const { runSmoke } = require("./smoke");
      await runSmoke({ outDir: SMOKE.slice(8), win, handlers, server, tunnel, saveSettings, getSettings: () => settings, findCloudflared, APP_ROOT });
      return;
    }
    if (settings.autoStart) handlers["server:start"]();
  });
  app.on("window-all-closed", () => app.quit());
}
