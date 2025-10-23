import path from 'node:path';
import { classifyFromImage } from '../ai/vision_ollama.js';
// сюда позже добавим OCR и работу с PDF

export async function processSingleFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  // В первой итерации — обрабатываем именно изображения (jpg/png).
  if (['.jpg', '.jpeg', '.png', '.webp'].includes(ext)) {
    const result = await classifyFromImage(filePath);
    return { kind: 'image', result };
  }
  return { kind: 'unknown', result: { doc_type: 'unknown', confidence: 0 } };
}
