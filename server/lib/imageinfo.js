/**
 * Leitura de metadados de imagem sem dependências: formato real (pelos bytes,
 * nunca pelo nome/mime enviado), dimensões e presença de transparência.
 * Suporta PNG, WebP e SVG.
 */

const MAX_DIMENSION = 8192;

function pngInfo(buf) {
  if (buf.length < 33 || buf.readUInt32BE(0) !== 0x89504e47 || buf.readUInt32BE(4) !== 0x0d0a1a0a) return null;
  if (buf.toString("ascii", 12, 16) !== "IHDR") return null;
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  const colorType = buf[25];
  let alpha = colorType === 4 || colorType === 6;
  // PNG indexado/cinza pode ter transparência via chunk tRNS
  let off = 8;
  while (!alpha && off + 8 <= buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString("ascii", off + 4, off + 8);
    if (type === "tRNS") alpha = true;
    if (type === "IDAT" || type === "IEND") break;
    off += 12 + len;
  }
  return { format: "png", mime: "image/png", ext: "png", width, height, alpha };
}

function webpInfo(buf) {
  if (buf.length < 30 || buf.toString("ascii", 0, 4) !== "RIFF" || buf.toString("ascii", 8, 12) !== "WEBP") return null;
  const kind = buf.toString("ascii", 12, 16);
  let width, height, alpha = false;
  if (kind === "VP8 ") {
    width = buf.readUInt16LE(26) & 0x3fff;
    height = buf.readUInt16LE(28) & 0x3fff;
  } else if (kind === "VP8L") {
    if (buf[20] !== 0x2f) return null;
    const b = buf.readUInt32LE(21);
    width = (b & 0x3fff) + 1;
    height = ((b >> 14) & 0x3fff) + 1;
    alpha = ((b >> 28) & 1) === 1;
  } else if (kind === "VP8X") {
    alpha = (buf[20] & 0x10) !== 0;
    width = 1 + buf.readUIntLE(24, 3);
    height = 1 + buf.readUIntLE(27, 3);
  } else {
    return null;
  }
  return { format: "webp", mime: "image/webp", ext: "webp", width, height, alpha };
}

/** SVG pode conter script/links externos: rejeitamos em vez de tentar "limpar". */
function svgUnsafeReason(text) {
  if (/<\s*script/i.test(text)) return "contém <script>";
  if (/<\s*foreignObject/i.test(text)) return "contém <foreignObject>";
  if (/\son[a-z]+\s*=/i.test(text)) return "contém atributos de evento (onclick etc.)";
  if (/javascript\s*:/i.test(text)) return "contém javascript:";
  if (/<\s*(iframe|embed|object)/i.test(text)) return "contém conteúdo embutido";
  if (/(?:xlink:)?href\s*=\s*["']\s*(?:https?:)?\/\//i.test(text)) return "referencia recurso externo";
  if (/<!ENTITY/i.test(text)) return "contém entidades XML";
  return null;
}

function svgInfo(buf) {
  if (buf.length > 2e6) return null;
  const text = buf.toString("utf8");
  const m = text.match(/<svg\b[^>]*>/i);
  if (!m) return null;
  const tag = m[0];
  const unsafe = svgUnsafeReason(text);
  const num = (name) => {
    const r = tag.match(new RegExp(`\\s${name}\\s*=\\s*["']\\s*([0-9.]+)\\s*(?:px)?\\s*["']`, "i"));
    return r ? parseFloat(r[1]) : null;
  };
  let width = num("width");
  let height = num("height");
  const vb = tag.match(/viewBox\s*=\s*["']\s*[-0-9.]+[ ,]+[-0-9.]+[ ,]+([0-9.]+)[ ,]+([0-9.]+)/i);
  if ((!width || !height) && vb) {
    width = width || parseFloat(vb[1]);
    height = height || parseFloat(vb[2]);
  }
  width = Math.round(width || 256);
  height = Math.round(height || 256);
  return { format: "svg", mime: "image/svg+xml", ext: "svg", width, height, alpha: true, unsafe };
}

/**
 * @returns {{format,mime,ext,width,height,alpha,unsafe?:string|null} | null}
 */
function inspectImage(buf) {
  if (!Buffer.isBuffer(buf)) return null;
  const info = pngInfo(buf) || webpInfo(buf) || svgInfo(buf);
  if (!info) return null;
  if (!(info.width > 0 && info.height > 0)) return null;
  if (info.width > MAX_DIMENSION || info.height > MAX_DIMENSION) return { ...info, tooBig: true };
  return info;
}

module.exports = { inspectImage, MAX_DIMENSION };
