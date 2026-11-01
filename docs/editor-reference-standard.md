# Стандарт reference для 2D Editor Host

**Статус:** нормативное руководство для проектирования, реализации и приёмки пользовательских workflows нового Editor Host.  
**Дата проверки источников:** 01.11.2026.  
**Область:** профессиональный редактор 2D-игр для Web-first Codogma Engine.

## 1. Продуктовое решение

Главные продуктовые референсы нового редактора:

1. **Unity 6.6 Editor (6000.6)** — основной UX-reference по устройству профессионального редактора и инструментам 2D workflow.
2. **Cocos Creator 4.0 LTS** — второй обязательный reference по практическим workflows 2D-игры, связям Scene/Hierarchy/Inspector/Assets, компонентам и авторским инструментам.

Это не выбор движка, runtime, формата проекта, архитектуры или зависимости. Изучаем организацию интерфейса, пользовательские операции и способы решения 2D-задач. Codogma остаётся собственным TypeScript-native, SolidJS, Web-first продуктом на фактически поддерживаемом Phaser/runtime contract.

**Версионное уточнение:** официальный Unity Manual для 6000.6 на дату проверки маркирует Unity 6.6 как **Beta**, а не как stable release. Поэтому Unity 6.6 — основной UX/product reference по запросу проекта, но beta-only APIs/features нельзя принимать за стабильный технический baseline или автоматически включать в Codogma. Для утверждений о стабильности и доступности сверять релизные/LTS материалы Unity отдельно. Cocos Creator 4.0 User Manual обозначен как **4.0 LTS**. Не смешивать его с Cocos Creator 3.x docs или с отдельным репозиторием исходников cocos/cocos4.

## 2. Жёсткая граница: 2D, не 2D/3D

Codogma Editor — **2D-only editor**. Не проектировать переключатель 2D/3D и не переносить в продукт 3D-oriented редакторские концепции только потому, что они доступны в Unity или Cocos.

В scope входят только возможности, поддерживающие создание и отладку 2D-игр: orthographic/2D scene navigation, sprite/image/text/tilemap objects, 2D transforms and gizmos, node hierarchy, component Inspector, 2D cameras and sorting, sprite/frame/atlas metadata, 2D animation, skeletal/Spine workflows, 2D UI, 2D physics, 2D effects/particles, audio, project assets, preview and diagnostics.

По умолчанию не входят: 3D scene mode, 3D model/mesh authoring, 3D transform gizmos, 3D lights/materials/shaders/meshes, 3D physics и terrain. Наличие общей панели в референсе не является основанием включать её 3D-подсистему. Общие workspace patterns можно адаптировать только если они улучшают конкретный 2D workflow.

## 3. Что именно изучать в референсах

| Область Codogma | Что смотреть в Unity 6.6 | Что смотреть в Cocos Creator 4.0 | Связанные задачи |
|---|---|---|---|
| Workbench и workspace | Организацию окон, Scene/Game, docked panels, menus, toolbars, shortcuts, workspace persistence | Editor Interfaces, Editor Layout, Main Menu, Tool Bar | COD-80, COD-83, COD-87, CODQA-18 |
| Scene / Hierarchy / Inspector | 2D Scene navigation, selection, transform tools, Inspector, serialized components | Scene, Hierarchy, Inspector, Nodes and Components, coordinate transforms | COD-80, COD-8, COD-27, COD-31, COD-91 |
| Assets / Sprite / Atlas | Sprite Editor, import settings, pivot/borders/physics shape, Sprite Atlas, 2D importers | Assets, Asset Workflow, Sprite Frames, Auto Trim, Atlas, Prefab | COD-12, COD-55, COD-59, COD-86 |
| Animation | 2D Animation workflow, frame-by-frame/skeletal workflows, Animator concepts where relevant | Animation Panel, Animation Clips, Curves, Events, Skeletal Animation | COD-84 |
| Tilemap / world building | Tile Palette, Tilemap Editor, Tilemap Extras, brushes/rule tiles, SpriteShape only where relevant to 2D | TiledMap, Scene panel, 2D rendering order | COD-40, COD-41 |
| 2D UI | Canvas/UI authoring, layout, 9-slice, input and focus | UI System, 2D Objects, Sprite/Label/Mask/Widget | COD-43 |
| 2D physics | 2D Physics, colliders, joints, layers/masks and scene authoring | Physics 2D, 2D RigidBody/Collider/Joint | COD-42, CODQA-1 |
| Effects / particles / Spine / audio | 2D-facing graphics/animation/particle workflows only | Effects, 2D Particle System, Spine assets, Audio | COD-61, COD-89, COD-90 |
| Preview / debugging / diagnostics | Game view, Console, 2D profiler and appropriate debug views | Preview & Debugging, Console, 2D render/physics diagnostics | COD-30, COD-31, COD-32, COD-47, COD-58 |
| Extensions | Extension UX and user-facing custom panels only when needed | Editor Extension and Panel extension guide | COD-53 |

