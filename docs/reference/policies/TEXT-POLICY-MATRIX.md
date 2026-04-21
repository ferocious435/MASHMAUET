# TEXT POLICY MATRIX - MASHMAUET Agent

Status: Active Living Document  
Version: 0.1  
Last Updated: 2026-04-15  
Source of Truth: `PRD.md`, current template/output implementation

## 1. Назначение

Этот документ фиксирует продуктовые правила для текста итогового `מסמך משמעויות`.

Он отвечает на вопросы:

- какой раздел откуда берет текст;
- какой это тип текста;
- что можно генерировать автоматически;
- когда нужен clarification;
- когда нужен review;
- что считается допустимым минимальным заполнением;
- что пока является только временной эвристикой.

## 2. Обозначения

### Типы текста

- `fixed` - стабильный шаблонный текст
- `variable` - текст зависит от кейса
- `derived` - текст строится из подтвержденных данных и расчетов
- `conditional` - текст появляется при наличии условий

### Уровни надежности источника

- `high` - подтвержденный источник истины
- `medium` - допустимый supporting source
- `low` - только гипотеза / review-only

### Режимы генерации

- `direct` - вставляется напрямую
- `templated` - строится по шаблону с параметрами
- `derived` - строится из расчетов, warnings или review state
- `manual_or_review` - требует подтверждения или ручного решения

## 3. Глобальные правила

1. Нельзя подменять factual text guessed text.
2. Нельзя silently закрывать обязательные смысловые пробелы.
3. Если текст влияет на расчет, scope или итоговый смысл документа, он не должен строиться из слабого источника без clarification или review.
4. Sample documents используются как reference формата, а не как runtime text source.
5. Handwriting и photos не являются достаточным основанием для уверенного business wording без подтверждения.

## 4. Матрица по разделам

| Section ID | Пользовательский раздел | Required | Text Type | Primary Source of Truth | Allowed Generation | Clarification Trigger | Review Trigger | Текущее состояние |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `document_title` | Заголовок документа | yes | `templated` | case title | `templated` | если нет названия кейса | если title слишком общий и не отражает кейс | baseline ready |
| `summary_section` | `נתוני מסמך` | yes | `fixed + derived` | case metadata, template metadata, generation metadata | `direct` | если отсутствуют case ID, template или generated metadata | если metadata конфликтуют | baseline ready |
| `background_section` | `רקע` | yes | `variable` | case title, primary explanation, strong document evidence | `templated` | если непонятно, о каком объекте/работе вообще идет речь | если primary explanation слишком шумный или противоречивый | needs hardening |
| `objective_section` | `מטרת המשימה` | yes | `fixed + variable` | product intent + case title | `templated` | обычно не нужен, если понятен тип кейса | если формулировка цели искажает scope | needs hardening |
| `scope_section` | `תכולת הפרויקט` | yes | `variable + derived` | confirmed `DEKEL` lines, confirmed `MAVNADIM`, clarified user scope | `derived`, fallback `templated` | если нет подтвержденного scope и raw input двусмысленен | если scope построен из fallback fragments или ancillary works спорны | critical hardening |
| `project_description` | `תיאור הפרויקט` | yes | `variable` | raw user explanation + strong document evidence | `direct` или lightly normalized | если explanation неполный и не отражает задачу | если source text низкой надежности | baseline ready |
| `omdan_section` | `אומדן` | yes | `derived` | confirmed `DEKEL` lines, confirmed quantity, calculations | `derived` only | если не хватает unit/quantity/selection | если quantity estimated, match uncertain или line selection спорен | baseline ready |
| `remarks_section` | `הערות לאומדן` | yes | `derived + conditional` | management fee, warnings, assumptions, review decisions | `derived` | если remark требует нового факта, которого нет | если warning/assumption бизнес-критичен | baseline ready |
| `budget_breakdown_section` | `להלן פילוח תקציבי לעבודה` | yes | `derived` | selected lines, chapter grouping, totals | `derived` | если нет mapping или chapter logic ломается | если grouping вызывает смысловую неоднозначность | partial |
| `schedule_section` | `לוח עקרוני` | conditional for MVP, target yes | `derived + heuristic` | selected works, complexity hints, confirmed project sequencing rules | `derived`, сейчас heuristic | если нужен реальный график, а system знает только rough scope | всегда review, пока нет формализованной schedule policy | heuristic only |
| `risk_management_section` | `ניהול סיכונים` | conditional for MVP, target yes | `derived + heuristic` | warnings, assumptions, chapter mix, domain risk policy | `derived`, сейчас heuristic | если нужны реальные risk statements, а sources слишком слабые | всегда review, пока нет формализованной risk policy | heuristic only |
| `appendices_section` | `נספחים ומסמכי מקור` | yes | `conditional + derived` | supporting evidence inventory, warnings, source policy | `derived` | если непонятно, что считать приложением, а что review-only evidence | если evidence controversial | baseline ready |
| `template_bindings` | Internal / export trace | internal required | `derived` | output draft state | `direct` | не нужен | review только при mismatch with rendered doc | baseline ready |

