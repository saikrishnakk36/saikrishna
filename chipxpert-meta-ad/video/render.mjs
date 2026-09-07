// Render index.html to PNG frames with headless Chromium.
// node render.mjs --timeline ../output/timeline_af_heart.json --frames ../output/frames [--fps 30] [--from 0] [--to 99] [--contact]
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import fs from 'node:fs'; import path from 'node:path';
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > -1 ? process.argv[i + 1] : d; };
const here = path.dirname(new URL(import.meta.url).pathname);
const timeline = JSON.parse(fs.readFileSync(arg('--timeline', path.join(here, '../output/timeline_af_heart.json')), 'utf8'));
const framesDir = arg('--frames', path.join(here, '../output/frames'));
const fps = +arg('--fps', 30); const contact = process.argv.includes('--contact');
fs.mkdirSync(framesDir, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
await page.goto('file://' + path.join(here, 'index.html'));
await page.evaluate(() => document.fonts.ready);
await page.evaluate(tl => window.setTimeline(tl), timeline);
const end = await page.evaluate(() => window.getEnd());
const total = Math.ceil(end * fps);
const from = +arg('--from', 0), to = Math.min(total - 1, +arg('--to', total - 1));
console.log(`duration ${end.toFixed(2)}s, ${total} frames @${fps}fps, rendering ${from}..${to}`);
if (contact) {
  // one frame per scene key moment for review
  const times = [0.6, 2.4, 4.3, 6.0, 8.3, 11.6, 13.6, 16.5, 18.6, 20.4, 22.4, end - 0.3];
  for (let i = 0; i < times.length; i++) { await page.evaluate(t => window.seek(t), times[i]); await page.screenshot({ path: path.join(framesDir, `contact_${String(i).padStart(2, '0')}_${times[i].toFixed(1)}s.png`) }); }
} else {
  const t0 = Date.now();
  for (let f = from; f <= to; f++) {
    await page.evaluate(t => window.seek(t), f / fps);
    await page.screenshot({ path: path.join(framesDir, `f${String(f).padStart(5, '0')}.png`), type: 'png' });
    if (f % 100 === 0) console.log(`frame ${f}/${total} ${(Date.now() - t0) / 1000}s`);
  }
}
await browser.close(); console.log('done');
