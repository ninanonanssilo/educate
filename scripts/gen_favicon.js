/* eslint-disable no-bitwise */
// Generates ./favicon.ico with embedded PNG images (16x16 and 32x32).
// No external deps; uses Node's zlib for PNG deflate.

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j += 1) {
      const mask = -(crc & 1);
      crc = (crc >>> 1) ^ (0xedb88320 & mask);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBuf = Buffer.from(type, "ascii");
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  const crc = crc32(Buffer.concat([typeBuf, data]));
  crcBuf.writeUInt32BE(crc, 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

function encodePNG({ width, height, rgba }) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  const rowSize = width * 4;
  const raw = Buffer.alloc((rowSize + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[(rowSize + 1) * y] = 0; // filter type 0
    rgba.copy(raw, (rowSize + 1) * y + 1, rowSize * y, rowSize * (y + 1));
  }

  const idatData = zlib.deflateSync(raw, { level: 9 });
  const chunks = [
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", idatData),
    pngChunk("IEND", Buffer.alloc(0)),
  ];

  return Buffer.concat([signature, ...chunks]);
}

function makeCanvas(size) {
  return {
    size,
    buf: Buffer.alloc(size * size * 4, 0),
  };
}

function setPixel(canvas, x, y, r, g, b, a) {
  if (x < 0 || y < 0 || x >= canvas.size || y >= canvas.size) return;
  const i = (y * canvas.size + x) * 4;
  canvas.buf[i + 0] = r;
  canvas.buf[i + 1] = g;
  canvas.buf[i + 2] = b;
  canvas.buf[i + 3] = a;
}

function fillRect(canvas, x0, y0, w, h, rgba) {
  const [r, g, b, a] = rgba;
  for (let y = y0; y < y0 + h; y += 1) {
    for (let x = x0; x < x0 + w; x += 1) {
      setPixel(canvas, x, y, r, g, b, a);
    }
  }
}

function strokeRect(canvas, x0, y0, w, h, t, rgba) {
  const [r, g, b, a] = rgba;
  for (let i = 0; i < t; i += 1) {
    for (let x = x0 + i; x < x0 + w - i; x += 1) {
      setPixel(canvas, x, y0 + i, r, g, b, a);
      setPixel(canvas, x, y0 + h - 1 - i, r, g, b, a);
    }
    for (let y = y0 + i; y < y0 + h - i; y += 1) {
      setPixel(canvas, x0 + i, y, r, g, b, a);
      setPixel(canvas, x0 + w - 1 - i, y, r, g, b, a);
    }
  }
}

function line(canvas, x0, y0, x1, y1, t, rgba) {
  // Ensure integer coordinates so the Bresenham loop always terminates.
  x0 = Math.round(x0);
  y0 = Math.round(y0);
  x1 = Math.round(x1);
  y1 = Math.round(y1);

  const [r, g, b, a] = rgba;
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;

  while (true) {
    for (let oy = -t; oy <= t; oy += 1) {
      for (let ox = -t; ox <= t; ox += 1) {
        setPixel(canvas, x0 + ox, y0 + oy, r, g, b, a);
      }
    }
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      x0 += sx;
    }
    if (e2 < dx) {
      err += dx;
      y0 += sy;
    }
  }
}

function drawIcon(size) {
  const c = makeCanvas(size);

  // Palette (match site brand)
  const blue = [0x1f, 0x6f, 0xb8, 0xff];
  const green = [0x19, 0x91, 0x6a, 0xff];
  const ink = [0x1b, 0x2a, 0x39, 0xff];
  const paper = [0xff, 0xff, 0xff, 0xff];
  const fold = [0xe6, 0xee, 0xf6, 0xff];

  // Document block
  const pad = Math.max(2, Math.floor(size * 0.12));
  const x = pad;
  const y = pad;
  const w = size - pad * 2;
  const h = size - pad * 2;

  fillRect(c, x, y, w, h, paper);
  strokeRect(c, x, y, w, h, Math.max(1, Math.floor(size * 0.06)), blue);

  // Folded corner
  const foldSize = Math.max(4, Math.floor(size * 0.28));
  for (let fy = 0; fy < foldSize; fy += 1) {
    for (let fx = 0; fx < foldSize - fy; fx += 1) {
      setPixel(c, x + w - 1 - fx, y + fy, fold[0], fold[1], fold[2], fold[3]);
    }
  }
  // Fold edge
  line(
    c,
    x + w - foldSize,
    y,
    x + w - 1,
    y + foldSize - 1,
    Math.max(0, Math.floor(size * 0.02)),
    ink
  );

  // Text lines on paper
  const left = x + Math.floor(w * 0.14);
  const right = x + w - Math.floor(w * 0.18) - Math.floor(foldSize * 0.3);
  const t = Math.max(0, Math.floor(size * 0.01));
  const l1 = y + Math.floor(h * 0.32);
  const l2 = y + Math.floor(h * 0.46);
  const l3 = y + Math.floor(h * 0.60);
  line(c, left, l1, right, l1, t, ink);
  line(c, left, l2, left + Math.floor((right - left) * 0.86), l2, t, ink);
  line(c, left, l3, left + Math.floor((right - left) * 0.72), l3, t, ink);

  // Pen stroke (diagonal)
  const px0 = x + Math.floor(w * 0.55);
  const py0 = y + Math.floor(h * 0.78);
  const px1 = x + Math.floor(w * 0.90);
  const py1 = y + Math.floor(h * 0.55);
  line(c, px0, py0, px1, py1, Math.max(1, Math.floor(size * 0.035)), green);

  return c.buf;
}

function buildICO(pngs) {
  const count = pngs.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type = icon
  header.writeUInt16LE(count, 4);

  const entries = [];
  let offset = 6 + count * 16;
  const blobs = [];

  for (const { size, png } of pngs) {
    const entry = Buffer.alloc(16);
    entry[0] = size; // width
    entry[1] = size; // height
    entry[2] = 0; // palette
    entry[3] = 0; // reserved
    entry.writeUInt16LE(1, 4); // planes
    entry.writeUInt16LE(32, 6); // bit count
    entry.writeUInt32LE(png.length, 8); // bytes
    entry.writeUInt32LE(offset, 12); // offset
    offset += png.length;
    entries.push(entry);
    blobs.push(png);
  }

  return Buffer.concat([header, ...entries, ...blobs]);
}

function main() {
  const root = path.join(__dirname, "..");
  const outPath = path.join(root, "favicon.ico");

  const sizes = [16, 32];
  const pngs = sizes.map((size) => {
    const rgba = drawIcon(size);
    const png = encodePNG({ width: size, height: size, rgba });
    return { size, png };
  });

  const ico = buildICO(pngs);
  fs.writeFileSync(outPath, ico);
  process.stdout.write(`Wrote ${outPath} (${ico.length} bytes)\n`);
}

main();