Эта таблица — индекс для исследования, а не обещание реализовать каждую возможность двух продуктов. Каждая задача владеет собственным scope и runtime capability.

## 4. Colibri policy: evidence, not design authority

Legacy source/editor / Colibri — **не третий продуктовый UX-reference** и не blueprint реализации.

### Разрешено изучать в Colibri

- реальные операции, которые уже выполняют пользователи;
- формат входных данных/проектов, сериализацию и совместимые поля;
- текущую связь с Phaser 4.2.1, codegen, runtime, import/reimport и MCP;
- edge cases, ошибки, регрессии, known limitations и test fixtures;
- поведение, которое нужно сохранить ради обратной совместимости существующих проектов.

### Запрещено переносить автоматически

- Workbench/Parts/controls, меню, диалоги и визуальные композиции как эталон нового Host;
- Colibri plugin registry, global state, lifecycle, event bus, service locator, private imports и UI coupling;
- неудобные/непоследовательные interaction patterns, устаревшие UX-компромиссы, скрытые состояния и поведение, противоречащее реальным runtime contracts;
- функции только потому, что «они уже есть в Colibri».

Для каждой legacy-возможности принимай отдельное решение: **retain** (есть доказанная ценность и валидный contract), **redesign** (ценная операция, но новый 2D interaction), **defer** (нет доказанной потребности или runtime readiness), **retire** (не нужна/небезопасна/дублирует лучшее решение). Фиксируй причину. Не считать историческое наличие или Done issue автоматическим требованием к новому Host.

## 5. Обязательный процесс для каждой UI/authoring задачи

До реализации:

1. Прочитать эту страницу и относящиеся к задаче разделы ТЗ, плана миграции, capability matrix и каталога источников.
2. Открыть конкретные разделы Unity 6.6 и Cocos Creator 4.0, относящиеся к workflow. Не ограничиваться скриншотами или общей страницей продукта.
3. Выписать для задачи: пользовательскую цель, 2D interaction pattern, состояния/ошибки, selection/focus/keyboard поведения, data/runtime contract и browser acceptance.
4. Явно решить, какие паттерны **adopt / adapt / reject**. В PR/Linear issue обновлении указать ссылки на рассмотренные страницы и причины отклонения важных паттернов.
5. Сопоставить Colibri только по workflow/data/runtime evidence. Не использовать старый интерфейс как визуальную спецификацию или доказательство корректной архитектуры.

Для готовности:

- пользовательский сценарий должен быть discoverable и последовательно работать в Scene/Hierarchy/Inspector/Assets/других относящихся панелях;
- интеракции должны иметь работающие состояния: selection, hover/focus, disabled, pending/error/empty, cancel, undo/redo, save/reopen — применимо к scope;
- клавиатура, focus restoration, resize, compact viewport и pointer/touch input учитываются там, где относятся к workflow;
- визуальный результат/preview должен соответствовать сериализованной модели и реально доступному Phaser/runtime behavior;
- неизвестные, неподдерживаемые или deferred возможности диагностируются явно; «похоже на Unity/Cocos» не заменяет работающий результат;
- browser acceptance содержит конкретные fixtures, viewport/browser, шаги и evidence. Typecheck/build или наличие панели не доказывают готовность пользовательского workflow.

## 6. Правило при конфликте источников

Приоритет решений:

