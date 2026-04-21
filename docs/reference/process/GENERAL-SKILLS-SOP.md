# Универсальный SOP по Skills для Codex-проектов

## 1. Назначение документа

Этот документ описывает общий, переносимый и повторно используемый порядок работы со skills в проектах Codex.

Его цель:

- установить skills правильно
- сделать их работу прозрачной
- включить автоматическую маршрутизацию
- не допустить скрытого или хаотичного использования skills
- обеспечить повторяемость этого подхода в любых следующих проектах

Это не инструкция для одного конкретного проекта. Это общий стандарт, который можно копировать в новые проекты как базовый operating model.

## 2. Что считается правильным итоговым состоянием

Skill-система считается полностью готовой только тогда, когда одновременно выполнены все условия:

1. skills физически установлены
2. skills проверены на наличие и доступность
3. есть governance-файлы
4. есть router-файлы
5. есть runtime-слой, который выбирает skill автоматически
6. skill-выбор виден в действиях, ответах и trace
7. ведутся логи маршрутизации
8. есть тесты, подтверждающие работу orchestration-слоя

Если skills только скопированы в папку, но не маршрутизируются автоматически, система не готова.

## 3. Базовые принципы

### 3.1 Project-local важнее global

Если возможно, skills должны ставиться внутрь проекта, а не только глобально.

Причина:

- проект становится самодостаточным
- правила не смешиваются между разными проектами
- проще фиксировать точную версию skill-слоя
- проще переносить проект на другую машину или в другую команду

### 3.2 Установка без orchestration не считается завершением

Просто наличие `.codex/skills/...` не означает, что система умеет:

- выбирать нужный skill
- объяснять, почему выбран именно он
- логировать маршрут
- переключать ответственность между skills

### 3.3 Никаких скрытых skills

Если skill используется, это должно быть видно:

- откуда он взят
- локальный он или внешний
- для каких задач он разрешён

### 3.4 Один шаг — один основной skill

На каждом шаге должен быть:

- `primary` skill
- при необходимости `supporting` skills
- при необходимости `validation` skill
- при необходимости `fallback` skill

Обычно достаточно:

- 1 основного skill
- 0-2 supporting skills

### 3.5 Маршрутизация должна быть машинно-читаемой

Решения о выборе skills должны быть записаны так, чтобы:

- их можно было проверить вручную
- их можно было тестировать
- их можно было анализировать автоматически

## 4. Где skills должны быть установлены

### 4.1 Глобальная установка

Глобальный каталог Codex:

```text
%USERPROFILE%\.codex\skills\<skill-name>\SKILL.md
```

Глобальная установка полезна как базовая библиотека пользователя, но её недостаточно для проектной изоляции.

### 4.2 Project-local установка

Предпочтительный путь внутри проекта:

```text
<PROJECT_ROOT>\.codex\skills\<skill-name>\SKILL.md
```

Именно этот вариант рекомендуется для рабочих проектов.

### 4.3 Каноническое правило при пересечениях

Если skill есть и глобально, и внутри проекта, приоритет должен быть у project-local версии.

Это правило нужно явно зафиксировать в governance.

## 5. Минимальная структура папок и файлов

Ниже приведён рекомендуемый универсальный каркас.

```text
<PROJECT_ROOT>\
  .codex\
    skills\
      <skill-a>\SKILL.md
      <skill-b>\SKILL.md
      ...
  PROJECT-SKILLS.md
  skill-system\
    registry.json
    router.json
    groups.json
    governance.json
    install-report.json
    supplemental-skills.json
    change-log.md
    logs\
      routing.jsonl
      handoffs.jsonl
      errors.jsonl
  src\
    modules\
      skills\
        services\
          task-classifier.ts
          skill-router-service.ts
          skill-orchestrator-service.ts
          skill-trace-logger.ts
```

Названия runtime-файлов могут отличаться, но функции должны быть сохранены.

## 6. Какие файлы за что отвечают

### 6.1 `.codex/skills/<skill-name>/SKILL.md`

Это сам skill.

Он отвечает за:

- описание роли skill
- правила его применения
- workflow
- ограничения
- связанный стиль работы

Что обязательно:

- один skill = одна отдельная папка
- главный файл называется `SKILL.md`
- содержание должно быть достаточно конкретным для реального использования

### 6.2 `PROJECT-SKILLS.md`

Это проектный public contract по работе skills.

Он отвечает за:

- правила использования skills в проекте
- формат отображения active skill
- правила handoff
- правила прозрачности
- ограничения на скрытое использование skills

