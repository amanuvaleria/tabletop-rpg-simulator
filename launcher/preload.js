const { contextBridge, ipcRenderer, webUtils } = require("electron");

// Só estes canais são expostos à página (que não tem acesso ao Node).
const INVOKE = new Set([
  "state:get", "server:start", "server:stop", "settings:set", "data:choose", "data:open", "data:backup",
  "tunnel:start", "tunnel:stop", "tunnel:install", "master:save", "rooms:get", "rooms:master", "rooms:kick",
  "assets:list", "assets:addFiles", "assets:addPaths", "assets:addPack", "assets:removePack", "assets:openDir",
  "open:url", "logs:get", "logs:clear",
]);
const EVENTS = new Set(["server:status", "server:log", "tunnel:status"]);

contextBridge.exposeInMainWorld("tabletop", {
  invoke: (channel, arg) => {
    if (!INVOKE.has(channel)) return Promise.reject(new Error("canal não permitido: " + channel));
    return ipcRenderer.invoke(channel, arg);
  },
  on: (channel, cb) => {
    if (!EVENTS.has(channel)) return;
    ipcRenderer.on(channel, (_e, payload) => cb(payload));
  },
  // caminhos reais de arquivos soltos na janela (arrastar e soltar)
  pathsOf: (files) => Array.from(files).map((f) => webUtils.getPathForFile(f)),
});
