import fs from 'node:fs/promises';
import path from 'node:path';
import { run, existsOnPath } from './cmd.js';

/**
 * Конвертирует PDF в JPEG-страницы. Предпочитает pdftoppm (Poppler), иначе ImageMagick (magick + Ghostscript).
 * Возвращает массив путей к jpg в порядке страниц.
 */
export async function convertPdfToJpgs(pdfPath, outDir, baseName = 'page', maxPages = 3, dpi = 200, quality = 85) {
  await fs.mkdir(outDir, { recursive: true });
  const usePoppler = await existsOnPath('pdftoppm', ['-v']);
  const outputs = [];

  if (usePoppler) {
    const outPrefix = path.join(outDir, baseName);
    const args = ['-jpeg', '-r', String(dpi), '-f', '1', '-l', String(maxPages), pdfPath, outPrefix];
    const r = await run('pdftoppm', args);
    if (r.code !== 0) throw new Error(`pdftoppm error: ${r.stderr || r.stdout}`);

    const files = await fs.readdir(outDir);
    for (const fn of files) {
      if (fn.startsWith(baseName + '-') && fn.toLowerCase().endsWith('.jpg')) {
        outputs.push(path.join(outDir, fn));
      }
    }
    outputs.sort((a,b) => a.localeCompare(b, undefined, { numeric: true }));
    if (!outputs.length) throw new Error('pdftoppm сделал пустой вывод (jpg не найдены)');
    return outputs;
  }

  // Fallback: ImageMagick (magick) + Ghostscript
  const hasMagick = await existsOnPath('magick', ['-version']);
  if (!hasMagick) {
    throw new Error('Не найдено ни pdftoppm (Poppler), ни ImageMagick (magick). Установи Poppler ИЛИ ImageMagick+Ghostscript и добавь в PATH.');
  }
  const range = `[0-${Math.max(0, maxPages - 1)}]`;
  const outPattern = path.join(outDir, baseName + '-%03d.jpg');
  const args = ['-density', String(dpi), pdfPath + range, '-quality', String(quality), '-strip', outPattern];
  const r = await run('magick', args);
  if (r.code !== 0) {
    // Некоторые сборки используют alias 'convert'
    const r2 = await run('convert', args);
    if (r2.code !== 0) {
      throw new Error(`ImageMagick error: ${(r.stderr || '') + (r2.stderr || '') || (r.stdout || '') + (r2.stdout || '')}`);
    }
  }

  const files = await fs.readdir(outDir);
  for (const fn of files) {
    if (fn.startsWith(baseName + '-') && fn.toLowerCase().endsWith('.jpg')) {
      outputs.push(path.join(outDir, fn));
    }
  }
  outputs.sort((a,b) => a.localeCompare(b, undefined, { numeric: true }));
  if (!outputs.length) throw new Error('ImageMagick сделал пустой вывод (jpg не найдены)');
  return outputs;
}
