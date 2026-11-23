/**
 * Gera o programa para Windows em launcher/dist/Tabletop Mestre-win32-x64/ (pasta portátil com o .exe).
 *   1) compila o site (web/dist)
 *   2) monta uma pasta "stage" só com o necessário: servidor (sem node_modules de desenvolvimento), site e pacotes de assets
 *   3) empacota com o Electron
 * Uso: npm run build   (na pasta launcher)
 */
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const root = path.join(__dirname, "..");
const stage = path.join(__dirname, "stage", "tabletop");
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const run = (cmd, cwd) => execSync(cmd, { cwd, stdio: "inherit", shell: true });

(async () => {
  console.log("\n[1/4] Compilando o site…");
  run(`${npm} run build`, path.join(root, "web"));

  console.log("\n[2/4] Montando os arquivos do servidor…");
  fs.rmSync(path.join(__dirname, "stage"), { recursive: true, force: true });
  fs.mkdirSync(stage, { recursive: true });
  const copy = (from, to, filter) => fs.cpSync(from, to, { recursive: true, filter });
  copy(path.join(root, "server"), path.join(stage, "server"), (s) => !/[\\/](node_modules|data)([\\/]|$)/.test(s));
  run(`${npm} install --omit=dev --no-audit --no-fund`, path.join(stage, "server"));
  copy(path.join(root, "web", "dist"), path.join(stage, "web", "dist"));
  const packs = path.join(root, "web", "public", "assets", "packs");
  fs.mkdirSync(path.join(stage, "web", "public", "assets", "packs"), { recursive: true });
  if (fs.existsSync(packs)) copy(packs, path.join(stage, "web", "public", "assets", "packs"));
  // modelos 3D (GLB) do pacote Kenney vivem em web/dist/models (copiados do public pelo build)

  console.log("\n[3/4] Empacotando com o Electron…");
  const { packager } = await import("@electron/packager");
  const out = path.join(__dirname, "dist");
  fs.rmSync(out, { recursive: true, force: true });
  const paths = await packager({
    dir: __dirname,
    out,
    name: "Tabletop Mestre",
    platform: "win32",
    arch: "x64",
    overwrite: true,
    asar: true,
    prune: true,
    extraResource: [stage],
    ignore: [/^\/(dist|stage|build\.js|smoke\.js|\.gitignore)($|\/)/, /^\/node_modules\/\.cache/],
    win32metadata: { ProductName: "Tabletop Mestre", FileDescription: "Painel do Mestre do Tabletop RPG" },
  });

  console.log("\n[4/4] Pronto:");
  for (const p of paths) console.log("  " + p);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
