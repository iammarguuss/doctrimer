// Slim pipeline: toJpg(pdf-img-convert only) -> analyzeImages
import { toJpg } from '../src/api/to_jpg.js';
import { analyzeImages } from '../src/api/analyze.js';

const args = process.argv.slice(2);
if (!args[0]) {
  console.error('node tests/test_reader_v5_pipeline.js ./samples/pm2.pdf --pages 2 --passes 3');
  process.exit(2);
}
function arg(name, def) { const i = args.indexOf(name); return i >= 0 ? args[i+1] : def; }

const inputPath = args[0];
const pages   = parseInt(arg('--pages','3'),10) || 3;
const passes  = parseInt(arg('--passes','3'),10) || 3;
const dpi     = parseInt(arg('--dpi','200'),10) || 200;
const quality = parseInt(arg('--quality','85'),10) || 85;

const jpg = await toJpg(inputPath, { pages, dpi, quality });
console.log(`[ok] toJpg engine: ${jpg.engine}, pages: ${jpg.images.length}`);

const result = await analyzeImages(jpg.images, {
  passes,
  models: { vision: process.env.VISION_MODEL, embed: process.env.EMBED_MODEL },
  report: { maxImages: Math.min(1, jpg.images.length) }, // PDF: 1 картинку в report по умолчанию
  indexing: { enable: true },
  include: { pages: true, runs: jpg.sourceType === 'pdf' ? false : true },
  pdf: { light: true },
  sourceType: jpg.sourceType
});

console.log('=== PIPELINE RESULT ===\n', JSON.stringify(result, null, 2));
