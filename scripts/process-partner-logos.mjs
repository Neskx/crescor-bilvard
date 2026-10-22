#!/usr/bin/env node
// Builds web versions of the partner logos supplied by the business.
//   brand/partners/<name>.png   ORIGINALS — never modified
//   public/partners/<name>.webp optimised for the website
//
// Only safe, non-destructive steps: the uniform outer margin (background colour
// or transparency) is trimmed and the image is scaled down to a sensible size.
// Lettering, colours and proportions are untouched.
// Run: node scripts/process-partner-logos.mjs   (uses Playwright's Chromium)
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { chromium } from '@playwright/test';

const root = new URL('../', import.meta.url);
const srcDir = new URL('brand/partners/', root);
const outDir = new URL('public/partners/', root);
mkdirSync(outDir, { recursive: true });

const MAX_W = 520;
const MAX_H = 200;

// Logos delivered on a solid white background whose artwork contains no white:
// the background is made transparent so the logo sits cleanly on any tile.
const KNOCKOUT_WHITE = new Set(['reklamx.png']);

const files = readdirSync(srcDir).filter((f) => f.endsWith('.png'));
const browser = await chromium.launch();
const page = await browser.newPage();

for (const file of files) {
  const dataUrl = `data:image/png;base64,${readFileSync(new URL(file, srcDir)).toString('base64')}`;
  const knockout = KNOCKOUT_WHITE.has(file);
  const result = await page.evaluate(
    async ({ dataUrl, MAX_W, MAX_H, knockout }) => {
      const img = await new Promise((res, rej) => {
        const i = new Image();
        i.onload = () => res(i);
        i.onerror = rej;
        i.src = dataUrl;
      });
      const c = document.createElement('canvas');
      c.width = img.width;
      c.height = img.height;
      const x = c.getContext('2d');
      x.drawImage(img, 0, 0);
      if (knockout) {
        // Alpha from "distance to white": pure white → transparent, anti-aliased edges stay smooth.
        const all = x.getImageData(0, 0, c.width, c.height);
        const d = all.data;
        for (let i = 0; i < d.length; i += 4) {
          const darkness = 255 - Math.min(d[i], d[i + 1], d[i + 2]);
          const a = Math.min(255, darkness * 4);
          if (a < 255) {
            // Un-premultiply against white so edge pixels keep their true colour.
            const f = a / 255 || 1;
            for (let k = 0; k < 3; k++) d[i + k] = Math.max(0, Math.min(255, Math.round(255 - (255 - d[i + k]) / f)));
          }
          d[i + 3] = Math.min(d[i + 3], a);
        }
        x.putImageData(all, 0, 0);
      }
      const { data } = x.getImageData(0, 0, c.width, c.height);
      const px = (i, j) => data.slice((j * c.width + i) * 4, (j * c.width + i) * 4 + 4);
      // Background = top-left pixel. A pixel is "content" if it differs noticeably.
      const bg = px(0, 0);
      const isContent = (i, j) => {
        const p = px(i, j);
        if (bg[3] < 16) return p[3] > 16;
        return Math.abs(p[0] - bg[0]) + Math.abs(p[1] - bg[1]) + Math.abs(p[2] - bg[2]) > 36 || Math.abs(p[3] - bg[3]) > 24;
      };
      // Only transparent or white margins are trimmed. A coloured or black
      // background (e.g. a green square icon) is part of the brand and kept whole.
      const trimmable = bg[3] < 16 || (bg[0] > 235 && bg[1] > 235 && bg[2] > 235);
      let minX = c.width, minY = c.height, maxX = -1, maxY = -1;
      if (!trimmable) {
        minX = 0;
        minY = 0;
        maxX = c.width - 1;
        maxY = c.height - 1;
      } else for (let j = 0; j < c.height; j++)
        for (let i = 0; i < c.width; i++)
          if (isContent(i, j)) {
            if (i < minX) minX = i;
            if (i > maxX) maxX = i;
            if (j < minY) minY = j;
            if (j > maxY) maxY = j;
          }
      if (maxX < 0) return null;
      // Keep a small margin (3% of the larger side) so nothing touches the edge.
      const pad = trimmable ? Math.round(Math.max(maxX - minX, maxY - minY) * 0.03) : 0;
      minX = Math.max(0, minX - pad);
      minY = Math.max(0, minY - pad);
      maxX = Math.min(c.width - 1, maxX + pad);
      maxY = Math.min(c.height - 1, maxY + pad);
      const w = maxX - minX + 1;
      const h = maxY - minY + 1;
      const scale = Math.min(1, MAX_W / w, MAX_H / h);
      const out = document.createElement('canvas');
      out.width = Math.round(w * scale);
      out.height = Math.round(h * scale);
      const o = out.getContext('2d');
      o.imageSmoothingQuality = 'high';
      o.drawImage(c, minX, minY, w, h, 0, 0, out.width, out.height);
      return { webp: out.toDataURL('image/webp', 0.92), width: out.width, height: out.height, bg: Array.from(bg) };
    },
    { dataUrl, MAX_W, MAX_H, knockout },
  );
  if (!result) {
    console.warn(`skipped ${file}: empty image`);
    continue;
  }
  const name = file.replace(/\.png$/, '.webp');
  writeFileSync(new URL(name, outDir), Buffer.from(result.webp.split(',')[1], 'base64'));
  console.log(`${name}: ${result.width}×${result.height} (background rgba ${result.bg.join(',')})`);
}

await browser.close();
