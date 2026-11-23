import * as THREE from "three";
import type { AssetDef } from "../types";
import { assetUrl } from "../multiplayer";

/**
 * Cache de texturas dos sprites: cada imagem é baixada e enviada à GPU uma única vez,
 * não importa quantos sprites a usem. Só carrega o que o mapa realmente usa.
 */
const cache = new Map<string, Promise<THREE.Texture | null>>();

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("falha ao carregar " + url));
    img.src = url;
  });
}

async function build(asset: AssetDef): Promise<THREE.Texture | null> {
  try {
    const img = await loadImage(assetUrl(asset.url));
    let tex: THREE.Texture;
    if (asset.format === "svg") {
      // SVG vira bitmap em boa resolução (lado maior = 1024 px) para não ficar borrado quando ampliado.
      const k = 1024 / Math.max(asset.width, asset.height);
      const c = document.createElement("canvas");
      c.width = Math.max(1, Math.round(asset.width * k));
      c.height = Math.max(1, Math.round(asset.height * k));
      c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
      tex = new THREE.CanvasTexture(c);
    } else {
      tex = new THREE.Texture(img);
    }
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    tex.needsUpdate = true;
    return tex;
  } catch {
    return null;
  }
}

/** Texturas por id+arquivo (se o conteúdo mudar o hash muda e o cache é ignorado). */
export function getAssetTexture(asset: AssetDef): Promise<THREE.Texture | null> {
  const key = `${asset.id}|${asset.sha256}`;
  let p = cache.get(key);
  if (!p) {
    p = build(asset);
    cache.set(key, p);
  }
  return p;
}

// Placeholder para assets ausentes: retângulo vermelho tracejado com o nome do asset.
const missingCache = new Map<string, THREE.CanvasTexture>();
export function getMissingTexture(label: string): THREE.CanvasTexture {
  const hit = missingCache.get(label);
  if (hit) return hit;
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 256;
  const x = c.getContext("2d")!;
  x.fillStyle = "rgba(120,20,20,0.35)";
  x.fillRect(0, 0, 256, 256);
  x.strokeStyle = "#ff6b6b";
  x.lineWidth = 6;
  x.setLineDash([22, 14]);
  x.strokeRect(6, 6, 244, 244);
  x.setLineDash([]);
  x.fillStyle = "#ffb3b3";
  x.font = "bold 120px system-ui, sans-serif";
  x.textAlign = "center";
  x.fillText("?", 128, 150);
  x.font = "bold 22px system-ui, sans-serif";
  const text = label.length > 22 ? label.slice(0, 21) + "…" : label;
  x.fillText(text, 128, 215);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  missingCache.set(label, t);
  return t;
}
