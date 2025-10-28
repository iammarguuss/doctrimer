// src/ai/embed_ollama.js
import { Ollama } from 'ollama';
import { config } from '../core/config.js';

const ollama = new Ollama({ host: config.ollamaHost });

export async function ensureEmbedModel() {
  try {
    const { models } = await ollama.list();
    const ok = models?.some(m => {
      const name = m?.name || '';
      return name === config.embedModel || name.startsWith(config.embedModel + ':');
    });
    if (ok) return true;
  } catch (_) { /* ignore and test via embeddings */ }

  // Пробный вызов embeddings — если вернулся вектор, считаем модель доступной
  const test = await ollama.embeddings({ model: config.embedModel, input: 'ping' });
  const vec =
    test?.embedding ||
    (Array.isArray(test?.embeddings) && Array.isArray(test.embeddings[0]) ? test.embeddings[0] : null) ||
    test?.data?.[0]?.embedding || [];
  if (Array.isArray(vec) && vec.length) return true;
  throw new Error('embeddings API вернул пустой вектор');
}

/** Получить эмбеддинг текста через Ollama embeddings API. */
export async function embedText(text) {
  const res = await ollama.embeddings({ model: config.embedModel, input: text ?? '' });
  const vector =
    res?.embedding ||
    (Array.isArray(res?.embeddings) && Array.isArray(res.embeddings[0]) ? res.embeddings[0] : null) ||
    res?.data?.[0]?.embedding ||
    [];
  return { vector, dim: vector.length };
}