Именно здесь удобно фиксировать, что в каждом шаге нужно явно показывать:

- `Skill: <name>`
- `Skills: <name1>, <name2>`
- `Handoff: <from> -> <to>`

### 6.3 `skill-system/registry.json`

Это реестр установленных skills.

Он отвечает за:

- список skills
- источники
- версии или fingerprints
- статус установки
- локальный или внешний тип

Без реестра нельзя надёжно понять, что именно реально установлено.

### 6.4 `skill-system/router.json`

Это декларативная карта маршрутизации.

Она отвечает за:

- task categories
- основной skill по каждой категории
- supporting skills
- validation skills
- fallback skills
- специальные правила для risky tasks

Это главный policy-файл для выбора skills.

### 6.5 `skill-system/groups.json`

Это логическая группировка skills.

Она отвечает за:

- объединение skills по семействам
- упрощение маршрутизации
- тематические группы вроде:
  - product
  - architecture
  - implementation
  - security
  - testing
  - docs

### 6.6 `skill-system/governance.json`

Это главный governance-файл skill-системы.

Он отвечает за:

- приоритет project-local над global
- допустимость supplemental skills
- правило обязательного trace
- правило обязательного логирования
- лимиты на число skills на шаг
- правила conflict resolution

Если в системе есть спорные места, они должны быть формализованы именно здесь.

### 6.7 `skill-system/install-report.json`

Это отчёт по установке.

Он отвечает за:

- что было установлено
- что отсутствует
- что задублировано
- что конфликтует
- какие skills локальные
- какие skills supplemental

Этот файл нужен для прозрачной приёмки первого этапа.

### 6.8 `skill-system/supplemental-skills.json`

Это отдельный список skills, которые используются, но не лежат в project-local папке.

Он отвечает за:

- явное объявление platform-resident или global skills
- причины, почему они не mirrored внутрь проекта
- допустимые зоны применения

Если supplemental skills не объявлены, система непрозрачна.

### 6.9 `skill-system/change-log.md`

Это журнал изменений skill-слоя.

Он отвечает за:

- когда добавили новый skill
- когда поменяли маршрут
- когда изменили governance
- когда расширили runtime orchestration

### 6.10 `skill-system/logs/*.jsonl`

Это runtime-логи.

Они отвечают за:

- факт выбора skill
- handoff между skills
- ошибки маршрутизации
- причину выбора маршрута
- контекст выполнения

Формат `.jsonl` удобен для:

- машинной проверки
- grep/rg поиска
- отладки
- импорта в аналитику

## 7. Какие runtime-компоненты должны существовать

Чтобы skill-система была автоматической, недостаточно файлов-конфигов. Нужны реальные runtime-компоненты.

### 7.1 `TaskClassifier`

Назначение:

- определить тип текущей задачи
- понять стадию работы
- оценить риск
- определить, есть ли неоднозначность

Пример категорий:

- discovery
- product-definition
- architecture
- implementation
- review
- debugging
- testing
- security
- documentation
- handoff

### 7.2 `SkillRouterService`

Назначение:

- взять классификацию задачи
- сопоставить её с `router.json`
- выбрать primary/supporting/validation/fallback

Именно здесь реализуется policy decision.

### 7.3 `SkillOrchestratorService`

Назначение:

- исполнять маршрут
- поддерживать handoff
- прикладывать route metadata к результатам
- быть единым входом для task execution

Это центральный runtime-узел skill-системы.

### 7.4 `SkillTraceLogger`

Назначение:

- писать logs
- сохранять причину выбора
- фиксировать источники skills
- записывать handoff-события

### 7.5 `AttributionAdapter`

Назначение:

- делать skill-маршрут видимым в user-facing output
- не допускать “немого” использования skills

Именно этот слой добавляет:

- `skill`
- `skillSource`
- `supportingSkills`
- `supportingSkillSources`
- `handoff`
- `routeCategory`

## 8. Как skills должны работать автоматически

Ниже правильный жизненный цикл.

### Этап 1. Source of truth

Сначала определяется источник правды:

- файл установки skills
- каталог skills
- repo со skills
- ручной утверждённый список

Без source of truth нельзя начинать установку.

### Этап 2. Установка

Нужно:

1. создать `.codex/skills/<skill-name>/`
2. положить туда `SKILL.md`
3. проверить наличие каждого skill
4. зафиксировать результат в `install-report.json`

### Этап 3. Реестр

После установки нужно построить `registry.json`.

В нём должны быть:

- имя
- путь
- источник
- тип
- статус
- примечания по дублям и конфликтам

