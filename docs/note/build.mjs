// Builds docs/Dag_concept_note_SiliconKnights.pdf from docs/note/concept-note.html.
//   npm i -D playwright && npx playwright install chromium   (once)
//   node docs/note/build.mjs
import { chromium } from 'playwright';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const src = pathToFileURL(path.join(here, 'concept-note.html')).href;
const out = path.join(here, '..', 'Dag_concept_note_SiliconKnights.pdf');

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(src, { waitUntil: 'networkidle' });
await page.evaluate(() => document.fonts.ready);
await page.pdf({ path: out, format: 'A4', printBackground: true, preferCSSPageSize: true });
await browser.close();
console.log('wrote', out);
