# ROADMAP - MASHMAUET Agent

Status: Active Living Document  
Version: 0.1  
Last Updated: 2026-04-15  
Source of Truth: `PRD.md`

## 1. Назначение

Этот roadmap переводит `PRD` в управляемый план исполнения до завершения проекта.

Он отвечает на 5 вопросов:

- что уже сделано;
- что делаем сейчас;
- что идет следующим;
- от чего зависят следующие шаги;
- по каким признакам считаем фазу завершенной.

## 2. Текущее состояние

На момент создания roadmap проект уже имеет рабочую техническую базу:

- backend skeleton;
- controlled pipeline;
- clarification loop;
- live read для `DEKEL`;
- matching preview;
- flow для `MAVNADIM`;
- confirmed selection;
- output draft;
- output package;
- export artifacts;
- template engine;
- skill orchestration and trace layer.

Это значит, что проект уже вышел из стадии "нулевого прототипа".  
Следующий фокус - не просто добавлять функции, а доводить продуктовую логику, качество matching, текстовую политику и реальную пригодность для живых кейсов.

## 3. Принципы исполнения

1. Сначала закрепляем продуктовые правила, потом усиливаем реализацию.
2. Не расширяем scope раньше, чем стабилизируем MVP-ядро.
3. Не считаем feature завершенной, если она не проходит живые кейсы.
4. Любой спорный auto-behavior должен иметь clarification или review-gate.
5. Формат документа и текстовая политика считаются такими же важными, как matching и calculation.

## 4. Фазы проекта

## Фаза 0. Foundation and Governance

Status: Done / Baseline Ready

Цель:

- подготовить проектную базу, skills, архитектурный скелет и начальный runtime pipeline.

Что входит:

- skill layer;
- governance and router;
- backend skeleton;
- controlled pipeline;
- базовые API;
- initial tests;
- базовый export flow.

Критерий завершения:

- система существует как рабочий каркас, а не как идея.

## Фаза 1. Product Foundation and Text Policy

Status: In Progress

Цель:

- закрепить продуктовую логику и формализовать правила текста и формата документа.

Ключевые deliverables:

- living `PRD.md`;
- `ROADMAP.md`;
- `BACKLOG.md`;
- text policy matrix по разделам документа;
- wording rules by section;
- section contracts для `מסמך משמעויות`;
- quantity rule matrix;
- список обязательных и условных секций;
- правила, когда спрашивать пользователя, а когда разрешен auto-text.

Критические зависимости:

- sample document understanding;
- текущий template engine;
- реальные живые кейсы;
- подтверждение product rules.

Exit criteria:

- для каждого раздела документа понятно:
  - источник истины;
  - тип текста;
  - правило генерации;
  - review rule;
  - clarification trigger.

## Фаза 2. Input Understanding and Clarification Hardening

Status: Next

Цель:

- сделать intake устойчивым к реальным форматам пользовательского объяснения.

Ключевые deliverables:

- более надежный shorthand parsing;
- document-first support;
- structured handling of mixed input;
- formal handwritten policy;
- improved clarification strategy;
- extraction of work entities, dimensions, quantities and scope hints.

Критические зависимости:

- text policy;
- clarification rules;
- реальные примеры входов.

Exit criteria:

- система надежно различает:
  - primary text;
  - supporting document;
  - handwriting hints;
  - photo-only uncertainty.

## Фаза 3. Retrieval and Matching Hardening

Status: Next

Цель:

- довести matching по `DEKEL` и `MAVNADIM` до уровня, полезного на живых кейсах.

Ключевые deliverables:

- stronger work-item-aware retrieval;
- chapter-aware balancing;
- mixed-work balancing;
- ancillary works policy;
- confidence rules;
- improved candidate explanation;
- live evaluation on real cases.

Критические зависимости:

- качественные structured work items;
- chapter and section logic;
- live cases;
- review feedback.

Exit criteria:

- reviewer чаще видит релевантные кандидаты наверху, а не шумовые строки.

## Фаза 4. Calculation and Aggregation Hardening

Status: Planned

Цель:

- обеспечить корректный quantity logic и перенос в шаблон без потери смысла.

Ключевые deliverables:

- unit-specific quantity logic;
- direct / derived / estimated quantity rules;
- ancillary quantity support;
- stronger mapping rules;
- aggregation validation;
- trace from source line to template row.

Критические зависимости:

- подтвержденные candidates;
- section mapping;
- template rules.

Exit criteria:

- `אומדן` и budget blocks устойчиво собираются без логических расхождений.

## Фаза 5. Template and Output Hardening

Status: Planned

Цель:

- довести главный документ до стабильного рабочего формата.

Ключевые deliverables:

- finalized section contracts;
- stable wording rules;
- stronger schedule section;
- stronger risk section;
- better appendices and review sheet behavior;
- export-ready `DOCX/PDF` strategy.

Критические зависимости:

- text policy matrix;
- output mapping;
- review feedback on real examples.

Exit criteria:

- generated `מסמך משמעויות` выглядит и ведет себя как рабочий документ, а не как технический draft.

## Фаза 6. Live Validation and Production Readiness

Status: Planned

Цель:

- довести MVP до уровня реального использования.

Ключевые deliverables:

- серия live-case проверок;
- список типовых failure patterns;
- product corrections;
- retrieval corrections;
- text corrections;
- release acceptance checklist.

Критические зависимости:

- живые кейсы;
- feedback от review;
- стабильный output package.

Exit criteria:

- команда считает систему пригодной к реальной работе на ожидаемых типах кейсов.

## 5. Межфазные зависимости

Следующие блоки нельзя полноценно завершить без предыдущих:

- без text policy нельзя считать template/output завершенными;
- без stabilized intake нельзя честно судить quality matching;
- без reliable matching нельзя доверять aggregation;
- без live validation нельзя считать MVP завершенным;
- без review rules нельзя выпускать production-ready output.

## 6. Ближайший фокус

Наиболее правильный ближайший фокус:

1. Усилить clarification strategy под product rules.
2. Собрать live-case evaluation loop.
3. Запустить live case review loop.
4. После этого усиливать retrieval и mixed-work balancing уже на основании зафиксированных правил.
5. Затем ужесточать unit validation и aggregation rules на живых кейсах.
6. После стабилизации ядра доводить schedule и risk wording до production-grade политики.

## 7. Правила обновления roadmap

Roadmap обновляется, если меняется:

- очередность фаз;
- состав MVP;
- список блокеров;
- критерии выхода из фазы;
- приоритет ближайшего фокуса.

Если меняется только реализация внутри одной фазы, roadmap можно не переписывать, а обновлять `BACKLOG.md`.
