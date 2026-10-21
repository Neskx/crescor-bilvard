#!/usr/bin/env node
// Builds web assets from the official logo (brand/logomain.png):
//   public/logo/crescor-logo.(png|webp)  trimmed logo for dark backgrounds
//   public/favicon-*.png, apple-touch-icon.png  icons
//   public/og-image.jpg                   social share image (hero photo + logo)
// Run: node scripts/process-logo.mjs   (uses Playwright's Chromium for image work)
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { chromium } from '@playwright/test';

const root = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root));
const toDataUrl = (buf, type) => `data:${type};base64,${buf.toString('base64')}`;
const logo = toDataUrl(read('brand/logomain.png'), 'image/png');
const hero = toDataUrl(read('public/images/hero-desktop.webp'), 'image/webp');

const browser = await chromium.launch();
const page = await browser.newPage();
const out = await page.evaluate(async ({ logo, hero }) => {
  const load = (src) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
  const img = await load(logo);
  const c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  const x = c.getContext('2d'); x.drawImage(img, 0, 0);
  const { data } = x.getImageData(0, 0, c.width, c.height);
  const alpha = (px, py) => data[(py * c.width + px) * 4 + 3];

  // Tight bounding box of visible pixels
  let minX = c.width, minY = c.height, maxX = 0, maxY = 0;
  for (let py = 0; py < c.height; py++) for (let px = 0; px < c.width; px++) if (alpha(px, py) > 10) {
    if (px < minX) minX = px; if (px > maxX) maxX = px; if (py < minY) minY = py; if (py > maxY) maxY = py;
  }
  const pad = 4;
  minX = Math.max(0, minX - pad); minY = Math.max(0, minY - pad);
  maxX = Math.min(c.width - 1, maxX + pad); maxY = Math.min(c.height - 1, maxY + pad);
  const w = maxX - minX + 1, h = maxY - minY + 1;
  const t = document.createElement('canvas'); t.width = w; t.height = h;
  t.getContext('2d').drawImage(c, minX, minY, w, h, 0, 0, w, h);

  // Find the "C" of CRESCOR. Text rows are measured only across the middle of
  // the logo, so the swoosh's left tail doesn't merge with the wordmark band.
  const xa = Math.floor(c.width * 0.18), xb = Math.floor(c.width * 0.88);
  const bands = []; let s0 = -1;
  for (let py = 0; py <= c.height; py++) {
    let n = 0; if (py < c.height) for (let px = xa; px < xb; px++) if (alpha(px, py) > 60) n++;
    if (n > 3 && s0 < 0) s0 = py;
    if (n <= 3 && s0 >= 0) { bands.push([s0, py - 1]); s0 = -1; }
  }
  // Tallest band in the lower half of the logo = CRESCOR
  const [top, bot] = bands.filter(([a]) => a > c.height * 0.45).sort((p, q) => (q[1] - q[0]) - (p[1] - p[0]))[0];
  const colInk = (px) => { for (let py = top; py <= bot; py++) if (alpha(px, py) > 60) return true; return false; };
  let cx0 = xa; while (cx0 < xb && !colInk(cx0)) cx0++;
  let cx1 = cx0; while (cx1 < xb && colInk(cx1)) cx1++;
  const gW = cx1 - cx0, gH = bot - top + 1;

  const icon = (size, bg = '#080808') => {
    const k = document.createElement('canvas'); k.width = size; k.height = size;
    const g = k.getContext('2d');
    g.fillStyle = bg; g.fillRect(0, 0, size, size);
    const s = (size * 0.66) / Math.max(gW, gH);
    const dw = gW * s, dh = gH * s;
    g.imageSmoothingQuality = 'high';
    g.drawImage(c, cx0, top, gW, gH, (size - dw) / 2, (size - dh) / 2, dw, dh);
    return k.toDataURL('image/png');
  };

  // Social image: hero photo, dark overlay, centered logo
  const og = document.createElement('canvas'); og.width = 1200; og.height = 630;
  const o = og.getContext('2d');
  const hi = await load(hero);
  const scale = Math.max(1200 / hi.width, 630 / hi.height);
  o.drawImage(hi, (1200 - hi.width * scale) / 2, (630 - hi.height * scale) / 2, hi.width * scale, hi.height * scale);
  const grad = o.createRadialGradient(600, 315, 80, 600, 315, 700);
  grad.addColorStop(0, 'rgba(8,8,8,0.62)'); grad.addColorStop(1, 'rgba(8,8,8,0.9)');
  o.fillStyle = grad; o.fillRect(0, 0, 1200, 630);
  const lw = 760, lh = lw * (h / w);
  o.drawImage(t, (1200 - lw) / 2, (630 - lh) / 2, lw, lh);

  return {
    size: [w, h],
    png: t.toDataURL('image/png'),
    webp: t.toDataURL('image/webp', 0.92),
    f32: icon(32), f192: icon(192), f512: icon(512), apple: icon(180),
    og: og.toDataURL('image/jpeg', 0.85),
  };
}, { logo, hero });
await browser.close();

const save = (p, dataUrl) => writeFileSync(new URL(p, root), Buffer.from(dataUrl.split(',')[1], 'base64'));
mkdirSync(new URL('public/logo/', root), { recursive: true });
save('public/logo/crescor-logo.png', out.png);
save('public/logo/crescor-logo.webp', out.webp);
save('public/favicon-32.png', out.f32);
save('public/icon-192.png', out.f192);
save('public/icon-512.png', out.f512);
save('public/apple-touch-icon.png', out.apple);
save('public/og-image.jpg', out.og);
console.log(`Logo trimmed to ${out.size[0]}×${out.size[1]} px. Icons and og-image written.`);
