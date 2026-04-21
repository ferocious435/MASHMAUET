# MASMACH SECTION CONTRACTS - MASHMAUET Agent

Status: Active Living Document  
Version: 0.1  
Last Updated: 2026-04-15  
Source of Truth: `PRD.md`, `TEXT-POLICY-MATRIX.md`, current template implementation

## 1. Назначение

Этот документ описывает контракт каждой секции итогового `מסמך משמעויות`.

Контракт нужен, чтобы:

- одинаково понимать, что должна делать секция;
- тестировать output не "на глаз", а по правилам;
- отделить обязательные блоки от условных;
- понять, какие входы нужны для корректной сборки секции;
- зафиксировать минимально допустимый результат.

## 2. Формат контракта

Для каждой секции фиксируются:

- `Section ID`
- `User-visible title`
- `Status`
- `Purpose`
- `Required Inputs`
- `Output Shape`
- `Minimal Acceptable Output`
- `Blockers`
- `Review Sensitivity`
- `Notes`

## 3. Контракты секций

## 3.1. Document Title

- Section ID: `document_title`
- User-visible title: `מסמך משמעויות - <case title>`
- Status: required
- Purpose: однозначно идентифицировать документ и кейс
- Required Inputs:
  - `case.title`
- Output Shape:
  - одна строка заголовка
- Minimal Acceptable Output:
  - шаблонный title с непустым case title
- Blockers:
  - отсутствие названия кейса
- Review Sensitivity:
  - low
- Notes:
  - title не должен подменять scope и не должен придумывать детали работ

## 3.2. Summary Section

- Section ID: `summary_section`
- User-visible title: `נתוני מסמך`
- Status: required
- Purpose: показать основные metadata документа
- Required Inputs:
  - `case.caseId`
  - template metadata
  - generation timestamp
  - `case.title`
- Output Shape:
  - список metadata полей
- Minimal Acceptable Output:
  - document type
  - case reference
  - template version
  - generated at
  - project name
- Blockers:
  - отсутствие case ID или template definition
- Review Sensitivity:
  - low
- Notes:
  - metadata должна быть factual, а не generated creatively

## 3.3. Background Section

- Section ID: `background_section`
- User-visible title: `רקע`
- Status: required
- Purpose: объяснить контекст и исходную ситуацию кейса
- Required Inputs:
  - `case.title`
  - primary explanation
  - strong document evidence, если есть
- Output Shape:
  - 1-2 абзаца
- Minimal Acceptable Output:
  - понятный контекст кейса
  - привязка к реальному объяснению пользователя
- Blockers:
  - explanation не позволяет понять, о чем кейс
- Review Sensitivity:
  - medium
- Notes:
  - background не должен становиться местом для выдумывания ancillary scope

## 3.4. Objective Section

- Section ID: `objective_section`
- User-visible title: `מטרת המשימה`
- Status: required
- Purpose: описать целевую задачу документа и результат подготовки
- Required Inputs:
  - case title
  - known task type
- Output Shape:
  - 1 абзац
- Minimal Acceptable Output:
  - формулировка цели подготовки документа
- Blockers:
  - неясно, что вообще должен сделать кейс
- Review Sensitivity:
  - low to medium
- Notes:
  - objective описывает задачу документа, а не полную технику выполнения работ

## 3.5. Scope Section

- Section ID: `scope_section`
- User-visible title: `תכולת הפרויקט`
- Status: required
- Purpose: перечислить, что именно входит в проект/работу
- Required Inputs:
  - confirmed `DEKEL` lines и/или confirmed `MAVNADIM`
  - clarified user scope
  - fallback fragments, если confirmed scope еще не собран
- Output Shape:
  - bullet list
- Minimal Acceptable Output:
  - список основных работ без явной смысловой ошибки
- Blockers:
  - scope fundamentally unclear
- Review Sensitivity:
  - high
- Notes:
  - fallback из raw description допустим только как черновой режим

## 3.6. Project Description

- Section ID: `project_description`
- User-visible title: `תיאור הפרויקט`
- Status: required
- Purpose: сохранить основной описательный текст кейса
- Required Inputs:
  - raw explanation
  - document-derived text, если он признан сильным
- Output Shape:
  - один текстовый блок
- Minimal Acceptable Output:
  - связный description без искажения смысла
- Blockers:
  - explanation пустой или бессмысленный
- Review Sensitivity:
  - medium
- Notes:
  - этот блок ближе всего к raw input и не должен быть чрезмерно переписан

## 3.7. Omdan Section

- Section ID: `omdan_section`
- User-visible title: `אומדן`
- Status: required
- Purpose: показать расчетные строки и totals
- Required Inputs:
  - confirmed selections
  - quantity values
  - unit prices
  - management fee rule
- Output Shape:
  - tabular rows + totals
