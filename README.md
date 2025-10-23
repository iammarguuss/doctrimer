# doctrimer (v0)

Локальный пайплайн для приёма сканов/изображений, понимания документа (VLM), извлечения ключевых полей, индексации и поиска.

## Стек
- **Ollama** (локальные модели: vision `qwen2.5vl`, `llava`; эмбеддинги `all-minilm`/`nomic-embed-text`)
- **Node.js** (ESM), **chokidar**, **sharp**, **pdf-parse**, **tesseract.js**
- **SQLite** + **sqlite-vec** для векторного поиска
- Минимальный тест `tests/test_reader_v1.js` для подачи изображения в локальную VLM

## Быстрый старт

1) Установи [Ollama](https://ollama.com/), запусти сервис и вытяни модель:
```bash
ollama pull qwen2.5vl:7b
# альтернативно:
# ollama pull llava:13b
```

2) Подготовь проект:
```bash
cp .env.example .env
npm install
```

3) Проверка тестом (подай путь к картинке/скану):
```bash
npm run test:reader -- ./samples/your_image.jpg
```

4) Запуск приложения (инбокс‑ватчер):
```bash
npm run dev
# положи файл в data/inbox и смотри логи
```

> Примечания
> - Для structured outputs задаём `format` со схемой JSON (см. `src/ai/vision_ollama.js`).
> - В первой версии обработчик файлов работает с изображениями. Поддержку PDF+OCR добавим в следующих итерациях.
> - `sqlite-vec` инициализируется в `src/db/vector_index.js`.

## Структура

```
data/
  inbox/      # входящие файлы
  objects/    # хранилище «объектов» по стабильным id
  by-index/   # дубли под индексными именами
migrations/   # SQL миграции
src/
  app.js
  ai/
  core/
  db/
  ingest/
  pipeline/
  schema/
  utils/
tests/
  test_reader_v1.js
```

## Лицензия
MIT (по умолчанию, можно сменить).
