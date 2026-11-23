/**
 * Adiciona assets à biblioteca copiando arquivos para <dados>/packs/<pacote>/<categoria>/.
 * O servidor descobre sozinho (pastas de pacotes são varridas), sem recompilar nada.
 * Reaproveita as mesmas verificações do servidor (formato real, tamanho, SVG seguro, duplicatas).
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

function safeName(s, fallback) {
  const v = String(s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9 ._-]+/g, "_")
    .replace(/^[ ._]+|[ ._]+$/g, "")
    .slice(0, 60);
  return v || fallback;
}

/** Hashes (sha256) de todas as imagens que já existem nos pacotes, para evitar duplicatas. */
function existingHashes(packsDir) {
  const set = new Set();
  const walk = (dir) => {
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (/\.(png|webp|svg)$/i.test(e.name)) {
        try { set.add(crypto.createHash("sha256").update(fs.readFileSync(full)).digest("hex")); } catch { /* ignore */ }
      }
    }
  };
  walk(packsDir);
  return set;
}

/**
 * @param {{ files: string[], packName: string, category: string, packsDir: string, serverLib: string, categories: string[] }} o
 * @returns {{ added: string[], skipped: {file:string, reason:string}[] }}
 */
function addFiles({ files, packName, category, packsDir, serverLib, categories }) {
  const { inspectImage } = require(path.join(serverLib, "imageinfo.js"));
  const cat = categories.includes(category) ? category : "misc";
  const pack = safeName(packName, "Meus assets");
  const destDir = path.join(packsDir, pack, cat);
  fs.mkdirSync(destDir, { recursive: true });
  const hashes = existingHashes(packsDir);
  const added = [];
  const skipped = [];

  for (const file of files) {
    const base = path.basename(file);
    let buf;
    try {
      buf = fs.readFileSync(file);
    } catch (e) {
      skipped.push({ file: base, reason: "não foi possível ler (" + e.message + ")" });
      continue;
    }
    if (buf.length > 5 * 1024 * 1024) { skipped.push({ file: base, reason: "maior que 5 MB" }); continue; }
    const info = inspectImage(buf);
    if (!info) { skipped.push({ file: base, reason: "não é um PNG, WebP ou SVG válido" }); continue; }
    if (info.tooBig) { skipped.push({ file: base, reason: "dimensões acima de 8192 px" }); continue; }
    if (info.unsafe) { skipped.push({ file: base, reason: "SVG inseguro (" + info.unsafe + ")" }); continue; }
    const sha = crypto.createHash("sha256").update(buf).digest("hex");
    if (hashes.has(sha)) { skipped.push({ file: base, reason: "imagem idêntica já existe na biblioteca" }); continue; }

    // nome do arquivo: mantém o original (sem acentos); se já existir com outro conteúdo, numera
    const stem = safeName(path.basename(base, path.extname(base)), "asset");
    let name = `${stem}.${info.ext}`;
    for (let n = 2; fs.existsSync(path.join(destDir, name)); n++) name = `${stem}_${n}.${info.ext}`;
    fs.writeFileSync(path.join(destDir, name), buf);
    hashes.add(sha);
    added.push(`${pack}/${cat}/${name}`);
  }
  return { added, skipped, pack, category: cat };
}

/** Copia uma pasta inteira de pacote (com pack.json e/ou imagens) para <dados>/packs. */
function addPackFolder({ folder, packsDir }) {
  const name = safeName(path.basename(folder), "pacote");
  const dest = path.join(packsDir, name);
  if (fs.existsSync(dest)) return { ok: false, error: `Já existe um pacote chamado "${name}". Renomeie a pasta e tente de novo.` };
  let hasImage = false;
  const check = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory()) check(path.join(dir, e.name));
      else if (/\.(png|webp|svg)$/i.test(e.name)) hasImage = true;
    }
  };
  try {
    check(folder);
  } catch (e) {
    return { ok: false, error: "Não consegui ler a pasta: " + e.message };
  }
  if (!hasImage) return { ok: false, error: "A pasta não tem nenhuma imagem PNG, WebP ou SVG." };
  fs.mkdirSync(packsDir, { recursive: true });
  fs.cpSync(folder, dest, { recursive: true, filter: (src) => !/[\\/](node_modules|\.git)([\\/]|$)/.test(src) });
  return { ok: true, name };
}

module.exports = { addFiles, addPackFolder, safeName };
