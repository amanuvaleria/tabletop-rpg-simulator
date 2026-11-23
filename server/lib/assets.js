/**
 * Biblioteca de assets.
 *
 * Duas origens, mescladas em um catálogo único:
 *  1) PACOTES: pastas em packDirs. Cada pasta pode ter um pack.json (metadados
 *     completos) ou ser só um monte de imagens (categoria = nome da subpasta).
 *     Basta soltar a pasta lá: o servidor descobre sozinho, sem recompilar.
 *  2) UPLOADS do Mestre (userDir): salvos pelo hash do conteúdo, o que impede
 *     duplicatas acidentais mesmo com nomes diferentes.
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { inspectImage } = require("./imageinfo");
const { atomicWriteJson, readJson } = require("./storage");

const CATEGORIES = [
  { id: "tiles", label: "Pisos" },
  { id: "walls", label: "Paredes" },
  { id: "doors", label: "Portas" },
  { id: "windows", label: "Janelas" },
  { id: "stairs", label: "Escadas" },
  { id: "furniture", label: "Mobiliário" },
  { id: "investigation", label: "Investigação" },
  { id: "hospital", label: "Hospital e laboratório" },
  { id: "paranormal", label: "Paranormal" },
  { id: "nature", label: "Exteriores e natureza" },
  { id: "urban", label: "Urbano" },
  { id: "effects", label: "Efeitos" },
  { id: "tokens", label: "Tokens" },
  { id: "misc", label: "Outros" },
];
const CATEGORY_IDS = new Set(CATEGORIES.map((c) => c.id));
const IMAGE_EXT = new Set([".png", ".webp", ".svg"]);
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

function slug(s) {
  return (
    String(s || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 60) || "asset"
  );
}

function cleanTags(tags) {
  if (!Array.isArray(tags)) return [];
  const out = [];
  for (const t of tags) {
    const v = String(t || "").trim().toLowerCase().slice(0, 32);
    if (v && !out.includes(v)) out.push(v);
    if (out.length >= 24) break;
  }
  return out;
}

function cleanCategory(c) {
  return CATEGORY_IDS.has(c) ? c : "misc";
}

function cleanFootprint(fp) {
  if (!Array.isArray(fp) || fp.length !== 2) return null;
  const w = Number(fp[0]);
  const h = Number(fp[1]);
  if (!(w > 0 && h > 0) || w > 50 || h > 50) return null;
  return [w, h];
}

class AssetLibrary {
  /**
   * @param {{ packDirs: string[], userDir: string }} opts
   */
  constructor({ packDirs, userDir }) {
    this.packDirs = packDirs;
    this.userDir = userDir;
    this.userFilesDir = path.join(userDir, "files");
    this.userTrashDir = path.join(userDir, ".trash");
    this.userIndexFile = path.join(userDir, "index.json");
    fs.mkdirSync(this.userFilesDir, { recursive: true });
    this.hashCache = new Map(); // caminho -> { mtimeMs, size, sha256, info }
    this._cache = null;
    this._cacheAt = 0;
  }

  invalidate() {
    this._cache = null;
  }

  _fileMeta(file) {
    const st = fs.statSync(file);
    const hit = this.hashCache.get(file);
    if (hit && hit.mtimeMs === st.mtimeMs && hit.size === st.size) return hit;
    const buf = fs.readFileSync(file);
    const info = inspectImage(buf);
    const meta = {
      mtimeMs: st.mtimeMs,
      size: st.size,
      sha256: crypto.createHash("sha256").update(buf).digest("hex"),
      info,
    };
    this.hashCache.set(file, meta);
    return meta;
  }

  _walk(dir, rel = "") {
    const out = [];
    let entries = [];
    try {
      entries = fs.readdirSync(path.join(dir, rel), { withFileTypes: true });
    } catch {
      return out;
    }
    for (const e of entries) {
      if (e.name.startsWith(".")) continue;
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) out.push(...this._walk(dir, r));
      else out.push(r);
    }
    return out;
  }

  _scanPacks(warnings) {
    const packs = [];
    const assets = [];
    const seenPacks = new Set();
    for (const root of this.packDirs) {
      let dirs = [];
      try {
        dirs = fs.readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory() && !d.name.startsWith("."));
      } catch {
        continue;
      }
      for (const d of dirs) {
        const packId = slug(d.name);
        if (seenPacks.has(packId)) {
          warnings.push(`Pacote "${d.name}" ignorado: já existe outro com o mesmo id (${packId}).`);
          continue;
        }
        seenPacks.add(packId);
        const packDir = path.join(root, d.name);
        const manifest = readJson(path.join(packDir, "pack.json"), null);
        const files = this._walk(packDir);
        const urlBase = `/assets/packs/${encodeURIComponent(d.name)}/`;
        const urlOf = (rel) => urlBase + rel.split("/").map(encodeURIComponent).join("/");
        const pack = {
          id: packId,
          name: (manifest && manifest.name) || d.name,
          version: (manifest && manifest.version) || null,
          author: (manifest && manifest.author) || null,
          license: (manifest && manifest.license) || null,
          source: (manifest && manifest.source) || null,
          builtin: true,
          count: 0,
        };

        const addAsset = (rec) => {
          const full = path.join(packDir, rec.file);
          if (!fs.existsSync(full)) {
            warnings.push(`Pacote ${packId}: arquivo ausente "${rec.file}" (asset ${rec.id}).`);
            return;
          }
          let meta;
          try {
            meta = this._fileMeta(full);
          } catch (err) {
            warnings.push(`Pacote ${packId}: não foi possível ler "${rec.file}" (${err.message}).`);
            return;
          }
          if (!meta.info || meta.info.tooBig || meta.info.unsafe) {
            warnings.push(
              `Pacote ${packId}: "${rec.file}" ignorado (${
                !meta.info ? "formato inválido" : meta.info.tooBig ? "dimensões grandes demais" : "SVG inseguro: " + meta.info.unsafe
              }).`
            );
            return;
          }
          let model3d = null;
          if (rec.model) {
            if (fs.existsSync(path.join(packDir, rec.model))) model3d = { type: "glb", url: urlOf(rec.model) };
            else warnings.push(`Pacote ${packId}: modelo 3D ausente "${rec.model}" (asset ${rec.id}); usando só o sprite.`);
          }
          assets.push({
            id: `${packId}/${rec.id}`,
            name: rec.name,
            category: cleanCategory(rec.category),
            tags: cleanTags(rec.tags),
            pack: packId,
            source: "pack",
            url: urlOf(rec.file),
            width: meta.info.width,
            height: meta.info.height,
            alpha: meta.info.alpha,
            format: meta.info.format,
            sha256: meta.sha256,
            footprint: cleanFootprint(rec.footprint) || null,
            height3d: Number.isFinite(+rec.height) ? Math.max(0, Math.min(10, +rec.height)) : null,
            opacity: Number.isFinite(+rec.opacity) ? Math.max(0, Math.min(1, +rec.opacity)) : 1,
            model3d,
          });
          pack.count++;
        };

        if (manifest && Array.isArray(manifest.assets)) {
          const used = new Set();
          for (const a of manifest.assets) {
            if (!a || typeof a.file !== "string" || a.file.includes("..")) continue;
            const id = slug(a.id || path.basename(a.file, path.extname(a.file)));
            if (used.has(id)) {
              warnings.push(`Pacote ${packId}: id repetido "${id}" ignorado.`);
              continue;
            }
            used.add(id);
            addAsset({ ...a, id, name: String(a.name || id).slice(0, 80), file: a.file.replace(/\\/g, "/") });
          }
        } else {
          // Sem pack.json: indexa as imagens. Categoria = primeira subpasta, se for uma das conhecidas.
          const glbs = new Set(files.filter((f) => f.toLowerCase().endsWith(".glb")));
          for (const rel of files) {
            if (!IMAGE_EXT.has(path.extname(rel).toLowerCase())) continue;
            const parts = rel.split("/");
            const cat = parts.length > 1 && CATEGORY_IDS.has(parts[0].toLowerCase()) ? parts[0].toLowerCase() : "misc";
            const stem = rel.slice(0, rel.length - path.extname(rel).length);
            addAsset({
              id: slug(stem),
              name: path.basename(stem).replace(/[_-]+/g, " ").slice(0, 80),
              category: cat,
              tags: parts.length > 2 ? [slug(parts[parts.length - 2])] : [],
              file: rel,
              model: glbs.has(stem + ".glb") ? stem + ".glb" : null,
            });
          }
        }
        packs.push(pack);
      }
    }
    return { packs, assets };
  }

  _readUserIndex() {
    const idx = readJson(this.userIndexFile, null);
    return idx && typeof idx === "object" && idx.assets ? idx : { assets: {} };
  }

  _scanUploads(warnings) {
    const idx = this._readUserIndex();
    const assets = [];
    for (const [id, rec] of Object.entries(idx.assets)) {
      const full = path.join(this.userFilesDir, rec.file);
      if (!fs.existsSync(full)) {
        warnings.push(`Upload "${rec.name}" (${id}) está no índice mas o arquivo sumiu.`);
        continue;
      }
      assets.push({
        id,
        name: rec.name,
        category: cleanCategory(rec.category),
        tags: cleanTags(rec.tags),
        pack: "user",
        source: "upload",
        url: `/assets/user/${encodeURIComponent(rec.file)}`,
        width: rec.width,
        height: rec.height,
        alpha: rec.alpha,
        format: rec.format,
        sha256: rec.sha256,
        footprint: cleanFootprint(rec.footprint),
        height3d: null,
        opacity: 1,
        model3d: null,
        addedAt: rec.addedAt,
      });
    }
    return assets;
  }

  /** Catálogo completo (cache curto; invalidado em uploads/edições). */
  catalog({ refresh = false } = {}) {
    const now = Date.now();
    if (!refresh && this._cache && now - this._cacheAt < 3000) return this._cache;
    const warnings = [];
    const { packs, assets } = this._scanPacks(warnings);
    const uploads = this._scanUploads(warnings);
    const all = [...assets, ...uploads].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
    const byId = new Map(all.map((a) => [a.id, a]));
    const bySha = new Map();
    for (const a of all) if (a.sha256 && !bySha.has(a.sha256)) bySha.set(a.sha256, a);
    const userCount = uploads.length;
    const result = {
      categories: CATEGORIES,
      packs: [...packs, ...(userCount ? [{ id: "user", name: "Meus uploads", builtin: false, count: userCount }] : [])],
      assets: all,
      warnings,
      byId,
      bySha,
    };
    this._cache = result;
    this._cacheAt = now;
    return result;
  }

  /** Versão serializável (sem os Maps) para enviar ao cliente. */
  publicCatalog(opts) {
    const { byId: _a, bySha: _b, ...rest } = this.catalog(opts);
    return rest;
  }

  /**
   * Importa uma imagem enviada pelo Mestre.
   * @returns {{ok:true, asset}|{ok:false, error:string, duplicate?:object}}
   */
  upload({ name, category, tags, footprint, data }) {
    if (!Buffer.isBuffer(data)) return { ok: false, error: "Arquivo inválido." };
    if (data.length === 0) return { ok: false, error: "Arquivo vazio." };
    if (data.length > MAX_UPLOAD_BYTES) return { ok: false, error: "Arquivo maior que 5 MB." };
    const info = inspectImage(data);
    if (!info) return { ok: false, error: "Formato não suportado (use PNG, WebP ou SVG válidos)." };
    if (info.tooBig) return { ok: false, error: "Dimensões acima de 8192 px." };
    if (info.unsafe) return { ok: false, error: `SVG recusado por segurança: ${info.unsafe}.` };

    const sha256 = crypto.createHash("sha256").update(data).digest("hex");
    const existing = this.catalog({ refresh: true }).bySha.get(sha256);
    if (existing) return { ok: false, error: "Esta imagem já está na biblioteca.", duplicate: existing };

    const base = String(name || "asset").replace(/\.[^.]+$/, "").trim().slice(0, 80) || "asset";
    const id = `user/${slug(base)}-${sha256.slice(0, 8)}`;
    const file = `${sha256}.${info.ext}`;
    fs.writeFileSync(path.join(this.userFilesDir, file), data);
    const idx = this._readUserIndex();
    idx.assets[id] = {
      name: base,
      category: cleanCategory(category),
      tags: cleanTags(tags),
      footprint: cleanFootprint(footprint),
      file,
      width: info.width,
      height: info.height,
      alpha: info.alpha,
      format: info.format,
      sha256,
      addedAt: Date.now(),
    };
    atomicWriteJson(this.userIndexFile, idx);
    this.invalidate();
    return { ok: true, asset: this.catalog({ refresh: true }).byId.get(id) };
  }

  /** Edita nome/categoria/tags de um upload (pacotes são somente leitura). */
  updateUpload(id, patch) {
    const idx = this._readUserIndex();
    const rec = idx.assets[id];
    if (!rec) return { ok: false, error: "Só uploads podem ser editados (pacotes são somente leitura)." };
    if (typeof patch.name === "string" && patch.name.trim()) rec.name = patch.name.trim().slice(0, 80);
    if (patch.category !== undefined) rec.category = cleanCategory(patch.category);
    if (patch.tags !== undefined) rec.tags = cleanTags(patch.tags);
    if (patch.footprint !== undefined) rec.footprint = cleanFootprint(patch.footprint);
    atomicWriteJson(this.userIndexFile, idx);
    this.invalidate();
    return { ok: true, asset: this.catalog({ refresh: true }).byId.get(id) };
  }

  /** Remove um upload (arquivo vai para .trash, não é apagado de vez). */
  deleteUpload(id) {
    const idx = this._readUserIndex();
    const rec = idx.assets[id];
    if (!rec) return { ok: false, error: "Só uploads podem ser removidos." };
    delete idx.assets[id];
    atomicWriteJson(this.userIndexFile, idx);
    // O arquivo é por hash: só some de files/ se nenhum outro registro o usa.
    const stillUsed = Object.values(idx.assets).some((r) => r.file === rec.file);
    if (!stillUsed) {
      fs.mkdirSync(this.userTrashDir, { recursive: true });
      try {
        fs.renameSync(path.join(this.userFilesDir, rec.file), path.join(this.userTrashDir, `${Date.now()}-${rec.file}`));
      } catch { /* arquivo já não existia */ }
    }
    this.invalidate();
    return { ok: true };
  }
}

module.exports = { AssetLibrary, CATEGORIES, CATEGORY_IDS, MAX_UPLOAD_BYTES, slug };
