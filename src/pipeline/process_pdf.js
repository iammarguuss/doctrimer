import path from 'node:path';
import { convertPdfToJpgs } from '../utils/pdf_to_images.js';
import { classifyImageMultiple, aggregateAcrossPages } from '../ai/vision_ollama.js';
import { config } from '../core/config.js';

/** Обработка PDF: конвертация n страниц в JPG, N прогонов на страницу, агрегация по документу. */
export async function processPdf(pdfPath, { pages = 3, passes = 3 } = {}) {
  const base = path.basename(pdfPath, path.extname(pdfPath));
  const outDir = path.join(process.env.DERIVED_DIR || config.dirs.derived, base + '-' + Date.now());

  const images = await convertPdfToJpgs(pdfPath, outDir, 'page', pages, 200, 85);
  const pageResults = [];
  for (const imgPath of images) {
    const { runs, aggregated } = await classifyImageMultiple(imgPath, passes);
    pageResults.push({ image: imgPath, ensemble: { runs, vote: aggregated } });
  }
  const aggregatedDoc = aggregateAcrossPages(pageResults.map(p => p.ensemble.vote));
  return { images, pageResults, aggregatedDoc };
}
