// API one-shot
import { analyzeImages } from '../src/api/analyze.js';

const args = process.argv.slice(2);
if (!args[0]) { console.error('node tests/test_reader_v4_api.js ./samples/pm1.jpg'); process.exit(2); }
const inputPath = args[0];

const res = await analyzeImages([inputPath], {
  passes: parseInt(args[args.indexOf('--passes')+1] || '3', 10) || 3,
  models: { vision: process.env.VISION_MODEL, embed: process.env.EMBED_MODEL },
  report: { maxImages: 1 },
  indexing: { enable: true },
  include: { pages: true, runs: true }
});
console.log('=== API RESULT ===\n', JSON.stringify(res, null, 2));
