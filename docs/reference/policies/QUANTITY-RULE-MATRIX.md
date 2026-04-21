# QUANTITY RULE MATRIX - MASHMAUET Agent

Status: Active Living Document  
Version: 0.1  
Last Updated: 2026-04-15  
Source of Truth: `PRD.md`, current pipeline behavior

## 1. Назначение

Этот документ фиксирует правила quantity logic для `MASHMAUET Agent`.

Он нужен, чтобы:

- одинаково считать quantity по типам работ;
- различать explicit, derived и estimated quantity;
- понимать, когда нужен clarification;
- понимать, когда quantity допустим как fallback;
- не смешивать разные quantity strategies в одном неформальном виде.

## 2. Основные принципы

1. Quantity должен браться из strongest available source.
2. Explicit quantity всегда сильнее derived quantity.
3. Derived quantity сильнее estimated fallback.
4. Если quantity влияет на `אומדן` и не может быть надежно выведен, нужен clarification.
5. Estimated quantity допустим только с флагом и review sensitivity.

## 3. Порядок приоритета источников количества

1. Explicit quantity из объяснения пользователя.
2. Explicit quantity из strong document evidence.
3. Derived quantity из размеров и approved formula.
4. Confirmed reviewer override.
5. Estimated fallback.

## 4. Матрица правил

| Quantity Mode | Typical Unit | Primary Source | Derived Rule | Clarification Trigger | Estimated Fallback | Review Trigger | Текущее состояние |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `area_explicit` | `m2` | explicit area in text/doc | not needed | нет explicit quantity и нет размеров | no | если source слабый | supported |
| `area_derived` | `m2` | length + width | `length * width` | нет explicit area и нет пары dimensions | no | если dimensions слабо подтверждены | supported |
| `line_explicit` | `m` | explicit line length | not needed | нет explicit line length | no | если source слабый | supported |
| `line_derived` | `m` | approved linear field | direct use of `lineLengthMeters` | нет line length | no | если line length ambiguous | supported |
| `unit_explicit` | `unit` | explicit count in text/doc | not needed | нет explicit count | no | если source слабый | supported |
| `unit_derived` | `unit` | confirmed units field | direct use of `units` | нет units | no | если unit semantics unclear | supported |
| `lump_sum` | `komplet` | confirmed line selection or explicit scope | quantity fixed as `1` | если line не является truly lump-sum | yes, but only by policy | если scope/selection uncertain | partial |
| `estimated_area` | `m2` | none | fallback not acceptable for final | missing dimensions | current code may estimate `1`, target policy: avoid final auto-accept | always | needs hardening |
| `estimated_line` | `m` | none | fallback not acceptable for final | missing line length | current code may estimate `1`, target policy: avoid final auto-accept | always | needs hardening |
| `estimated_unit` | `unit` | none | fallback not acceptable for final | missing units count | current code may estimate `1`, target policy: avoid final auto-accept | always | needs hardening |

## 5. Детальные правила по типам

## 5.1. Area-Based Works

Типичные work types:

- `floor_replacement`
- `wall_repair`
- `surface_preparation`

Правило:

- если в input уже есть площадь, используем ее как primary quantity;
- если явной площади нет, но есть `length` и `width`, строим derived quantity;
- если нет ни площади, ни размеров, quantity нельзя считать надежным;
- в таком случае нужен clarification, а не silent final calculation.

Допустимые формулы:

- `area = length * width`

Review trigger:

- площадь извлечена из слабого handwriting/document signal;
- dimensions противоречат друг другу;
- derived area выглядит подозрительно относительно scope.

## 5.2. Line-Based Works

Типичные work types:

- `sewer_line_replacement`
- `trench_excavation`
- `backfill_restoration`

Правило:

- если длина явно указана, используем explicit quantity;
- если длина сохранена в structured field, используем ее как derived/confirmed line quantity;
- если длины нет, нужен clarification;
- fallback `1 meter` допустим только как technical placeholder внутри draft-state, но не как trusted final quantity policy.

Допустимые формулы:

- `line_quantity = lineLengthMeters`

Review trigger:

- длина вытащена из неоднозначной shorthand записи;
- есть несколько разных длин;
- ancillary linear works наследуют длину автоматически.

## 5.3. Unit-Based Works

Типичные work types:

- `door_replacement`
- `cabinet_replacement`

Правило:

- если count указан, используем его;
- если count подтвержден в structured field, используем его;
- если count отсутствует, нужен clarification;
- fallback `1` допустим только как temporary technical placeholder с обязательным review flag.

Допустимые формулы:

- `unit_quantity = units`

Review trigger:

- unclear unit semantics;
- count extracted from weak source;
- дверь/шкаф упомянуты, но непонятно, идет ли речь о замене всего объекта или только детали.

## 5.4. Lump-Sum / Komplet Works

Типичные work types:

- `debris_removal`
- `generic_cleanup`
- отдельные truly lump-sum ancillary tasks

Правило:

- quantity `1` допустим, только если сама line item логически является lump-sum;
- нельзя произвольно превращать любой work item в `komplet`, чтобы обойти missing quantity;
- если nature of work не lump-sum, нужен clarification или другой line selection.

Review trigger:

- `komplet` используется как маскировка отсутствующих данных;
- строка в `DEKEL` не выглядит истинно lump-sum.

## 6. Правила estimated quantity

Estimated quantity допустим только как controlled temporary state.

Он:

- должен быть явно помечен;
- не должен silently становиться финальным trusted quantity;
- должен повышать review sensitivity;
- при критичности для стоимости должен требовать clarification.

Целевая продуктовая политика:

- area / line / unit quantity не должны уходить в final approval как `1` только потому, что система не знает точное число.

## 7. Правила clarification по quantity

Clarification обязателен, если:

- required quantity отсутствует;
- quantity нельзя надежно вывести;
- quantity materially changes cost;
- quantity ambiguity меняет line selection.

Clarification не обязателен, если:

- quantity явно указан;
- quantity надежно derived из approved dimensions;
- line item действительно lump-sum.

## 8. Правила review по quantity

Review обязателен, если:

- quantity estimated;
- quantity извлечен из слабого источника;
- ancillary work унаследовал quantity автоматически;
- есть mismatch между work type и unit;
- quantity выглядит технически корректным, но доменно сомнительным.

## 9. Правила для разработки

Что следует считать целевым behavior:

- `m2`: explicit area > derived area > clarification
- `m`: explicit/confirmed line length > clarification
- `unit`: explicit/confirmed count > clarification
- `komplet`: только по line semantics, а не как общий fallback

Что нельзя считать целевым production behavior:

- area = `1`, если нет dimensions
- line = `1`, если нет line length
- unit = `1`, если нет count

Даже если такой fallback временно существует в коде как технический draft-path, продуктово это должно оставаться review-sensitive и подлежать дальнейшему ужесточению.
