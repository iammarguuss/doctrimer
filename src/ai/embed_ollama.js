// src/ai/embed_ollama.js (patch): используем 'prompt' вместо 'input' + совместимость
import { Ollama } from 'ollama';
import { config } from '../core/config.js';

const ollama = new Ollama({ host: config.ollamaHost });

async function extractVector(res) {
  return res?.embedding ||
         (Array.isArray(res?.embeddings) && Array.isArray(res.embeddings[0]) ? res.embeddings[0] : null) ||
         res?.data?.[0]?.embedding ||
         [];
}

export async function ensureEmbedModel() {
  try {
    const { models } = await ollama.list();
    const ok = models?.some(m => {
      const name = m?.name || '';
      return name === config.embedModel || name.startsWith(config.embedModel + ':');
    });
    if (ok) return true;
  } catch (_) { /* ignore */ }
  // Пингуем embeddings
  let res;
  try {
    res = await ollama.embeddings({ model: config.embedModel, prompt: 'ping' });
  } catch {
    // старые клиенты могли ожидать 'input'
    res = await ollama.embeddings({ model: config.embedModel, input: 'ping' });
  }
  const vec = await extractVector(res);
  if (Array.isArray(vec) && vec.length) return true;
  throw new Error('embeddings API вернул пустой вектор');
}

export async function embedText(text) {
  let res;
  try {
    res = await ollama.embeddings({ model: config.embedModel, prompt: text ?? '' });
  } catch {
    res = await ollama.embeddings({ model: config.embedModel, input: text ?? '' });
  }
  const vector = await extractVector(res);
  return { vector, dim: vector.length };
}
