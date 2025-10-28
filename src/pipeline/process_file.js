import path from 'node:path';
import { classifyFromImage } from '../ai/vision_ollama.js';

export async function processSingleFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (['.jpg', '.jpeg', '.png', '.webp'].includes(ext)) {
    const result = await classifyFromImage(filePath);
    return { kind: 'image', result };
  }
  return { kind: 'unknown', result: { doc_type: 'unknown', confidence: 0 } };
}