## 5. Правила по разделам

## 5.1. Document Title

- Должен строиться как шаблонный заголовок от case title.
- Не должен содержать guessed scope.
- Если title слишком общий, допустимо требовать уточнение имени кейса, но не блокировать весь pipeline, если есть case ID.

## 5.2. Summary Section

- Полностью управляется metadata.
- Не должна зависеть от слабых текстовых источников.
- Ошибка в summary - это ошибка данных/metadata, а не wording.

## 5.3. Background

- Должен объяснять контекст кейса.
- Может строиться автоматически, только если есть достаточно ясный primary explanation.
- Не должен домысливать скрытые работы, объемы или подтвержденные решения.
- Если непонятно, что именно является предметом кейса, background должен блокироваться clarification.

## 5.4. Objective

- Это не вольное эссе.
- Цель должна описывать задачу документа, а не выдумывать новый scope.
- Допустим template-first стиль с подстановкой названия кейса и типа задачи.

## 5.5. Scope

- Это один из самых критичных текстовых блоков.
- Предпочтительный источник: confirmed `DEKEL` + confirmed `MAVNADIM`.
- Fallback на raw description допустим только как временный draft до подтверждения.
- Если scope строится из fallback fragments, раздел должен считаться review-sensitive.
- Ancillary works не должны silently попадать в scope без policy и/или подтверждения.

## 5.6. Project Description

- Это ближайший к raw input раздел.
- Допустима легкая нормализация, но нельзя менять смысл.
- Если есть более сильный typed/document source, он может обогащать описание.
- Handwriting/photo не должны переписывать основной description без review.

## 5.7. Omdan

- Только derived.
- Только на основе подтвержденных line selections и quantity logic.
- Никакой свободной текстовой генерации как источника сумм.
- Estimated quantity допустим только с флагом и review sensitivity.

## 5.8. Remarks

- Remarks не должны превращаться в свалку произвольного текста.
- Они должны собираться из:
  - fee rules;
  - warnings;
  - assumptions;
  - review decisions.
- Если remark требует нового доменного утверждения, он не должен генерироваться автоматически.

## 5.9. Budget Breakdown

- Раздел должен строиться по устойчивым grouping rules.
- Сейчас grouping по chapter codes допустим как MVP baseline.
- Если chapter grouping не отражает реальный смысл работ, нужна product correction, а не "красивое" wording patch.

## 5.10. Schedule

- Сейчас этот блок нельзя считать fully trusted planning output.
- Пока допустим только как rough indicative section.
- До формализации policy он всегда должен считаться review-sensitive.
- Если пользователь ожидает реальный обязательный график, без доменных правил section нельзя считать окончательно готовым.

## 5.11. Risk Management

- Сейчас этот блок полезен как safety/risk reminder, но не как формально завершенный risk register.
- До появления domain-safe policy он должен оставаться review-sensitive.
- Risks не должны выдумываться произвольно; только на основе warnings, assumptions, complexity и approved policy.

## 5.12. Appendices

- Этот блок должен честно показывать:
  - какие evidence были;
  - какие из них использовались;
  - какие остались review-only;
  - какие policy ограничения действуют.
- Это важный слой прозрачности, а не просто список вложений.

## 6. Когда обязательно спрашивать пользователя

Clarification обязателен, если:

- background или scope не могут быть сформулированы без смены смысла;
- непонятно, что входит в основную работу, а что в ancillary works;
- section требует factual content, а есть только слабый evidence;
- quantity/units влияют на `אומדן`;
- документ может получиться правдоподобным, но смыслово неверным.

## 7. Когда достаточно review

Review вместо clarification допустим, если:

- основной factual смысл уже понятен;
- проблема не в отсутствии данных, а в необходимости подтвердить выбор;
- section уже можно собрать, но нужно отметить warning/assumption;
- heuristic section не влияет напрямую на `אומדן`.

## 8. Что считается закрытием Text Policy Matrix

Матрица считается достаточной для MVP, если:

- все ключевые разделы документа покрыты;
- для каждого раздела зафиксирован source of truth;
- зафиксировано, где допустим auto-text;
- зафиксировано, где обязателен clarification;
- зафиксировано, где обязателен review;
- schedule и risk явно отмечены как не fully finalized.