### Этап 4. Governance

Нужно создать:

- `PROJECT-SKILLS.md`
- `governance.json`
- `groups.json`

Здесь определяется общий operating model.

### Этап 5. Router

Нужно создать `router.json`, где для каждой категории задач будет описано:

- кто primary
- кто support
- кто validation
- кто fallback

### Этап 6. Runtime orchestration

Нужно реализовать код, который:

- принимает task context
- классифицирует задачу
- выбирает маршрут
- пишет trace
- возвращает route metadata

### Этап 7. Интеграция

Runtime skill-layer должен быть встроен минимум в:

- внешний request handling
- внутренние сервисы
- pipeline stages
- review stages
- output generation

### Этап 8. Проверка

Нужно проверить:

- route selection
- visible attribution
- handoff
- logging
- fallback behavior
- работу supplemental skills

## 9. Какие интерфейсы должны быть у skill-системы

### 9.1 Входной интерфейс

На вход orchestration-слой обычно получает `task context`.

Минимально полезные поля:

```json
{
  "taskName": "string",
  "taskCategory": "string",
  "stage": "string",
  "scope": "string",
  "riskLevel": "low|medium|high",
  "ambiguityLevel": "low|medium|high",
  "needsValidation": true,
  "isUserFacing": true,
  "isMutableOperation": false
}
```

### 9.2 Выходной интерфейс

Результат маршрутизации должен быть стандартизован.

Пример:

```json
{
  "primarySkill": "product-manager",
  "primarySkillSource": "project-local",
  "supportingSkills": ["brainstorming"],
  "supportingSkillSources": ["platform-resident"],
  "validationSkill": "test-driven-development",
  "fallbackSkill": "plain-language-guide",
  "routeCategory": "product-definition",
  "reason": "Task is ambiguous and requires goal framing before implementation."
}
```

### 9.3 Интерфейс логирования

Каждое событие маршрутизации должно попадать в `.jsonl`.

Минимально:

```json
{
  "timestamp": "2026-04-14T10:20:30.000Z",
  "taskName": "define-output-format",
  "routeCategory": "product-definition",
  "primarySkill": "product-manager",
  "supportingSkills": ["brainstorming"],
  "skillSources": {
    "product-manager": "project-local",
    "brainstorming": "platform-resident"
  },
  "result": "selected"
}
```

## 10. Какие ресурсы нужны системе

Skill-система использует несколько типов ресурсов.

### 10.1 Статические ресурсы

- сами `SKILL.md`
- реестр
- роутер
- governance-файлы
- правила группировки

### 10.2 Runtime-ресурсы

- classifier
- router service
- orchestrator
- trace logger
- интеграционный слой

### 10.3 Проверочные ресурсы

- unit tests
- integration tests
- smoke tests
- sample task contexts

## 11. Каким методом выбирать skills

Рекомендуемый метод:

1. сначала определить стадию задачи
2. затем определить риск
3. затем определить уровень неоднозначности
4. затем выбрать primary skill
5. затем добавить supporting skills только если они реально нужны
6. затем добавить validation skill для risky или mutable шагов
7. затем залогировать маршрут

### Пример логики выбора

- если задача размыта и надо понять цель:
  - `primary = product-manager`
  - `support = brainstorming`
- если нужно проектирование:
  - `primary = architecture`
  - `support = product-manager`
- если нужно кодировать:
  - `primary = backend-dev-guidelines` или другой implementation skill
  - `validation = test-driven-development`
- если риск высокий:
  - добавить security или validation skill
- если нужен простой пользовательский текст:
  - `fallback = plain-language-guide`

## 12. Что значит “автоматически и полноценно”

Полноценная автоматизация означает:

- skill выбирается не вручную по памяти, а через router
- выбор можно проверить
- источник skill известен
- handoff формализован
- система не молчит о supplemental skills
- route metadata сохраняется
- тесты подтверждают, что это реально работает

Не считается автоматикой:

- просто писать в ответе `Skill: ...` вручную
- просто держать skills в папке
- просто иметь `router.json` без runtime-кода

## 13. Частые ошибки

### Ошибка 1. Skills установлены, но маршрутизатор не создан

Это означает:

- установка сделана
- orchestration не сделан

Статус:

- не завершено

### Ошибка 2. Skill указывается только текстом в ответе

Это означает, что attribution cosmetic, а не системный.

Статус:

- не завершено

### Ошибка 3. Router работает только на уровне API

Если внутренние pipeline stages используют хардкод, система автоматизирована частично.

