/* Generates Doodle Pop PWA icons (the goldendoodle face on a tennis court with
   a tennis-ball accent) as real PNGs.  Pure Node — hand-rolled PNG encoder over
   the built-in zlib. No deps.   Run:  node tools/make-icons.mjs               */
import zlib from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, '..', 'icons');
fs.mkdirSync(OUT, { recursive: true });

// ---- tiny PNG encoder (RGB, 8-bit) ----------------------------------------
const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crc]);
}
function encodePNG(size, rgb) {
  const stride = size * 3;
  const raw = Buffer.alloc(size * (stride + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0;
    rgb.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---- colour helpers --------------------------------------------------------
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const greyLight = [124, 118, 109], greyBase = [82, 78, 71], greyDark = [43, 39, 33];
const earBase = [36, 31, 25], earDark = [24, 20, 15];
const irisAmber = [185, 128, 43], rimAmber = [111, 69, 20];
const irisBlue = [140, 180, 203], rimBlue = [85, 126, 152];
const irisBrown = [111, 60, 36];
const sclera = [239, 233, 223];
const white = [255, 255, 255];

function ell(x, y, cx, cy, rx, ry, rot, wob, freq) {
  const dx = x - cx, dy = y - cy;
  const c = Math.cos(-rot), s = Math.sin(-rot);
  const ux = dx * c - dy * s, uy = dx * s + dy * c;
  let nrx = rx, nry = ry;
  if (wob) {
    const a = Math.atan2(uy, ux);
    const w = 1 + wob * Math.sin(a * freq) + wob * 0.5 * Math.sin(a * (freq - 3) + 1.2);
    nrx = rx * w; nry = ry * w;
  }
  const v = (ux * ux) / (nrx * nrx) + (uy * uy) / (nry * nry);
  return v <= 1 ? v : -1;
}
function mottle(x, y) {
  const n = Math.sin(x * 74.0) * Math.cos(y * 81.0) + Math.sin((x + y) * 47.0) * 0.6;
  return n * 7;
}

// ---- the dog face (design space 0..1) -------------------------------------
function dogColor(x, y) {
  const eyes = [
    { ex: 0.41, iris: irisAmber, sector: null },
    { ex: 0.59, iris: irisBlue, sector: irisBrown },
  ];
  for (const e of eyes) {
    const erx = 0.072, ery = 0.06, ecy = 0.462;
    const inEye = ((x - e.ex) ** 2) / (erx * erx) + ((y - ecy) ** 2) / (ery * ery);
    if (inEye <= 1) {
      const iy = 0.458, irad = 0.05;
      if (Math.hypot(x - (e.ex - 0.016), y - (iy - 0.016)) < 0.013) return white;
      const di = Math.hypot(x - e.ex, y - iy);
      const lid = Math.max(0, Math.min(1, (0.452 - y) / 0.05));
      if (di > irad) {
        if (inEye > 0.88) return [26, 18, 11];
        if (di < irad + 0.006) return [24, 16, 9];
        return mix(sclera, [0, 0, 0], lid * 0.25);
      }
      if (di < irad * 0.5) return [10, 6, 3];
      let col = e.iris;
      if (e.sector && y < iy) col = e.sector;
      return mix(col, [0, 0, 0], lid * 0.3);
    }
  }
  for (const b of [{ bx: 0.41, rot: -0.2 }, { bx: 0.59, rot: 0.2 }]) {
    if (ell(x, y, b.bx, 0.392, 0.07, 0.022, b.rot, 0.14, 5) >= 0) {
      const m = mottle(x, y) * 0.5;
      return [earBase[0] + m, earBase[1] + m, earBase[2] + m];
    }
  }
  if (ell(x, y, 0.485, 0.562, 0.016, 0.013, 0, 0) >= 0) return white;
  if (ell(x, y, 0.5, 0.58, 0.058, 0.048, 0, 0) >= 0) return [31, 27, 26];
  const sv = ell(x, y, 0.5, 0.64, 0.16, 0.142, 0, 0.06, 6);
  if (sv >= 0) {
    const under = Math.max(0, (y - 0.64) / 0.16);
    const col = mix(mix(greyBase, greyLight, 0.3), greyDark, under * 0.5);
    const m = mottle(x * 1.2, y * 1.2) * 1.0;
    return [col[0] + m, col[1] + m, col[2] + m];
  }
  const hv = ell(x, y, 0.5, 0.52, 0.31, 0.305, 0, 0.05, 8);
  if (hv >= 0) {
    const t = (y - 0.215) / 0.61;
    let col;
    if (t < 0.32) col = mix(earBase, greyBase, t / 0.32);
    else col = mix(greyBase, greyLight, (t - 0.32) / 0.68);
    const m = mottle(x, y);
    return [col[0] + m, col[1] + m, col[2] + m];
  }
  for (const [ex, rot] of [[0.25, 0.22], [0.75, -0.22]]) {
    const v = ell(x, y, ex, 0.59, 0.118, 0.225, rot, 0.07, 6);
    if (v >= 0) {
      const col = mix(earBase, earDark, v * 0.6 + 0.15);
      const m = mottle(x, y) * 0.6;
      return [col[0] + m, col[1] + m, col[2] + m];
    }
  }
  return null;
}

// ---- a little tennis ball in the lower-right (design space 0..1) ----------
function ballColor(x, y) {
  const bx = 0.82, by = 0.83, br = 0.13;
  const d = Math.hypot(x - bx, y - by);
  if (d > br) return null;
  // felt gradient + S-seam
  const lo = [188, 214, 43], hi = [233, 243, 123];
  const shade = Math.min(1, d / br);
  let col = mix(hi, lo, shade * 0.9);
  // white seam: distance to the S bezier approximated by two arcs
  const sx = (x - bx) / br, sy = (y - by) / br;
  const seam1 = Math.abs(Math.hypot(sx + 0.55, sy) - 0.95);
  const seam2 = Math.abs(Math.hypot(sx - 0.55, sy) - 0.95);
  if (Math.min(seam1, seam2) < 0.12 && Math.abs(sy) < 0.92) col = [247, 249, 238];
  return col;
}

// ---- environment: sunny tennis court (output space 0..1) ------------------
function envColor(nx, ny) {
  const courtTop = 0.74;
  if (ny > courtTop) {
    const t = (ny - courtTop) / (1 - courtTop);
    const base = mix([95, 174, 63], [79, 148, 52], t);
    // a court line
    if (Math.abs(ny - 0.78) < 0.012) return [238, 247, 230];
    return base;
  }
  const sd = Math.hypot(nx - 0.84, ny - 0.16);
  let sky = mix([127, 208, 244], [205, 238, 200], ny / courtTop);
  if (sd < 0.16) sky = mix([255, 248, 196], sky, Math.min(1, sd / 0.16));
  if (ell(nx, ny, 0.2, 0.2, 0.12, 0.055, 0, 0) >= 0) return mix(sky, white, 0.88);
  return sky;
}

function colorAt(nx, ny, maskable) {
  const f = maskable ? 0.80 : 1.0;
  const x = 0.5 + (nx - 0.5) / f;
  const y = 0.5 + (ny - 0.5) / f;
  return dogColor(x, y) || ballColor(x, y) || envColor(nx, ny);
}

function render(size, SS, maskable) {
  const out = Buffer.alloc(size * size * 3);
  const k = SS * SS;
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0, g = 0, b = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const c = colorAt((px + (sx + 0.5) / SS) / size, (py + (sy + 0.5) / SS) / size, maskable);
          r += c[0]; g += c[1]; b += c[2];
        }
      }
      const i = (py * size + px) * 3;
      out[i] = Math.max(0, Math.min(255, Math.round(r / k)));
      out[i + 1] = Math.max(0, Math.min(255, Math.round(g / k)));
      out[i + 2] = Math.max(0, Math.min(255, Math.round(b / k)));
    }
  }
  return out;
}

const jobs = [
  ['icon-192.png', 192, 3, false],
  ['icon-512.png', 512, 2, false],
  ['icon-maskable-512.png', 512, 2, true],
  ['apple-touch-icon.png', 180, 3, false],
  ['favicon-32.png', 32, 4, false],
];
for (const [name, size, ss, mask] of jobs) {
  const png = encodePNG(size, render(size, ss, mask));
  fs.writeFileSync(path.join(OUT, name), png);
  console.log('  wrote icons/' + name + '  (' + size + 'px, ' + png.length + ' bytes)');
}
console.log('Done.');
