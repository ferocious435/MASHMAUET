# BACKLOG - MASHMAUET Agent

Status: Active Living Document  
Version: 0.1  
Last Updated: 2026-04-15  
Source of Truth: `PRD.md`, `ROADMAP.md`

## 1. Обозначения

### Статусы

- `done` - завершено и уже есть в проекте
- `in_progress` - выполняется сейчас
- `next` - следующий приоритет
- `planned` - подтверждено, но еще не начато
- `blocked` - нельзя продолжить без внешнего решения

### Приоритеты

- `P0` - критично для движения MVP
- `P1` - важно для качества MVP
- `P2` - полезно после стабилизации ядра

## 2. Эпики

## EPIC 1. Product Rules and Text Policy

Цель:

- превратить общий `PRD` в набор точных продуктовых правил для документа и поведения агента.

### E1-F1. Living PRD

- Status: `done`
- Priority: `P0`
- Результат: главный продуктовый документ создан и зафиксирован.

### E1-F2. Delivery Roadmap

- Status: `done`
- Priority: `P0`
- Результат: фазы и порядок исполнения зафиксированы.

### E1-F3. Prioritized Backlog

- Status: `done`
- Priority: `P0`
- Результат: есть рабочий backlog по эпикам и фичам.

### E1-F4. Text Policy Matrix

- Status: `done`
- Priority: `P0`
- Depends On: `E1-F1`
- Нужно:
  - для каждого раздела документа зафиксировать:
    - source of truth;
    - fixed/variable/derived/conditional;
    - allowed auto-generation;
    - clarification trigger;
    - review trigger.
- Definition of Done:
  - матрица покрывает все ключевые разделы итогового документа.
- Результат:
  - `TEXT-POLICY-MATRIX.md` создан и зафиксирован как product baseline.

### E1-F5. Section Contracts for Masmach

- Status: `done`
- Priority: `P0`
- Depends On: `E1-F4`
- Нужно:
  - зафиксировать обязательные и условные секции;
  - зафиксировать входы и выходы по секциям;
  - зафиксировать минимально допустимое заполнение.
- Definition of Done:
  - на каждый раздел документа есть контракт, по которому можно тестировать output.
- Результат:
  - `MASMACH-SECTION-CONTRACTS.md` создан и зафиксирован как output contract baseline.

### E1-F6. Ancillary Works Product Policy

- Status: `done`
- Priority: `P0`
- Depends On: `E1-F4`, `E1-F5`
- Нужно:
  - разделить:
    - auto-suggest ancillary works;
    - review-only ancillary works;
    - forbidden automatic inclusion.
- Definition of Done:
  - правило применимо на кейсах с `DEKEL` и `MAVNADIM`.
- Результат:
  - `ANCILLARY-WORKS-POLICY.md` создан и зафиксирован как policy baseline.

## EPIC 2. Input Understanding and Clarification

Цель:

- сделать intake устойчивым на реальных пользовательских входах.

### E2-F1. Shorthand Parsing Hardening

- Status: `in_progress`
- Priority: `P0`
- Уже есть:
  - area shorthand;
  - unit count extraction;
  - sewer-line parsing.
- Дальше нужно:
  - улучшить короткие списки работ;
  - улучшить split по mixed descriptions;
  - улучшить распознавание scope fragments.

### E2-F2. Document-Backed Understanding

- Status: `planned`
- Priority: `P1`
- Depends On: `E1-F4`
- Нужно:
  - различать primary explanation и document evidence;
  - уметь использовать печатный текст как сильный supporting layer;
  - не смешивать extracted text с generated wording.

### E2-F3. Handwriting Policy Enforcement

- Status: `planned`
- Priority: `P1`
- Depends On: `E1-F4`
- Нужно:
  - formal low-confidence policy;
  - review-only handling;
  - conflict behavior against typed/document evidence.

### E2-F4. Clarification Strategy Upgrade

- Status: `planned`
- Priority: `P0`
- Depends On: `E1-F4`
- Нужно:
  - не задавать лишних вопросов;
  - задавать только вопросы, меняющие смысл или расчет;
  - покрыть quantity, scope, ancillary and wording blockers.

## EPIC 3. Retrieval and Matching

Цель:

- повысить качество candidate selection по реальным кейсам.

### E3-F1. Work-Item-Aware Retrieval

- Status: `done`
- Priority: `P0`
- Результат: retrieval учитывает work items, а не только raw description.

### E3-F2. Chapter-Aware Retrieval

- Status: `done`
- Priority: `P0`
- Результат: chapter preference и chapter prefilter уже включены как soft logic.

### E3-F3. Mixed-Work Candidate Balancing

- Status: `planned`
- Priority: `P0`
- Depends On: `E3-F1`, `E3-F2`
- Нужно:
  - не допускать, чтобы один dominant work-type забивал остальные;
  - удерживать в preview репрезентативный набор кандидатов по основным работам.