Статус:

- частично готово

### Ошибка 4. Внешние skills используются без объявления

Это ломает прозрачность и переносимость.

Статус:

- недопустимо

### Ошибка 5. Нет тестов на маршрутизацию

Тогда никто не знает, работает ли система после изменений.

Статус:

- риск

## 14. Чек-лист приёмки

Перед тем как объявить skill-слой готовым, нужно подтвердить:

- все требуемые skills существуют на диске
- у каждого есть `SKILL.md`
- `registry.json` заполнен
- `router.json` заполнен
- `governance.json` заполнен
- `install-report.json` заполнен
- `supplemental-skills.json` заполнен при необходимости
- runtime orchestrator реализован
- route metadata виден в ответах
- logs реально пишутся
- тесты реально проходят

## 15. Минимальные критерии готовности

Минимально приемлемое состояние “готово к работе”:

1. skills установлены локально
2. создан реестр
3. создан router
4. создан governance
5. реализован runtime orchestrator
6. реализовано visible attribution
7. включено автоматическое логирование
8. есть тесты, и они проходят

Если хотя бы одного пункта нет, skill-слой нельзя считать полностью завершённым.

## 16. Рекомендуемый формат итогового отчёта по этапу skills

После завершения этапа нужно уметь ответить на 8 вопросов:

1. какие skills были установлены
2. куда они установлены
3. какие governance-файлы созданы
4. есть ли supplemental skills
5. какой runtime orchestrator реализован
6. в какие слои уже встроена маршрутизация
7. какими тестами это подтверждено
8. что ещё остаётся незавершённым

## 17. Универсальный стартовый prompt для новых проектов

Ниже шаблон, который можно использовать почти без изменений в новых проектах.

```text
Ты работаешь в проекте, где skill-система должна быть установлена и приведена в полностью рабочее автоматическое состояние до любых продуктовых, архитектурных или технических действий.

Твой первый обязательный этап — skills.

Ты обязан выполнить это строго в таком порядке:

1. Найти источник правды по required skills.
2. Полностью его прочитать.
3. Установить каждый required skill в `<PROJECT_ROOT>/.codex/skills/<skill-name>/SKILL.md`.
4. Проверить, что каждый skill реально существует и доступен.
5. Создать и заполнить:
   - `PROJECT-SKILLS.md`
   - `skill-system/registry.json`
   - `skill-system/router.json`
   - `skill-system/groups.json`
   - `skill-system/governance.json`
   - `skill-system/install-report.json`
   - `skill-system/change-log.md`
6. Если какой-либо skill нельзя разместить локально в проекте, не скрывать это, а явно описать его в `skill-system/supplemental-skills.json` с указанием источника, причины и допустимой зоны применения.
7. Построить реальный runtime orchestration layer, который:
   - классифицирует задачи
   - выбирает primary/supporting/validation/fallback skills
   - прикладывает route metadata к результатам
   - пишет runtime-логи в `skill-system/logs/*.jsonl`
   - поддерживает handoff между skills
8. Встроить orchestration layer в:
   - внешние запросы
   - внутренние сервисы
   - pipeline stages
   - review stages
   - output generation
9. Добавить тесты, подтверждающие, что routing, attribution и logging действительно работают.
10. Только после полного завершения этапа skills переходить к PRD, архитектуре, реализации и остальным частям проекта.

Обязательные правила:

- Не считать этап skills завершённым, если skills только установлены, но не маршрутизируются автоматически.
- Не считать orchestration завершённым, если он не покрыт тестами.
- Не использовать скрытые skills.
- В каждой задаче, анализе, плане, реализации, handoff и итоговом отчёте явно показывать ответственный skill.
- На каждый шаг использовать один основной skill и не более двух supporting skills, если нет отдельной причины на большее число.
- При неоднозначности, product-решениях и trade-offs явно включать product-manager и/или brainstorming, если они предусмотрены системой.
- Все route traces и logs должны быть машинно-читаемыми.
```

## 18. Короткое правило, которое можно запомнить

Skills не готовы тогда, когда они просто скопированы.

Skills готовы только тогда, когда они:

- установлены
- описаны в governance
- маршрутизируются автоматически
- видны в выводе
- логируются
- протестированы

## 19. Практический вывод

Если нужен один универсальный стандарт для других проектов, используйте именно эту формулу:

`installation -> verification -> registry -> governance -> routing -> orchestration -> integration -> logging -> tests -> acceptance report`

Это и есть минимально правильный, воспроизводимый и переносимый SOP для полной и автоматической работы skills.
