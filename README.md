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
npm run check
npm run test:e2e
npm test
npm run dev
```

`npm run check` выполняет строгую проверку TypeScript, а затем весь набор тестов.
`npm run test:e2e` запускает настоящий Chromium и проверяет создание проекта,
DEKEL, HTML-экспорт, мобильную навигацию и подготовку кадров реального WebM.

## Локальный интерфейс

Для обычного запуска в Windows достаточно открыть двойным щелчком:

`START-MASHMAUET.cmd`

На новом компьютере перед первым чтением звука из видео один раз выполните:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\setup-local-media.ps1
```

Скрипт устанавливает локальные FFmpeg/Whisper только после проверки закреплённых
SHA-256. Подробности и лицензии: [`docs/THIRD-PARTY-MEDIA.md`](docs/THIRD-PARTY-MEDIA.md).

Скрипт запускает локальный сервер в фоне и открывает страницу
`http://127.0.0.1:3000`. Регистрация, имя пользователя и пароль в приложении
не требуются.

Локальный интерфейс включает:

- отдельные локальные проекты с описанием и материалами;
- официальный редактируемый шаблон `מסמך משמעויות`;
- `פירוט האומדן` из 3–5 агрегированных типов работ;
- отдельный блок `כתב כמויות` без скидок и с НДС только в итогах;
- расчёт 7.4%, 5.4% и 2.7% от суммы исполнения, уже включающей НДС;
- проектный экран проверки DEKEL: автоматический подбор до трёх кандидатов,
  рекомендуемый выбор без опросника, ввод любого существующего в глобальном
  DEKEL кода, контроль единиц и количества, удаление явно исключённых строк,
  применение в `כתב כמויות` с версией и сноской на строку исходного XLSX;
- DEKEL подключён один раз как постоянный системный прайс-лист и является
  единственным источником цен по умолчанию для всех проектов; любой другой
  прайс-лист полностью исключён из расчёта независимо от его расположения — в
  папке проекта, глобальной папке или другом каталоге — пока владелец сам явно не
  назовёт конкретный файл и не потребует использовать именно его;
- перед применением выполняется обязательная финансовая сверка: нетто по строкам,
  НДС 18%, 3–5 строк `פירוט האומדן`, надбавки 7.4%, 5.4% и 2.7% от суммы с НДС
  и общий итог должны совпасть до агоры;
- основной документ из трёх фиксированных страниц A4 в альбомной ориентации и
  отдельный `כתב כמויות` в книжной ориентации; полные описания не обрезаются,
  денежные значения выводятся с разделителями тысяч и двумя знаками после запятой;
  если после безопасного уплотнения текст всё же выходит за A4, страница явно
  помечается, а печать и экспорт блокируются до исправления — скрытого обрезания нет;
- полноэкранный режим документа без проектной и чат-панелей;
- локальные версии документа, печать/сохранение в PDF со смешанной ориентацией
  страниц и автономный экспорт HTML;
- проектную историю настоящего чата Codex: при каждом ответе учитываются недавний
  диалог, описание, документ, расчёт, материалы и подтверждённые правила только
  текущего проекта;
- чтение PDF (включая визуальное чтение сканированных страниц), Excel `.xlsx`,
  CSV/TSV, TXT/Markdown/JSON, DOCX, фотографий и видео `.mp4/.m4v/.mov/.webm`;
- локальную подготовку ключевых кадров видео, просмотр исходного видео и
  распознавание печатного/рукописного текста и видимых строительных работ через
  подключённый Codex; звуковая дорожка не выдаётся за услышанную без отдельной
  текстовой расшифровки;
- скрытый контекстный поиск по глобальным справочникам 3210 и «Синей книге»:
  система выбирает только относящиеся к вопросу договорные разделы или
  технические главы, учитывает листы исправлений и передаёт чату точные страницы;
  справочники помогают понять состав, порядок, измерение и включение работ в цену,
  но не меняют документ, интерфейс и не считаются автоматически применимыми к
  конкретному проекту;
- предложения изменений с отдельным подтверждением: взаимосвязанные изменения
  документа применяются одной операцией после полной проверки и сохранения версии;
  устаревшее предложение блокируется, а чат не может менять общие правила;
- контролируемую ошибку чата с повтором без повторного набора вопроса; временный
  обрыв ответа Codex не завершает локальный сервер;
