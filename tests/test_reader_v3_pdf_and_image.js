// legacy test for direct file (pdf/image)
import path from 'node:path';
import { config } from '../src/core/config.js';
import { convertPdfToJpgsPuppeteer } from '../src/utils/pdf_to_images_puppeteer.js';
import { classifyImageMultiple, aggregateAcrossPages, buildStructuredReportFromImages } from '../src/ai/vision_ollama.js';
import { ensureEmbedModel, embedText } from '../src/ai/embed_ollama.js';

const args = process.argv.slice(2);
if (!args[0]) { console.error('node tests/test_reader_v3_pdf_and_image.js ./samples/doc.pdf'); process.exit(2); }
const inputPath = args[0];
const pages = parseInt(args[args.indexOf('--pages')+1] || '2', 10);

function isPdf(p) { return path.extname(p).toLowerCase() === '.pdf'; }

let images = [];
if (isPdf(inputPath)) {
  const base = path.basename(inputPath, path.extname(inputPath));
  const outDir = `${config.dirs.derived}/${base}-${Date.now()}`;
  images = await convertPdfToJpgsPuppeteer(inputPath, outDir, pages, 200, 85);
} else {
  images = [inputPath];
}

const pageResults = [];
for (const img of images) {
  const { runs, aggregated } = await classifyImageMultiple(img, 3);
  pageResults.push({ image: img, ensemble: { runs, vote: aggregated } });
}
const aggregatedDoc = aggregateAcrossPages(pageResults.map(p => p.ensemble.vote));
const report = await buildStructuredReportFromImages(images, aggregatedDoc, Math.min(3, images.length));

await ensureEmbedModel();
const { vector, dim } = await embedText([aggregatedDoc.summary, aggregatedDoc.extracted_text].join('\n'));

console.log('=== PDF/IMAGE REPORT (JSON) ===\n', JSON.stringify({
  meta: { pages_used: images.length },
  pages: pageResults,
  document: { vote: aggregatedDoc, report },
  text_dump: aggregatedDoc.extracted_text,
  embedding: { model: process.env.EMBED_MODEL || 'all-minilm', dim, vector }
}, null, 2));
