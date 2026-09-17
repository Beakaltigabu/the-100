import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC = resolve(__dirname, '../public');
const OUT = resolve(PUBLIC, 'icons');
mkdirSync(OUT, { recursive: true });

function crc32(buf) {
  let c, table = [];
  for (let n = 0; n < 256; n++) {
    c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xff];
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function hexToRgb(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function png(size, ink, paper, accent) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;

  const stride = size * 4 + 1;
  const raw = Buffer.alloc(stride * size);
  const row = Buffer.alloc(size * 4);
  const cx = size / 2, cy = size / 2;

  const inkRgb = hexToRgb(ink);
  const paperRgb = hexToRgb(paper);
  const accentRgb = hexToRgb(accent);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r, g, b;
      const relY = (y - cy) / size;
      const inBar = relY > 0.08 && relY < 0.28;
      const inNum = relY > 0.18 && relY < 0.42 && Math.abs(x - cx) < size * 0.31;
      if (inNum) [r, g, b] = accentRgb;
      else if (inBar) [r, g, b] = paperRgb;
      else [r, g, b] = inkRgb;
      const o = x * 4;
      row[o] = r; row[o + 1] = g; row[o + 2] = b; row[o + 3] = 255;
    }
    raw[y * stride] = 0;
    row.copy(raw, y * stride + 1);
  }

  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

const out = { 'pwa-192.png': 192, 'pwa-512.png': 512, 'apple-touch-180.png': 180 };
for (const [name, size] of Object.entries(out)) {
  writeFileSync(resolve(OUT, name), png(size, '#101010', '#F5F3EE', '#FF4D00'));
  console.log(`Generated ${name}`);
}