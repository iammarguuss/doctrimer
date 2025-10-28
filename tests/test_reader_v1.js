// simple one-shot image test
import { Ollama } from 'ollama';
import fs from 'node:fs/promises';

const args = process.argv.slice(2);
if (!args[0]) { console.error('node tests/test_reader_v1.js ./samples/pm1.jpg'); process.exit(2); }
const imagePath = args[0];
const model = process.env.VISION_MODEL || 'qwen2.5vl:7b';
const host = process.env.OLLAMA_HOST || 'http://127.0.0.1:11434';
const ollama = new Ollama({ host });

const schema = {
  type: 'object',
  properties: {
    doc_type: { type: 'string' },
    confidence: { type: 'number' },
    language: { type: 'string' },
    summary: { type: 'string' },
    extracted_text: { type: 'string' },
    entities: { type: 'object', additionalProperties: true }
  },
  required: ['doc_type', 'confidence'],
  additionalProperties: true
};

const buf = await fs.readFile(imagePath);
const b64 = buf.toString('base64');
const resp = await ollama.chat({
  model, stream: false, format: schema,
  messages: [{ role:'user', content:'Определи тип документа и ключевые поля. ТОЛЬКО JSON.', images:[b64] }],
  options: { temperature: 0 }
});
console.log('=== RESULT JSON ===\n', resp?.message?.content || '');
