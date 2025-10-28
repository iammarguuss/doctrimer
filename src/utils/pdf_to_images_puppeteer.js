import fs from 'node:fs/promises';
import path from 'node:path';
import puppeteer from 'puppeteer';
import sharp from 'sharp';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

/**
 * Конвертация PDF -> JPG через Puppeteer + pdfjs-dist (без системных зависимостей).
 */
export async function convertPdfToJpgsPuppeteer(pdfPath, outDir, pages = 3, dpi = 200, quality = 85) {
  await fs.mkdir(outDir, { recursive: true });
  const pdfBuf = await fs.readFile(pdfPath);
  const pdfB64 = pdfBuf.toString('base64');

  const pdfJsPath = require.resolve('pdfjs-dist/legacy/build/pdf.js');
  const pdfWorkerPath = require.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs');
  const workerCode = await fs.readFile(pdfWorkerPath, 'utf-8');

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });
  try {
    const page = await browser.newPage();
    await page.addScriptTag({ path: pdfJsPath });

    const base64List = await page.evaluate(async (params) => {
      const { pdfB64, dpi, quality, pages, workerCode } = params;
      const pdfjsLib = window.pdfjsLib || window['pdfjs-dist/build/pdf'];
      if (!pdfjsLib) throw new Error('pdfjsLib not found in page context');

      const blob = new Blob([workerCode], { type: 'text/javascript' });
      const workerUrl = URL.createObjectURL(blob);
      pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

      function b64ToBytes(b64) {
        const bin = atob(b64);
        const len = bin.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i);
        return bytes;
      }

      const data = b64ToBytes(pdfB64);
      const doc = await pdfjsLib.getDocument({ data }).promise;
      const count = Math.min(doc.numPages, pages);
      const scale = (dpi || 200) / 72;
      const q = Math.max(0, Math.min(1, (quality || 85) / 100));

      const cvs = document.createElement('canvas');
      const ctx = cvs.getContext('2d');

      const out = [];
      for (let p = 1; p <= count; p++) {
        const page = await doc.getPage(p);
        const viewport = page.getViewport({ scale });
        cvs.width = Math.floor(viewport.width);
        cvs.height = Math.floor(viewport.height);
        await page.render({ canvasContext: ctx, viewport }).promise;
        const dataUrl = cvs.toDataURL('image/jpeg', q);
        out.push(dataUrl.split(',')[1]);
      }
      return out;
    }, { pdfB64, dpi, quality, pages, workerCode });

    const outputs = [];
    for (let i = 0; i < base64List.length; i++) {
      const buf = Buffer.from(base64List[i], 'base64');
      const out = path.join(outDir, `page-${String(i + 1).padStart(3, '0')}.jpg`);
      await sharp(buf).jpeg({ quality }).toFile(out);
      outputs.push(out);
    }
    return outputs;
  } finally {
    await browser.close();
  }
}
