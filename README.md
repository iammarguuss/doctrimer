# doctrimer (v0.2.0)

Документ-пайплайн с локальной VLM (через Ollama). Поддержка PDF→JPG **без системных утилит** (Puppeteer + pdfjs-dist).

## Установка
```bash
cp .env.example .env
npm install
ollama pull qwen2.5vl:7b
ollama pull all-minilm
```

## Тесты
```bash
# v5: общий конвейер: любой файл -> toJpg -> analyzeImages
npm run test:pipeline -- ./samples/your.pdf --pages 2 --passes 3 --engine puppeteer

# v4: готовый API analyzeDocument (без отдельного toJpg)
npm run test:api -- ./samples/your.jpg --passes 3

# v3: прежний тест (pdf/img)
npm run test:reader3 -- ./samples/your.pdf --pages 2 --passes 3
```

### PDF→JPG (без системных зависимостей)
По умолчанию используется **Puppeteer + pdfjs-dist**. Это npm‑зависимость, которая скачает Chromium и будет работать одинаково на Windows/macOS/Linux.
Альтернативно можно `npm i pdf-img-convert` (JS‑движок). `pdf2pic` **не нужен** (он требует ImageMagick).

Выбор движка: флаг `--engine puppeteer|pdf-img-convert|pdf2pic|auto` в `test:pipeline` (по умолчанию `puppeteer`).

