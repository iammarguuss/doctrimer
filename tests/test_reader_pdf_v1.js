// Запуск: node tests/test_reader_pdf_v1.js ./path/to/file.pdf
import { processSingleFile } from '../src/pipeline/process_file.js';

const args = process.argv.slice(2);
if (!args[0]) {
  console.error('Укажи путь к PDF: node tests/test_reader_pdf_v1.js ./samples/pm2.pdf');
  process.exit(2);
}

async function main() {
  const out = await processSingleFile(args[0]);
  console.log('=== PDF REPORT JSON ===\n', JSON.stringify(out, null, 2));
}

main().catch(e => {
  console.error('Ошибка в test_reader_pdf_v1:', e);
  process.exit(1);
});
