import * as THREE from "three";

/**
 * Texturas procedurais (geradas em canvas, sem arquivos externos).
 * Cada material tem mapa de cor + mapa de relevo (bump) para pegar luz rasante.
 */

export type TexKind = "wood" | "woodDark" | "stone" | "plaster" | "thatch" | "shingle" | "grass" | "dirt" | "cobble" | "moss";

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const S = 256;

function mk(): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement("canvas");
  c.width = c.height = S;
  return [c, c.getContext("2d")!];
}

function noiseOverlay(ctx: CanvasRenderingContext2D, r: () => number, amount: number, grain = 1) {
  const img = ctx.getImageData(0, 0, S, S);
  for (let y = 0; y < S; y += grain)
    for (let x = 0; x < S; x += grain) {
      const n = (r() - 0.5) * amount;
      for (let j = 0; j < grain; j++)
        for (let i = 0; i < grain; i++) {
          const k = ((y + j) * S + (x + i)) * 4;
          img.data[k] = Math.max(0, Math.min(255, img.data[k] + n));
          img.data[k + 1] = Math.max(0, Math.min(255, img.data[k + 1] + n));
          img.data[k + 2] = Math.max(0, Math.min(255, img.data[k + 2] + n));
        }
    }
  ctx.putImageData(img, 0, 0);
}

type Painter = (ctx: CanvasRenderingContext2D, bump: CanvasRenderingContext2D, r: () => number) => void;

