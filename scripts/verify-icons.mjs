import { readFileSync } from "fs";
for (const f of ["icon-512.png", "icon-192.png", "maskable-512.png", "apple-touch-icon.png"]) {
  const b = readFileSync(new URL(`../public/icons/${f}`, import.meta.url));
  const sig = [...b.subarray(0, 8)].map((n) => n.toString(16).padStart(2, "0")).join(" ");
  const w = b.readUInt32BE(16);
  const h = b.readUInt32BE(20);
  console.log(f, "| sig:", sig, "|", w + "x" + h);
}
