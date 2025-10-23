import { Ollama } from 'ollama';
import { config } from '../core/config.js';

const ollama = new Ollama({ host: config.ollamaHost });

export async function ensureEmbedModel() {
  const { models } = await ollama.list();
  const present = models.some(m => m.name === config.embedModel);
  if (!present) {
    throw new Error(
      `Модель эмбеддингов ${config.embedModel} не найдена локально. Выполни:\n` +
      `  ollama pull ${config.embedModel}`
    );
  }
}

export async function embedText(text) {
  const res = await ollama.embeddings({
    model: config.embedModel,
    input: text || ''
  });
  const vector = res?.embedding || [];
  return { vector, dim: vector.length };
}