const painters: Record<TexKind, Painter> = {
  wood(ctx, bump, r) {
    ctx.fillStyle = "#6b4c30";
    ctx.fillRect(0, 0, S, S);
    bump.fillStyle = "#808080";
    bump.fillRect(0, 0, S, S);
    // tábuas verticais
    const boards = 5;
    for (let b = 0; b < boards; b++) {
      const x0 = (b * S) / boards;
      const w = S / boards;
      const tone = 90 + r() * 40;
      ctx.fillStyle = `rgb(${tone + 25},${tone - 5},${tone - 40})`;
      ctx.fillRect(x0, 0, w, S);
      // veios
      for (let i = 0; i < 26; i++) {
        const x = x0 + r() * w;
        const dark = r() > 0.5;
        ctx.strokeStyle = dark ? "rgba(30,18,8,0.35)" : "rgba(190,150,100,0.18)";
        ctx.lineWidth = 0.6 + r() * 1.4;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        let xx = x;
        for (let y = 0; y <= S; y += 32) {
          xx += (r() - 0.5) * 3;
          ctx.lineTo(xx, y);
        }
        ctx.stroke();
        bump.strokeStyle = dark ? "rgba(40,40,40,0.5)" : "rgba(200,200,200,0.25)";
        bump.lineWidth = ctx.lineWidth;
        bump.beginPath();
        bump.moveTo(x, 0);
        bump.lineTo(xx, S);
        bump.stroke();
      }
      // fresta entre tábuas
      ctx.fillStyle = "rgba(10,6,2,0.85)";
      ctx.fillRect(x0, 0, 2, S);
      bump.fillStyle = "#101010";
      bump.fillRect(x0, 0, 3, S);
    }
    noiseOverlay(ctx, r, 22);
  },
  woodDark(ctx, bump, r) {
    painters.wood(ctx, bump, r);
    ctx.fillStyle = "rgba(20,14,8,0.45)";
    ctx.fillRect(0, 0, S, S);
  },
  stone(ctx, bump, r) {
    ctx.fillStyle = "#4b4843";
    ctx.fillRect(0, 0, S, S);
    bump.fillStyle = "#202020";
    bump.fillRect(0, 0, S, S);
    // blocos irregulares em fileiras
    let y = 0;
    while (y < S) {
      const h = 34 + r() * 26;
      let x = -r() * 40;
      while (x < S) {
        const w = 50 + r() * 50;
        const t = 100 + r() * 55;
        const m = r() * 18;
        ctx.fillStyle = `rgb(${t + m},${t + m * 0.8},${t - 6})`;
        ctx.fillRect(x + 2, y + 2, w - 3, h - 3);
        bump.fillStyle = `rgb(${150 + r() * 60},${150},${150})`;
        bump.fillRect(x + 3, y + 3, w - 5, h - 5);
        x += w;
      }
      y += h;
    }
    noiseOverlay(ctx, r, 38, 2);
    noiseOverlay(bump, r, 40, 2);
  },
  plaster(ctx, bump, r) {
    ctx.fillStyle = "#cbb996";
    ctx.fillRect(0, 0, S, S);
    bump.fillStyle = "#808080";
    bump.fillRect(0, 0, S, S);
    for (let i = 0; i < 140; i++) {
      const x = r() * S, y = r() * S, rad = 6 + r() * 26;
      const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
      const dark = r() > 0.5;
      g.addColorStop(0, dark ? "rgba(90,70,45,0.16)" : "rgba(240,225,190,0.14)");
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
    // rachaduras
    for (let i = 0; i < 6; i++) {
      ctx.strokeStyle = "rgba(60,45,30,0.35)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      let x = r() * S, y = r() * S;
      ctx.moveTo(x, y);
      for (let k = 0; k < 8; k++) {
        x += (r() - 0.5) * 24;
        y += r() * 20;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    noiseOverlay(ctx, r, 30, 2);
    noiseOverlay(bump, r, 60, 2);
  },
  thatch(ctx, bump, r) {
    ctx.fillStyle = "#7a6638";
    ctx.fillRect(0, 0, S, S);
    bump.fillStyle = "#808080";
    bump.fillRect(0, 0, S, S);
    // milhares de fios de palha caídos na vertical
    for (let i = 0; i < 2600; i++) {
      const x = r() * S, y = r() * S;
      const len = 14 + r() * 40;
      const t = 90 + r() * 90;
      ctx.strokeStyle = `rgba(${t + 30},${t + 8},${t - 50},${0.35 + r() * 0.4})`;
      ctx.lineWidth = 0.6 + r() * 1.2;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + (r() - 0.5) * 6, y + len);
      ctx.stroke();
      bump.strokeStyle = r() > 0.5 ? "rgba(230,230,230,0.35)" : "rgba(30,30,30,0.35)";
      bump.lineWidth = 1;
      bump.beginPath();
      bump.moveTo(x, y);
      bump.lineTo(x, y + len);
      bump.stroke();
    }
    // faixas escuras (camadas de palha) + musgo
    for (let y = 0; y < S; y += 48) {
      ctx.fillStyle = "rgba(25,18,8,0.28)";
      ctx.fillRect(0, y, S, 5);
    }
    ctx.fillStyle = "rgba(60,80,40,0.18)";
    for (let i = 0; i < 20; i++) ctx.fillRect(r() * S, r() * S, 30 + r() * 40, 20 + r() * 30);
    noiseOverlay(ctx, r, 24);
  },
  shingle(ctx, bump, r) {
    ctx.fillStyle = "#3a2a1f";
    ctx.fillRect(0, 0, S, S);
    bump.fillStyle = "#202020";
    bump.fillRect(0, 0, S, S);
    const rows = 8, cols = 6;
    for (let j = 0; j < rows; j++)
      for (let i = 0; i < cols; i++) {
        const w = S / cols, h = S / rows;
        const x = i * w + (j % 2 ? w / 2 : 0) - w / 2;
        const t = 55 + r() * 40;
        ctx.fillStyle = `rgb(${t + 30},${t + 12},${t - 6})`;
        ctx.fillRect(x + 1, j * h + 1, w - 2, h - 1);
        bump.fillStyle = `rgb(${130 + j * 12},${130 + j * 12},${130 + j * 12})`;
        bump.fillRect(x + 1, j * h + 1, w - 2, h - 2);
      }
    noiseOverlay(ctx, r, 30, 2);
  },
  grass(ctx, bump, r) {
    ctx.fillStyle = "#34502a";
    ctx.fillRect(0, 0, S, S);
    bump.fillStyle = "#808080";
    bump.fillRect(0, 0, S, S);
    for (let i = 0; i < 4200; i++) {
      const x = r() * S, y = r() * S;
      const g = 70 + r() * 90;
      ctx.strokeStyle = `rgba(${g * 0.55},${g + 20},${g * 0.3},${0.5 + r() * 0.4})`;
      ctx.lineWidth = 0.8 + r();
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + (r() - 0.5) * 7, y - 5 - r() * 9);
      ctx.stroke();
    }
    // manchas de terra e variações de tom
    for (let i = 0; i < 30; i++) {
      const x = r() * S, y = r() * S, rad = 20 + r() * 40;
      const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
      g.addColorStop(0, r() > 0.5 ? "rgba(90,75,45,0.22)" : "rgba(30,60,25,0.25)");
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
    noiseOverlay(ctx, r, 36);
    noiseOverlay(bump, r, 70);
  },
  moss(ctx, bump, r) {
    painters.grass(ctx, bump, r);
    ctx.fillStyle = "rgba(20,40,20,0.35)";
    ctx.fillRect(0, 0, S, S);
  },
  dirt(ctx, bump, r) {
    ctx.fillStyle = "#6b5236";
    ctx.fillRect(0, 0, S, S);
    bump.fillStyle = "#808080";
    bump.fillRect(0, 0, S, S);
    for (let i = 0; i < 90; i++) {
      const x = r() * S, y = r() * S, rad = 4 + r() * 22;
      const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
      g.addColorStop(0, r() > 0.5 ? "rgba(40,28,16,0.3)" : "rgba(150,120,80,0.22)");
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
    for (let i = 0; i < 260; i++) {
      ctx.fillStyle = `rgba(${90 + r() * 70},${80 + r() * 50},${70 + r() * 40},0.6)`;
      ctx.beginPath();
      ctx.arc(r() * S, r() * S, 0.8 + r() * 2.4, 0, 6.3);
      ctx.fill();
    }
    noiseOverlay(ctx, r, 40);
    noiseOverlay(bump, r, 80);
  },
  cobble(ctx, bump, r) {
    ctx.fillStyle = "#2e2b27";
    ctx.fillRect(0, 0, S, S);
    bump.fillStyle = "#101010";
    bump.fillRect(0, 0, S, S);
    const n = 7;
    for (let j = 0; j < n; j++)
      for (let i = 0; i < n; i++) {
        const w = S / n, h = S / n;
        const cx = i * w + (j % 2 ? w / 2 : 0) + w / 2 + (r() - 0.5) * 4;
        const cy = j * h + h / 2 + (r() - 0.5) * 4;
        const rx = w * (0.38 + r() * 0.08), ry = h * (0.36 + r() * 0.08);
        const t = 85 + r() * 55;
        const g = ctx.createRadialGradient(cx - 3, cy - 3, 2, cx, cy, rx);
        g.addColorStop(0, `rgb(${t + 28},${t + 24},${t + 14})`);
        g.addColorStop(1, `rgb(${t - 18},${t - 18},${t - 24})`);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.ellipse(cx, cy, rx, ry, r() * 0.6, 0, 6.3);
        ctx.fill();
        const bg = bump.createRadialGradient(cx, cy, 1, cx, cy, rx);
        bg.addColorStop(0, "#d8d8d8");
        bg.addColorStop(1, "#383838");
        bump.fillStyle = bg;
        bump.beginPath();
        bump.ellipse(cx, cy, rx, ry, 0, 0, 6.3);
        bump.fill();
      }
    // musgo nas juntas
    ctx.fillStyle = "rgba(55,75,35,0.16)";
    for (let i = 0; i < 40; i++) ctx.fillRect(r() * S, r() * S, 10 + r() * 20, 6 + r() * 14);
    noiseOverlay(ctx, r, 30, 2);
  },
};

const cache = new Map<string, { map: THREE.CanvasTexture; bump: THREE.CanvasTexture }>();

export function getTextures(kind: TexKind) {
  let t = cache.get(kind);
  if (t) return t;
  const [c, ctx] = mk();
  const [bc, bctx] = mk();
  painters[kind](ctx, bctx, rng(kind.length * 7919 + kind.charCodeAt(0) * 131));
  const map = new THREE.CanvasTexture(c);
  const bump = new THREE.CanvasTexture(bc);
  for (const tx of [map, bump]) {
    tx.wrapS = tx.wrapT = THREE.RepeatWrapping;
    tx.anisotropy = 8;
  }
  map.colorSpace = THREE.SRGBColorSpace;
  t = { map, bump };
  cache.set(kind, t);
  return t;
}

/** Caixa com UV em escala de mundo: a textura mantém a mesma densidade em qualquer tamanho. */
const boxCache = new Map<string, THREE.BoxGeometry>();
export function worldBox(w: number, h: number, d: number, density = 0.6): THREE.BoxGeometry {
  const key = `${w}|${h}|${d}|${density}`;
  let g = boxCache.get(key);
  if (g) return g;
  g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  const dims: [number, number][] = [
    [d, h], [d, h], // +x -x
    [w, d], [w, d], // +y -y
    [w, h], [w, h], // +z -z
  ];
  for (let f = 0; f < 6; f++)
    for (let v = 0; v < 4; v++) {
      const i = f * 4 + v;
      uv.setXY(i, uv.getX(i) * dims[f][0] * density, uv.getY(i) * dims[f][1] * density);
    }
  boxCache.set(key, g);
  return g;
}

/** Escala de UV para qualquer geometria que já tenha UV (cilindros, cones, etc.). */
export function scaleUV(g: THREE.BufferGeometry, u: number, v: number) {
  const uv = g.attributes.uv as THREE.BufferAttribute | undefined;
  if (!uv) return g;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * u, uv.getY(i) * v);
  return g;
}