### E3-F4. Ancillary Match Suggestion Layer

- Status: `planned`
- Priority: `P1`
- Depends On: `E1-F6`
- Нужно:
  - показывать ancillary works как controlled suggestions, а не как silent additions.

### E3-F5. Live Evaluation Set

- Status: `next`
- Priority: `P0`
- Depends On: `E2-F4`
- Нужно:
  - собрать проверочный набор живых кейсов;
  - сравнивать top candidates и review decisions;
  - фиксировать типовые failure patterns.

## EPIC 4. Calculation and Aggregation

Цель:

- сделать расчетный слой надежным и объяснимым.

### E4-F1. Quantity Rule Matrix

- Status: `done`
- Priority: `P0`
- Depends On: `E1-F4`
- Нужно:
  - зафиксировать quantity logic по типам работ:
    - area;
    - line;
    - unit;
    - derived quantity;
    - estimated quantity.
- Результат:
  - `QUANTITY-RULE-MATRIX.md` создан и зафиксирован как расчетный baseline.

### E4-F2. Unit Validation Hardening

- Status: `planned`
- Priority: `P0`
- Depends On: `E4-F1`
- Нужно:
  - валидировать несоответствие work type и unit;
  - понижать confidence или блокировать invalid calculations.

### E4-F3. Mapping Rule Hardening

- Status: `planned`
- Priority: `P0`
- Depends On: `E1-F5`, `E4-F1`
- Нужно:
  - усилить перенос из line items в template rows;
  - исключить потерю смысла при aggregation.

### E4-F4. Aggregation Validation

- Status: `planned`
- Priority: `P1`
- Depends On: `E4-F3`
- Нужно:
  - проверять сумму, структуру, row trace и completeness.

## EPIC 5. Template and Output

Цель:

- довести главный документ до управляемого production-style behavior.

### E5-F1. Structured Template Engine

- Status: `done`
- Priority: `P0`
- Результат: template engine уже строит секции и output draft.

### E5-F2. Wording Rules by Section

- Status: `done`
- Priority: `P0`
- Depends On: `E1-F4`, `E1-F5`
- Нужно:
  - определить правила текста для:
    - background;
    - objective;
    - scope;
    - remarks;
    - appendices;
    - document metadata.
- Definition of Done:
  - для каждого основного раздела документа зафиксирован допустимый стиль формулировки, запрещённые паттерны, режим trust и правило по clarification/review.
- Результат:
  - `WORDING-RULES-BY-SECTION.md` создан и зафиксирован как wording baseline для `מסמך משמעויות`.

### E5-F3. Schedule Section Hardening

- Status: `planned`
- Priority: `P1`
- Depends On: `E1-F5`
- Нужно:
  - заменить эвристику на продуктово приемлемые правила.

### E5-F4. Risk Section Hardening

- Status: `planned`
- Priority: `P1`
- Depends On: `E1-F5`
- Нужно:
  - определить domain-safe logic формирования risk block.

### E5-F5. Final Export Format Strategy

- Status: `planned`
- Priority: `P1`
- Depends On: `E5-F2`, `E5-F3`, `E5-F4`
- Нужно:
  - определить приоритет:
    - `MD`;
    - `DOCX`;
    - `PDF`;
    - combined package.

## EPIC 6. Live Validation and Release Readiness

Цель:

- вывести систему из режима "технически работает" в режим "пригодна для реальной работы".

### E6-F1. Live Case Review Loop

- Status: `next`
- Priority: `P0`
- Depends On: `E3-F5`
- Нужно:
  - прогонять реальные кейсы;
  - фиксировать ошибки;
  - обновлять backlog по фактическим слабым местам.

### E6-F2. Release Acceptance Checklist

- Status: `planned`
- Priority: `P1`
- Depends On: `E6-F1`
- Нужно:
  - checklist по intake, matching, calculation, document wording, review and output.

### E6-F3. Definition of Done Validation

- Status: `planned`
- Priority: `P1`
- Depends On: `E6-F2`
- Нужно:
  - проверить проект против `Definition of Done` из `PRD`.

## 3. Ближайшая рабочая очередь

В правильном порядке следующим идут:

1. `E2-F4` - Clarification Strategy Upgrade
2. `E3-F5` - Live Evaluation Set
3. `E6-F1` - Live Case Review Loop
4. `E3-F3` - Mixed-Work Candidate Balancing
5. `E4-F2` - Unit Validation Hardening
6. `E5-F3` - Schedule Section Hardening

## 4. Что не делать сейчас

Пока не стоит расширять проект в стороны:

- большого OCR-first направления;
- "магической" multimodal automation;
- множества новых шаблонов;
- полного auto-approval;
- heavy export polishing без формализованной text policy.

## 5. Правила обновления backlog

Backlog обновляется:

- при завершении feature;
- при появлении нового системного риска;
- после каждого полезного live-case review;
- при изменении MVP scope;
- при появлении новых обязательных продуктовых правил.
