# Doctrimer v0.3 (user working build)

Локальный пайплайн обработки документов (сканы/фото/PDF) на базе **Ollama** и **PDFium (WASM)**.
Цель — быстро отдать единый **JSON‑отчёт** с типом документа, кратким резюме, извлечёнными сущностями и заготовкой для индексации.

> Эта версия — «рабочая v0.3» на основе текущего кода (скрипт `test:pipeline` и PDF→JPG через `@hyzyla/pdfium`).

---

## 1) Установка

```bash
# зависимости из package.json
npm install

# локальные модели Ollama (пример)
ollama pull qwen2.5vl:7b
ollama pull all-minilm  # для эмбеддингов (опционально, но рекомендовано)
```

Создайте `.env` из примера (если его нет):

```bash
copy .env.example .env    # PowerShell/cmd (Windows)
# или
cp .env.example .env      # bash
```

Ключевые переменные:
```
OLLAMA_HOST=http://127.0.0.1:11434
VISION_MODEL=qwen2.5vl:7b
EMBED_MODEL=all-minilm

# каталоги данных
SQLITE_PATH=./data/doctrimer.db
INBOX_DIR=./data/inbox
OBJECTS_DIR=./data/objects
BY_INDEX_DIR=./data/by-index
DERIVED_DIR=./data/derived
```

---

## 2) Быстрый старт (через пайплайн)

### PDF → анализ
```bash
npm run test:pipeline -- ./samples/your.pdf --pages 2 --passes 3 --dpi 300 --quality 90
```

### Изображение → анализ
```bash
npm run test:pipeline -- ./samples/your.jpg --passes 3
```

Ожидаемый вывод:
- строка вида `[ok] toJpg engine: pdfium-wasm, pages: N` (для PDF) или `passthrough/sharp` (для изображений);
- JSON‑отчёт `PIPELINE RESULT` (в stdout), который содержит:
  - `meta` — параметры прогона и моделей;
  - `pages[]` — по странице: агрегация (vote) и, при необходимости, `runs` (индивидуальные проходы модели);
  - `document.vote` — агрегат по документу;
  - `document.report` — финальный отчёт (JSON) для индекса;
  - `text_dump` — общий текст;
  - `embedding` — вектор (если есть `EMBED_MODEL` и модель потянута в Ollama).

> Примечание по PDF: по умолчанию действует «лёгкий режим» — `passes=1`, `runs=false`, `report` строится по 1–2 изображениям.

---

## 3) Как это работает (две схемы)

### 3.1. API‑уровень (внешний сценарий)

```
tests/test_reader_v5_pipeline.js
   └─► toJpg(inputPath, { pages, dpi, quality })
   └─► analyzeImages(imagePaths, {
          passes,
          include,
          pdf: { light: true|false },
          sourceType: 'pdf'|'image',
          models: { vision, embed }
       })
       └─► выводит единый JSON отчёт в stdout
```

**`toJpg`**
- Если вход — PDF → рендер через **@hyzyla/pdfium (WASM)** в JPEG‑страницы (через `sharp`), возвращает `{ engine: 'pdfium-wasm', images[], outDir, sourceType: 'pdf' }`.
- Если вход — PNG/WebP/TIFF и пр. → конвертация в JPEG через `sharp` → `{ engine: 'sharp', images[], ... }`.
- Если вход уже JPEG → `{ engine: 'passthrough', images: [исходный путь], ... }`.

**`analyzeImages`**
- Делает несколько проходов VLM по каждой странице (по умолчанию `passes=3` для изображений и `1` для PDF‑режима `pdf.light=true`).
- Агрегирует ответы в `pages[*].ensemble.vote` и затем по документу -> `document.vote`.
- Строит итоговый `document.report` (строгий JSON) для индекса/поиска.
- По возможности строит `embedding` для текста (если есть модель эмбеддингов).

### 3.2. Внутренняя последовательность (детально)

```
analyzeImages(images, options)
  ├─ ensureVisionModel()  // проверка наличия VLM в Ollama
  ├─ [indexing] ensureEmbedModel()  // проверка модели эмбеддингов
  ├─ По каждой странице:
  │    └─ classifyImageMultiple(imagePath, passes)
  │         ├─ N раз: classifyFromImage(imagePath)
  │         │     ├─ VLM (Ollama.chat) с картинкой -> JSON (type, entities, text, summary, confidence)
  │         │     └─ [fallback] если текста мало -> OCR(tesseract.js)
  │         └─ aggregateRuns(runs) -> vote по странице
  ├─ aggregateAcrossPages(votes[]) -> document.vote
  ├─ buildStructuredReportFromImages(imagePaths, document.vote, maxImages=1..2) -> document.report (строгий JSON)
  ├─ text_dump = document.vote.extracted_text
  └─ [indexing] embedText(summary + text + entities_json) -> embedding.vector
```

**Где что лежит:**
- Конвертер PDF→JPG: `src/api/to_jpg.js`  
- Аналитика и агрегация: `src/api/analyze.js`  
- Вызовы VLM + отчёт: `src/ai/vision_ollama.js`  
- Эмбеддинги Ollama: `src/ai/embed_ollama.js`  
- OCR fallback: `src/ai/ocr_tesseract.js`  
- Конфиг: `src/core/config.js`

---

## 4) Зависимости и модели

- **PDF → JPG:** `@hyzyla/pdfium` + `sharp` (всё из npm, без Poppler/Ghostscript/Cairo).
- **VLM (vision):** `qwen2.5vl:7b` (или другая локальная модель в Ollama).
- **Эмбеддинги:** `all-minilm` (через `ollama.embeddings`).
- **OCR fallback:** `tesseract.js` (вызывается только если текст от VLM слишком короткий).

> Если `embedding.dim = 0` — проверь, что `ollama pull all-minilm` сделан и Ollama доступен по `OLLAMA_HOST`.

---

## 5) Тонкая настройка

- `--pages` — сколько страниц брать из PDF (рекомендуем 1–2 для скорости).
- `--dpi` — качество рендера PDF в изображение (`300` — хороший баланс для OCR).
- `--passes` — количество проходов VLM на изображение (для PDF по умолчанию 1 при `pdf.light=true`).
- `--quality` — JPEG качество (по умолчанию 85–90).

**Логи Tesseract** вида `Image too small to scale` — значит исходная страница очень маленькая. Для PDF поднимите `--dpi`, для фото попробуйте исходники с большим разрешением.

---

## 6) FAQ / Troubleshooting

- **PDF не рендерится**: убедитесь, что `@hyzyla/pdfium` и `sharp` установлены (`npm ls @hyzyla/pdfium sharp`).  
- **VLM жалуется «модель не найдена»**: сделайте `ollama pull <название>` и проверьте `OLLAMA_HOST`.
- **Пустые эмбеддинги**: `ollama pull all-minilm`. Иногда помогает явная перезагрузка `ollama serve`.

---

## 7) Планы/идеи (дальше по проекту)

- Сохранение отчётов + эмбеддингов в SQLite (`better-sqlite3` + `sqlite-vec`).
- CLI `doctrimer index <path>` и `doctrimer search "<query>"`.
- Типо‑специфичные парсеры (регэкспы) для ID‑карт/квитанций для ещё более стабильных полей.