1. Продуктовые границы Codogma и ТЗ: 2D-only, Web-first, TypeScript-native.
2. Подтверждённые форматы, API, serializer/codegen и runtime contracts Codogma/Phaser 4.2.1.
3. Unity 6.6 — основной UX reference; учитывать Beta status для релизных/технических выводов.
4. Cocos Creator 4.0 LTS — дополнительный workflow reference и cross-check.
5. Colibri — только compatibility/workflow/data/runtime evidence; не UX/architecture authority.

Если референс предполагает API или feature, которых нет в текущем Phaser/runtime contract, не симулировать поддержку UI-заглушкой. Либо сузить workflow до реально работающего поведения, либо отдельно обосновать и проверить runtime/Core изменение с fixtures, migration plan и acceptance.

## 7. Официальные источники

### Unity 6.6 / 2D

- [Unity 6.6 — 2D feature set (6000.6)](https://docs.unity3d.com/6000.6/Documentation/Manual/2DFeature.html) — официальный срез 2D feature set; текущая страница указывает **Unity 6.6 Beta**.
- [Unity 6.6 — 2D overview](https://docs.unity.com/en-us/engine/6000.6/manual/unity2d)
- [Unity 6.6 — Sprites](https://docs.unity.com/en-us/engine/6000.6/manual/unity2d/sprite)
- [Unity 6.6 — Tilemaps](https://docs.unity.com/en-us/engine/6000.6/manual/unity2d/tilemaps)
- [Unity 6.6 — 2D Physics](https://docs.unity.com/en-us/engine/6000.6/manual/unity2d/2d-physics)
- [Unity 6.6 — 2D Sprite Atlas](https://docs.unity.com/en-us/engine/6000.6/manual/unity2d/sprite/atlas/create-sprite-atlas)
- [Unity 6.6 — 2D Profiler](https://docs.unity.com/en-us/engine/6000.6/manual/unity2d/sprite/profiler-2d)

### Cocos Creator 4.0 LTS / 2D

- [Cocos Creator 4.0 LTS manual](https://docs.cocos.com/creator/4.0/manual/en/) — pinned 4.0 documentation; use the 2D-relevant sections below, not 3D workflows.
- [Editor Interfaces](https://docs.cocos.com/creator/4.0/manual/en/editor/index.html), [Scene](https://docs.cocos.com/creator/4.0/manual/en/editor/scene/index.html), [Hierarchy](https://docs.cocos.com/creator/4.0/manual/en/editor/hierarchy/index.html), [Assets](https://docs.cocos.com/creator/4.0/manual/en/editor/assets/index.html), [Inspector](https://docs.cocos.com/creator/4.0/manual/en/editor/inspector/index.html), [Editor Layout](https://docs.cocos.com/creator/4.0/manual/en/editor/editor-layout/index.html), [Preview & Debugging](https://docs.cocos.com/creator/4.0/manual/en/editor/preview/index.html).
- [Asset Workflow](https://docs.cocos.com/creator/4.0/manual/en/asset/asset-workflow.html), [Sprite Frames](https://docs.cocos.com/creator/4.0/manual/en/asset/sprite-frame.html), [Atlas](https://docs.cocos.com/creator/4.0/manual/en/asset/atlas.html), [Prefab](https://docs.cocos.com/creator/4.0/manual/en/asset/prefab.html), [Spine](https://docs.cocos.com/creator/4.0/manual/en/asset/spine.html), [TiledMap](https://docs.cocos.com/creator/4.0/manual/en/asset/tiledmap.html).
- [2D Rendering Sorting](https://docs.cocos.com/creator/4.0/manual/en/engine/rendering/sorting-2d.html), [2D Physics](https://docs.cocos.com/creator/4.0/manual/en/physics-2d/physics-2d.html), [2D Particle System](https://docs.cocos.com/creator/4.0/manual/en/particle-system/2d-particle/2d-particle.html), [Animation Panel](https://docs.cocos.com/creator/4.0/manual/en/animation/animation-editor.html), [Editor Extension](https://docs.cocos.com/creator/4.0/manual/en/editor/extension/readme.html).

### Codogma

- Техническое задание
- План миграции Editor UI
- Матрица возможностей
- Каталог технических источников
- ADR-0005 — SolidJS Editor Host
