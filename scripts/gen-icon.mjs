#!/usr/bin/env node
// Parses clawd.svg pixel rectangles → writes assets/icon.png + icon@2x.png
import { deflateSync } from 'zlib';
import { writeFileSync, mkdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

// ── Parse SVG rects ──────────────────────────────────────────────────────────
const svgPath = `M5.08191 10.0769V0.938461H9.37422V10.0769H5.08191ZM9.23305 10.0769V0.938461H13.5254V10.0769H9.23305ZM13.3842 10.0769V0.938461H17.6765V10.0769H13.3842ZM17.5353 10.0769V0.938461H21.8276V10.0769H17.5353ZM21.6865 10.0769V0.938461H25.9788V10.0769H21.6865ZM25.8376 10.0769V0.938461H30.1299V10.0769H25.8376ZM29.9888 10.0769V0.938461H34.2811V10.0769H29.9888ZM34.1399 10.0769V0.938461H38.4322V10.0769H34.1399ZM38.291 10.0769V0.938461H42.5834V10.0769H38.291ZM0.930769 19.0769V9.93846H5.22308V19.0769H0.930769ZM5.08191 19.0769V9.93846H9.37422V19.0769H5.08191ZM9.23305 19.0769V14.5077H13.5254V19.0769H9.23305ZM13.3842 19.0769V9.93846H17.6765V19.0769H13.3842ZM17.5353 19.0769V9.93846H21.8276V19.0769H17.5353ZM21.6865 19.0769V9.93846H25.9788V19.0769H21.6865ZM25.8376 19.0769V9.93846H30.1299V19.0769H25.8376ZM29.9888 19.0769V9.93846H34.2811V19.0769H29.9888ZM34.1399 19.0769V14.5077H38.4322V19.0769H34.1399ZM38.291 19.0769V9.93846H42.5834V19.0769H38.291ZM42.4422 19.0769V9.93846H46.7345V19.0769H42.4422ZM5.08191 28.0769V18.9385H9.37422V28.0769H5.08191ZM9.23305 28.0769V18.9385H13.5254V28.0769H9.23305ZM13.3842 28.0769V18.9385H17.6765V28.0769H13.3842ZM17.5353 28.0769V18.9385H21.8276V28.0769H17.5353ZM21.6865 28.0769V18.9385H25.9788V28.0769H21.6865ZM25.8376 28.0769V18.9385H30.1299V28.0769H25.8376ZM29.9888 28.0769V18.9385H34.2811V28.0769H29.9888ZM34.1399 28.0769V18.9385H38.4322V28.0769H34.1399ZM38.291 28.0769V18.9385H42.5834V28.0769H38.291ZM5.08191 37.0769V27.9385H9.37422V37.0769H5.08191ZM13.3842 37.0769V27.9385H17.6765V37.0769H13.3842ZM29.9888 37.0769V27.9385H34.2811V37.0769H29.9888ZM38.291 37.0769V27.9385H42.5834V37.0769H38.291Z`;

// Each sub-path: Mx1 y_b V y_t H x2 V y_b H x1 Z
const rects = [];
for (const sub of svgPath.split('Z').map(s => s.trim()).filter(Boolean)) {
  const nums = sub.replace(/[MVHZ]/g, ' ').trim().split(/\s+/).map(Number);
  // nums: x1, yb, yt, x2, yb, x1  (from M x1 yb  V yt  H x2  V yb  H x1)
  const [x1, yb, yt, x2] = nums;
  rects.push({ x1, y1: yt, x2, y2: yb });
}

// ── Build pixel grid ─────────────────────────────────────────────────────────
const SVG_W = 47, SVG_H = 38;
const SCALE = 1; // base scale; we'll write @2x separately
const W = SVG_W, H = SVG_H;
const COLOR = [0xD9, 0x77, 0x57, 0xFF]; // #D97757 (Claude Code orange)
const EMPTY = [0, 0, 0, 0];

function makePixels(scale) {
  const pw = Math.round(SVG_W * scale);
  const ph = Math.round(SVG_H * scale);
  const pixels = new Uint8Array(pw * ph * 4); // RGBA
  for (const { x1, y1, x2, y2 } of rects) {
    const px1 = Math.round(x1 * scale);
    const py1 = Math.round(y1 * scale);
    const px2 = Math.round(x2 * scale);
    const py2 = Math.round(y2 * scale);
    for (let y = py1; y < py2; y++) {
      for (let x = px1; x < px2; x++) {
        const i = (y * pw + x) * 4;
        pixels[i]     = COLOR[0];
        pixels[i + 1] = COLOR[1];
        pixels[i + 2] = COLOR[2];
        pixels[i + 3] = COLOR[3];
      }
    }
  }
  return { pixels, pw, ph };
}

// ── PNG encoder ──────────────────────────────────────────────────────────────
function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (const b of buf) { c ^= b; for (let j = 0; j < 8; j++) c = (c >>> 1) ^ ((c & 1) * 0xEDB88320); }
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function chunk(type, data) {
  const typeBytes = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const crcInput = Buffer.concat([typeBytes, data]);
  const crcBuf = Buffer.alloc(4); crcBuf.writeUInt32BE(crc32(crcInput));
  return Buffer.concat([len, typeBytes, data, crcBuf]);
}

function encodePNG(pixels, w, h) {
  const sig = Buffer.from([137,80,78,71,13,10,26,10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // color type RGBA
  ihdr[10] = ihdr[11] = ihdr[12] = 0;

  const raw = [];
  for (let y = 0; y < h; y++) {
    raw.push(0); // filter byte
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      raw.push(pixels[i], pixels[i+1], pixels[i+2], pixels[i+3]);
    }
  }
  const compressed = deflateSync(Buffer.from(raw));
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', compressed), chunk('IEND', Buffer.alloc(0))]);
}

// ── Write files ──────────────────────────────────────────────────────────────
mkdirSync(path.join(ROOT, 'assets'), { recursive: true });

const { pixels: p1, pw: w1, ph: h1 } = makePixels(0.5);
writeFileSync(path.join(ROOT, 'assets/icon.png'), encodePNG(p1, w1, h1));
console.log(`Written icon.png (${w1}×${h1})`);

const { pixels: p2, pw: w2, ph: h2 } = makePixels(1);
writeFileSync(path.join(ROOT, 'assets/icon@2x.png'), encodePNG(p2, w2, h2));
console.log(`Written icon@2x.png (${w2}×${h2})`);