- постоянное хранение проектов и файлов в `local-data/` — данные остаются после
  закрытия браузера и перезапуска программы.
- редактирование названия и описания проекта;
- карточку каждого материала с просмотром извлечённого содержания, ручным
  исправлением, возвратом к оригиналу, повторным чтением без потери сохранённой
  правки, анализом через Codex, переходом к обсуждению, скачиванием и безопасным
  удалением;
- центр системы с состоянием хранилища и Codex, ручными/автоматическими
  резервными копиями, восстановлением и архивом проектов;
- единые подтверждения перед удалением, архивированием и восстановлением;
- понятные состояния загрузки, пустого списка, успеха и ошибки с повтором;
- адаптивные отдельные вкладки «Проекты / Документ / Чат» на телефоне и планшете,
  без горизонтального переполнения всей страницы.

Codex App Server устанавливается вместе с проектом и запускается автоматически.
Если текущая сессия ChatGPT/Codex активна, дополнительный вход не нужен. Если
сессия закончилась, интерфейс откроет официальный одноразовый вход; пароль в
MASHMAUET не вводится и не хранится.

### Надёжность локального backend

- сервер принимает соединения только с `127.0.0.1` и отклоняет запросы с
  посторонних сайтов;
- данные каждого проекта изолированы, внутренние пути и идентификатор чата Codex
  не передаются браузеру;
- сохранение JSON атомарное: незавершённая запись не заменяет рабочий файл;
- есть версии документа, безопасное архивирование проектов, автоматическая
  ежедневная и ручная резервная копия;
- восстановление резервной копии требует явного подтверждения и само создаёт
  страховочную копию текущего состояния;
- загрузки ограничены 100 МБ, форматы и сигнатуры файлов проверяются до чтения;
- ошибки возвращаются в контролируемом виде с `requestId`, а локальный журнал не
  сохраняет сообщения, содержимое файлов и токены;
- предложения чата проверяются по полной схеме документа и финансовым правилам;
  чат не может подменить подтверждённые код или цену DEKEL;
- остановка сервера завершает текущие соединения и процесс Codex корректно.

Инструкция по диагностике, резервным копиям и восстановлению находится в
[`docs/BACKEND-RUNBOOK.md`](docs/BACKEND-RUNBOOK.md).
Архитектурные границы справочных источников описаны в
[`docs/architecture/ADR-001-professional-reference-retrieval.md`](docs/architecture/ADR-001-professional-reference-retrieval.md).

### API локального приложения

- `GET /local/health` — состояние хранилища и диагностика повреждений;
- `GET|POST /local/projects` — список и создание проектов;
- `GET|PUT /local/projects/:id` — чтение и сохранение проекта;
- `POST /local/projects/:id/archive` — безопасное архивирование с подтверждением;
- `GET /local/archived-projects` и `POST /local/archived-projects/:id/restore`;
- `POST|GET|DELETE /local/projects/:id/materials...` — загрузка, просмотр,
  удаление и повторная обработка PDF, Excel, документов, фотографий и видео;
- `GET|PUT /local/projects/:id/materials/:materialId/content` — просмотр и
  исправление прочитанного текста с сохранением оригинала;
- `POST /local/projects/:id/materials/:materialId/analyze` — распознавание и
  профессиональный анализ материала через Codex;
- `POST /local/projects/:id/materials/:materialId/video-frames` — сохранение
  локально извлечённых ключевых кадров видео;
- `POST /local/projects/:id/versions` и
  `POST /local/projects/:id/versions/:versionId/restore`;
- `POST /local/projects/:id/chat` — проектный чат через текущий аккаунт Codex;
- `POST /local/projects/:id/proposals/:proposalId/apply|reject` — подтверждение
  или отклонение предложенного чатом изменения;
- `GET /local/projects/:id/dekel` и `POST /local/projects/:id/dekel/analyze` —
  состояние прайс-листа и создание проектной проверки;
- `PUT /local/projects/:id/dekel/lines/:lineId` — корректировка выбранной строки
  и количества; `POST /local/projects/:id/dekel/apply` — применение с явным
  подтверждением и автоматическим сохранением предыдущей версии;
- `GET|POST /local/backups` и `POST /local/backups/:id/restore`;
- `GET /local/codex/status` и `POST /local/codex/login`.

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
