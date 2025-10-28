// src/api/to_jpg.js
// PDF -> JPG через @hyzyla/pdfium (WASM) + sharp; никаких системных утилит.
// Изображения конвертируются в JPG через sharp как и раньше.

import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { config } from '../core/config.js';

const IMG_EXTS = ['.jpg', '.jpeg', '.png', '.webp', '.tif', '.tiff', '.bmp', '.heic'];
const isPdf = p => path.extname(p).toLowerCase() === '.pdf';
const isImg = p => IMG_EXTS.includes(path.extname(p).toLowerCase());

// Инициализируем PDFium один раз на процесс.
let _pdfiumLibPromise = null;
async function getPdfium() {
  if (!_pdfiumLibPromise) {
    const { PDFiumLibrary } = await import('@hyzyla/pdfium');
    _pdfiumLibPromise = PDFiumLibrary.init();
  }
  return _pdfiumLibPromise;
}

/**
 * Универсальный toJpg:
 *  - JPG/JPEG: passthrough
 *  - другие изображения: sharp -> JPG
 *  - PDF: PDFium(WASM) -> bitmap -> JPEG через sharp
 * Возвращает { engine, images[], outDir|null, sourceType }
 */
export async function toJpg(inputPath, { pages = 3, dpi = 200, quality = 85 } = {}) {
  const base = path.basename(inputPath, path.extname(inputPath));
  const outDir = path.join(process.env.DERIVED_DIR || config.dirs.derived, `${base}-${Date.now()}`);
  const ext = path.extname(inputPath).toLowerCase();

  // Готовый JPG — просто вернём как есть
  if (ext === '.jpg' || ext === '.jpeg') {
    return { engine: 'passthrough', images: [inputPath], outDir: null, sourceType: isPdf(inputPath) ? 'pdf' : 'image' };
  }

  // Любое другое изображение — сведём к JPG
  if (!isPdf(inputPath) && isImg(inputPath)) {
    await fs.mkdir(outDir, { recursive: true });
    const dst = path.join(outDir, `${base}.jpg`);
    await sharp(inputPath).rotate().jpeg({ quality }).toFile(dst);
    return { engine: 'sharp', images: [dst], outDir, sourceType: 'image' };
  }

  // PDF -> JPG через PDFium (WASM)
  if (isPdf(inputPath)) {
    await fs.mkdir(outDir, { recursive: true });
    const buf = await fs.readFile(inputPath);
    const pdfium = await getPdfium();
    const doc = await pdfium.loadDocument(buf);
    try {
      const images = [];
      const scale = Math.max(1, (dpi || 200) / 72); // 72dpi — базовая единица PDF
      for (const page of doc.pages()) {
        if (images.length >= pages) break;

        // Рендерим страницу в bitmap и кодируем в JPEG через sharp.
        const img = await page.render({
          scale,
          // Кастомный рендер-функшен: получаем RGBA-буфер и отдаём JPEG с нужным quality
          render: async (options) => {
            return await sharp(options.data, {
              raw: { width: options.width, height: options.height, channels: 4 }
            }).jpeg({ quality }).toBuffer();
          }
        });

        const out = path.join(outDir, `page-${String(page.number).padStart(3, '0')}.jpg`);
        await fs.writeFile(out, Buffer.from(img.data));
        images.push(out);
      }
      return { engine: 'pdfium-wasm', images, outDir, sourceType: 'pdf' };
    } finally {
      doc.destroy();
      // Библиотеку (pdfium) оставляем жить в процессе для последующих вызовов
    }
  }

  throw new Error(`Неподдерживаемый формат: ${ext}`);
}
