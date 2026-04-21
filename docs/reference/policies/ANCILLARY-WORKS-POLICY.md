# ANCILLARY WORKS POLICY - MASHMAUET Agent

Status: Active Living Document  
Version: 0.1  
Last Updated: 2026-04-15  
Source of Truth: `PRD.md`, `TEXT-POLICY-MATRIX.md`, `MASMACH-SECTION-CONTRACTS.md`

## 1. Назначение

Этот документ фиксирует продуктовую политику по сопутствующим работам.

Под `ancillary works` понимаются работы, которые:

- не всегда называются пользователем явно;
- могут быть логически связаны с основной работой;
- могут влиять на `אומדן`, scope и итоговый документ;
- не должны silently добавляться в финальный результат.

## 2. Главный принцип

Система может помогать находить сопутствующие работы, но не имеет права молча превращать догадку в подтвержденный факт.

Любая ancillary logic должна быть одной из трех категорий:

1. `auto-suggest`
2. `review-only`
3. `forbidden automatic inclusion`

## 3. Категории ancillary works

## 3.1. Auto-Suggest

Это работы, которые система имеет право предлагать как вероятно релевантные, но не включать автоматически в финальный scope и `אומדן` без review.

Условия:

- связь с основной работой логична;
- система видит достаточный контекст;
- ancillary work не меняет радикально смысл кейса;
- предложение можно прозрачно объяснить.

Примеры:

- surface preparation рядом с replacement works;
- debris removal после демонтажа;
- local backfill/restoration рядом с линейными земляными работами;
- minor supporting preparation around clearly identified core work.

Правило:

- показывать как suggestion;
- держать отдельным от confirmed lines;
- не поднимать до selected output без review/confirmation.

## 3.2. Review-Only

Это работы, которые система может распознать как возможные, но обязана удерживать в review-слое.

Условия:

- ancillary work влияет на стоимость существенно;
- ancillary work может менять scope кейса;
- связь с основной работой доменно вероятна, но не гарантирована;
- нужны инженерные или организационные допущения.

Примеры:

- trench excavation;
- infrastructure preparation;
- local utility adaptation;
- interface works between chapters;
- restoration that зависит от фактических условий площадки.

Правило:

- разрешено показывать как review candidate;
- запрещено silently добавлять в final `scope_section`;
- запрещено silently добавлять в confirmed `אומדן`;
- обязательно сопровождать reasoning.

## 3.3. Forbidden Automatic Inclusion

Это работы, которые нельзя автоматически добавлять даже как почти-готовое решение без явного подтверждения.

Условия:

- ancillary work может значительно изменить бюджет;
- ancillary work может означать отдельный под-проект;
- ancillary work не следует однозначно из исходного объяснения;
- для включения нужен явный доменный выбор.

Примеры:

- full utility connections;
- electricity / water / sewer full connection packages;
- foundations for modular structures;
- placement infrastructure for `MAVNADIM`;
- works requiring permits, coordination or substantial site assumptions;
- hidden works that могут появиться только после site verification.

Правило:

- можно лишь вынести как explicit review concern;
- нельзя автоматически включать в line selection;
- нельзя автоматически включать в budget totals;
- нельзя автоматически вписывать как факт в текст документа.

## 4. Политика для DEKEL-кейсов

Если кейс строится вокруг `DEKEL`, ancillary logic должна работать так:

- primary work ищется первой волной;
- ancillary candidates допускаются только второй волной;
- ancillary candidates не должны вытеснять core work из top understanding;
- ancillary lines не должны становиться selected по умолчанию только потому, что имеют неплохой lexical match.

Разрешено:

- показывать ancillary hints;
- показывать chapter-adjacent suggestions;
- повышать reviewer awareness.

Запрещено:

- silently считать ancillary line частью confirmed scope;
- silently переносить ancillary amount в output totals;
- маскировать ancillary under generic wording.

## 5. Политика для MAVNADIM-кейсов

Если кейс строится вокруг `MAVNADIM`, логика должна быть еще строже.

Primary entity:

- сам готовый модульный объект.

Возможные ancillary categories:

- foundation / placement base;
- electricity;
- water;
- sewer;
- site preparation;
- access / local infrastructure.

Правило:

- `MAVNADIM` candidate выбирается первым как main object;
- ancillary works из `DEKEL` считаются только отдельным controlled layer;
- без явного подтверждения ancillary works не становятся частью итогового расчета.

## 6. Политика для текста документа

Ancillary works нельзя текстово подавать как уже подтвержденный факт, если они:

- не подтверждены пользователем;
- не подтверждены reviewer;
- не выведены из strong factual source.

Разрешено в тексте:

- mention as assumption;
- mention as review requirement;
- mention as possible supporting work.

Запрещено в тексте:

- писать ancillary work как будто он уже утвержден;
- расширять scope_section скрытыми работами без review;
- включать такие работы в background/objective как settled scope.

## 7. Когда нужен clarification

Clarification обязателен, если:

- непонятно, нужны ли вообще сопутствующие работы;
- ancillary work materially changes cost;
- ancillary work меняет границы проекта;
- пользовательский input допускает две разные трактовки:
  - только core work
  - core work + infrastructure/supporting works

## 8. Когда достаточно review

Review достаточен, если:

- core work уже понятен;
- ancillary work не подтвержден, но доменно реалистичен;
- система может показать candidate lines и reasoning;
- решение должно принимать человек, а не clarification loop.

## 9. Матрица решений

| Situation | System May Detect | System May Suggest | System May Auto-Include | Clarification | Review |
| --- | --- | --- | --- | --- | --- |
| Local cleanup after demolition | yes | yes | no | optional | yes |
| Surface preparation directly tied to core replacement | yes | yes | no | optional | yes |
| Trench/backfill around explicit sewer-line work | yes | yes | no | optional if scope clear | yes |
| Foundation for modular structure | yes | yes | no | often yes | yes |
| Electricity/water/sewer full connections for `MAVNADIM` | yes | yes | no | yes if scope unclear | yes |
| Major site infrastructure around placement | yes | yes | no | yes | yes |
| Hidden work with weak evidence only | yes | yes, as warning only | no | yes | yes |

## 10. Что считается нарушением ancillary policy

Нарушение происходит, если система:

- автоматически включает ancillary line в selected output без подтверждения;
- добавляет ancillary amount в totals без review;
- расширяет scope скрытой работой без transparency;
- использует heuristic ancillary guess как factual document text;
- смешивает primary work и ancillary work так, что reviewer не видит разницы.

## 11. Product Decision for MVP

Для MVP принимается такое правило:

- ancillary works разрешены как detection + suggestion;
- ancillary works запрещены как silent confirmed inclusion;
- все существенные ancillary additions проходят через review;
- для `MAVNADIM` ancillary policy должна быть особенно строгой.