- Minimal Acceptable Output:
  - хотя бы одна корректная line item row
  - execution subtotal
  - fee row
  - total project cost
- Blockers:
  - нет confirmed lines
  - нет quantity logic
- Review Sensitivity:
  - high
- Notes:
  - это ключевой расчетный блок документа

## 3.8. Remarks Section

- Section ID: `remarks_section`
- User-visible title: `הערות לאומדן`
- Status: required
- Purpose: явно вывести warnings, assumptions и служебные расчетные замечания
- Required Inputs:
  - management fee
  - warnings
  - assumptions
  - review state
- Output Shape:
  - bullet list
- Minimal Acceptable Output:
  - fee remark
  - ссылка на review-based nature of estimate
- Blockers:
  - нет fee rule и review state
- Review Sensitivity:
  - medium
- Notes:
  - remarks должны быть traceable, а не декоративными

## 3.9. Budget Breakdown Section

- Section ID: `budget_breakdown_section`
- User-visible title: `להלן פילוח תקציבי לעבודה`
- Status: required
- Purpose: показать бюджетную структуру поверх выбранных line items
- Required Inputs:
  - selected lines
  - chapter grouping logic
  - totals
- Output Shape:
  - grouped budget table + totals
- Minimal Acceptable Output:
  - хотя бы одна grouped row
  - execution subtotal
  - fee row
  - total project cost
- Blockers:
  - нет selected lines или totals
- Review Sensitivity:
  - medium to high
- Notes:
  - текущая chapter grouping считается MVP baseline, но еще не final business rule

## 3.10. Schedule Section

- Section ID: `schedule_section`
- User-visible title: `לוח עקרוני (מתייחס למדדי גאנט)`
- Status: conditional in MVP / target required
- Purpose: показать rough project timeline
- Required Inputs:
  - selected scope complexity
  - approved scheduling policy
- Output Shape:
  - table of activities by months
- Minimal Acceptable Output:
  - indicative timeline, помеченный как rough planning layer
- Blockers:
  - отсутствие schedule policy при ожидании production-grade schedule
- Review Sensitivity:
  - high
- Notes:
  - пока блок нельзя считать fully production-grade

## 3.11. Risk Management Section

- Section ID: `risk_management_section`
- User-visible title: `ניהול סיכונים`
- Status: conditional in MVP / target required
- Purpose: показать основные риски и меры реагирования
- Required Inputs:
  - warnings
  - assumptions
  - chapter mix
  - approved risk policy
- Output Shape:
  - structured risk table
- Minimal Acceptable Output:
  - базовый набор прозрачных review-related risks
- Blockers:
  - отсутствие risk policy при ожидании formal risk register
- Review Sensitivity:
  - high
- Notes:
  - текущая реализация полезна как warning layer, но не как окончательная risk methodology

## 3.12. Appendices Section

- Section ID: `appendices_section`
- User-visible title: `נספחים ומסמכי מקור`
- Status: required
- Purpose: показать source materials и evidence policy
- Required Inputs:
  - supporting evidence inventory
  - review-only evidence status
  - source policy
- Output Shape:
  - bullet list
- Minimal Acceptable Output:
  - mention DEKEL source
  - mention evidence layer
  - mention review-only handling for low-confidence inputs
- Blockers:
  - отсутствует evidence inventory
- Review Sensitivity:
  - medium
- Notes:
  - это критичный transparency layer

## 3.13. Template Bindings

- Section ID: `template_bindings`
- User-visible title: internal / export trace
- Status: internal required
- Purpose: сохранить machine-readable mapping для output assembly и trace
- Required Inputs:
  - output draft state
  - known template fields
- Output Shape:
  - JSON-like bindings map
- Minimal Acceptable Output:
  - title
  - totals
  - identifiers
  - schedule duration
  - risk count
- Blockers:
  - нет template schema
- Review Sensitivity:
  - low to medium
- Notes:
  - это внутренний технический контракт, но он полезен для explainability

## 4. Минимальный комплект для приемлемого документа в MVP

Чтобы документ считался приемлемым в MVP, обязательно должны быть заполнены:

- document title
- summary section
- background
- objective
- scope
- project description
- omdan
- remarks
- budget breakdown
- appendices

Допускается временно выпускать документ с heuristic blocks для:

- schedule
- risk management

Но только при явном понимании, что эти блоки еще не являются окончательно доменно выверенными.

## 5. Что считается нарушением section contract

Нарушением считается, если:

- секция заполнена без необходимого source-of-truth;
- factual content построен из слабого evidence без warning/review;
- обязательная секция заполнена placeholder-текстом без явной маркировки;
- scope противоречит confirmed lines;
- `אומדן` не совпадает с confirmed selections;
- budget breakdown и totals расходятся с `אומדן`;
- heuristic block подается как final trusted output без оговорки и review logic.
