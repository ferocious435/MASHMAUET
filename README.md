# MASHMAUET Agent

Reference-doc note:
- the project root now keeps slim entry files for heavy planning/policy docs;
- detailed long-form references live under `docs/reference/`;
- archived original source inputs live under `docs/archive/source-inputs/`.

Первый working slice backend-агента для подготовки `מסמך משמעויות`.

На этом шаге реализован контролируемый pipeline:

- `intake`
- `preprocessing`
- `work understanding`
- `clarification`
- `matching`
- `scoring`
- `calculation`
- `aggregation`
- `review`

## Что уже есть

- TypeScript/Node backend-каркас
- доменные сущности по `TZ`
- seeded template, pricebook и mapping rules
- in-memory repositories
- контролируемый case-analysis pipeline
- HTTP API для создания и анализа кейса
- тесты на pipeline
- no-dependency parser для `Dekel`-подобного `OpenXML workbook`, извлечённого из `.xlsx`
- live-summary источника `DEKEL.xlsx` в `/catalog`
- preview нормализованных `PricebookItem` из live `DEKEL.xlsx` через `/catalog/dekel-pricebook-preview`
- preliminary `אומדן` preview из live `DEKEL.xlsx` через `/catalog/dekel-estimate-preview`
- case-based live matching в `DEKEL.xlsx` через `/cases/:id/dekel-candidates`
- case-based `אומדן` preview из matched live `DEKEL` candidates через `/cases/:id/dekel-estimate-preview`

## Реальные артефакты проекта

- образец итогового документа в `HOMER/MISMAH LE DUGMA` задаёт структуру финального `מסמך משמעויות`, а не фиксированную тему
- файл `HOMER/DEKEL/*.xlsx` выступает источником строк ценника для будущего блока `אומדן`
- подтверждённая структура колонок `Dekel`:
  - `סוג שירות`
  - `פריט SSC`
  - `טקסט ארוך`
  - `מספר פעילות`
  - `כמות`
  - `יחידת מידה בסיסית`
  - `תעריף`

## Что это значит для архитектуры

- итоговый `אומדן` должен строиться не прямым копированием строк `Dekel`
- между `Dekel rows` и `output lines` нужен отдельный transformation-layer
- темы в документе могут быть разными; шаблон документа управляет формой вывода, а не предметной областью кейса
- приложение уже умеет видеть внешний workbook `HOMER/DEKEL/*.xlsx` как источник pricebook-данных
- у runtime intake нет одного обязательного порядка: пользователь может объяснить задачу текстом, документом, фото, рукописной заметкой или смешанным набором источников
- основной runtime input остаётся объяснением пользователя, а не загрузкой образцов документов
- optional `supportingEvidence` может сопровождать объяснение как supplemental layer:
  - `typed` evidence включается в `work understanding`
  - `document` evidence с извлечённым текстом может быть `primary` и использоваться как source text для анализа
  - `handwritten` evidence включается только при достаточном доверии
  - низкоуверенный `handwritten` input не считается source of truth и уходит в review-only слой
  - `photo` evidence не считается источником истины само по себе и должно сверяться с текстом/документом
- work-understanding уже умеет извлекать часть явных количеств прямо из объяснения:
  - площадь вида `12 square meters` / `12 מ"ר`
  - количество unit-based работ вроде `2 doors`
- clarification-loop уже работает как часть MVP:
  - pipeline может остановиться в `needs_clarification`
  - оператор может отправить ответы на уточняющие вопросы
  - после ответа кейс автоматически пересчитывается через тот же controlled pipeline
  - если quantity уже явно указан в объяснении, лишний clarification не поднимается

## Команды

```bash
npm test
npm run dev
```

## Default Seed IDs

- `template_id`: `masmach-template-v1`
- `pricebook_id`: `pricebook-v1`

## API

- `GET /health`
- `GET /catalog`
- `GET /catalog/mavnadim-preview`
- `POST /cases`
- `GET /cases/:id`
- `POST /cases/:id/analyze`
- `GET /cases/:id/status`
- `GET /cases/:id/clarifications`
- `POST /cases/:id/clarifications`
- `GET /cases/:id/dekel-candidates`
- `GET /cases/:id/mavnadim-candidates`
- `POST /cases/:id/dekel-selection`
- `GET /cases/:id/dekel-selection`
- `GET /cases/:id/dekel-estimate-preview`
- `GET /cases/:id/output-draft`
- `GET /cases/:id/outputs`
- `POST /cases/:id/generate`

## MAVNADIM Notes

- `HOMER/MAVNADIM/*` is a separate structured source for ready-made modular buildings.
- `MAVNADIM` candidates are selected first as ready-made structures, not as `DEKEL` billable rows.
- Ancillary works such as electricity, water, sewer, foundations, and placement infrastructure remain a review layer and may require additional `DEKEL` rows depending on the case.

## Generated Artifacts

- `POST /cases/:id/generate` now persists an export package under `artifacts/generated-cases/<caseId>/`.
- The main document is no longer a flat draft only; it is now rendered through a template engine with fixed sections aligned to the sample `מסמך משמעויות` structure:
  - `נתוני מסמך`
  - `אומדן`
  - `להלן פילוח תקציבי לעבודה`
  - `לוח עקרוני (מתייחס למדדי גאנט)`
  - `ניהול סיכונים`
- The generated artifact set currently contains:
  - `main-document.md`
  - `detailed-cost-sheet.csv`
  - `review-sheet.md`
  - `output-package.json`
- The response now includes `exportManifest`, and the same artifact manifest is stored in `case.analysis.generatedArtifacts`.
