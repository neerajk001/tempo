// One-off icon generator (dev only, not part of the build).
// Draws a pomodoro tomato with raw RGBA math; encodes PNG via built-in zlib.
import { writeFileSync, mkdirSync } from "fs";
import { deflateSync } from "zlib";

function crc32(buf) {
  let table = crc32.t;
  if (!table) {
    table = crc32.t = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c;
    }
  }
  let crc = -1;
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePng(size, paint) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = paint(x / size, y / size);
      const o = y * (size * 4 + 1) + 1 + x * 4;
      raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; raw[o + 3] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

const dist = (x1, y1, x2, y2) => Math.hypot(x1 - x2, y1 - y2);

// Pomodoro tomato: red circle, darker rim, green stem + leaf highlight.
function tomato(cx, cy, r) {
  return (x, y) => {
    const d = dist(x, y, cx, cy);
    if (d > r) return null;
    // simple top-left light shading
    const shade = 1 - 0.25 * Math.max(0, (x - cx + (y - cy)) / r);
    const rim = d > r * 0.88 ? 0.82 : 1;
    return [Math.round(220 * shade * rim), Math.round(38 * shade * rim), Math.round(38 * shade * rim), 255];
  };
}

function paintStandard(x, y) {
  // cream background
  let px = [250, 250, 249, 255];
  const t = tomato(0.5, 0.54, 0.34)(x, y);
  if (t) px = t;
  // stem
  if (x > 0.485 && x < 0.515 && y > 0.13 && y < 0.24) px = [22, 101, 52, 255];
  // leaf
  if (dist(x, y, 0.58, 0.2) < 0.07 && y < 0.24) px = [34, 197, 94, 255];
  return px;
}

function paintMaskable(x, y) {
  // full-bleed dark background (safe zone respected: art within center 80%)
  let px = [23, 23, 23, 255];
  const t = tomato(0.5, 0.52, 0.3)(x, y);
  if (t) px = t;
  if (x > 0.488 && x < 0.512 && y > 0.15 && y < 0.26) px = [34, 197, 94, 255];
  return px;
}

function circleCrop(paint) {
  // apple touch icon: dark rounded feel via circular art on dark bg
  return (x, y) => {
    if (dist(x, y, 0.5, 0.5) > 0.5) return [23, 23, 23, 255];
    return paint(x, y);
  };
}

mkdirSync(new URL("../public/icons", import.meta.url), { recursive: true });
const out = (n, buf) => {
  writeFileSync(new URL(`../public/icons/${n}`, import.meta.url), buf);
  console.log("wrote", n, buf.length, "bytes");
};

out("icon-512.png", encodePng(512, paintStandard));
out("icon-192.png", encodePng(192, paintStandard));
out("maskable-512.png", encodePng(512, paintMaskable));
out("apple-touch-icon.png", encodePng(180, circleCrop(paintStandard)));
