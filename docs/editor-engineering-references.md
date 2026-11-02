# Открытые игровые редакторы: инженерные reference для Codogma Engine

**Дата проверки:** 02.11.2026.  
**Назначение:** каталог полноценных Open Source игровых редакторов и инженерных решений, которые полезно исследовать при разработке Codogma Engine.  
**Связанные документы:** [стандарт reference для 2D Editor Host](editor-reference-standard.md), [каталог технических источников](REFERENCE-SOURCES.md), [ТЗ](technical-specification.md), [architecture risk register](architecture-risk-register.md), [план миграции Editor UI](editor-ui-migration.md).

## 1. Роль каталога

Каталог **не меняет продуктовую иерархию** Codogma:
1. **Unity 6.6 (6000.6)** — основной UX/product reference.
2. **Cocos Creator 4.0 LTS** — дополнительный reference практических 2D workflows.
3. **Godot Editor source** — отдельный implementation reference для конкретных редакторских подсистем.
4. **Defold, Fyrox, o2, GDevelop, ezEngine, Stride и другие проекты ниже** — дополнительные инженерные источники по project model, документам, Inspector, ресурсам, расширениям, Preview, Undo/Redo и CLI/build tooling.

Дополнительные проекты **не становятся новыми UX-эталонами, runtime-кандидатами или обязательными зависимостями**. Codogma остаётся Web-first, TypeScript-native, SolidJS + Phaser 4.2.1 и строго 2D-only. У 3D-ориентированных движков изучаются только общие editor/asset/build mechanisms.

Наличие проекта в каталоге означает «есть источник для исследования», а не «проект полностью изучен», «его качество подтверждено» или «его код разрешено копировать». Для конкретной задачи выбираются только релевантные исходники.

## 2. Полноценные интегрированные редакторы

Под полноценным редактором здесь понимается поставляемая вместе с движком авторская среда, позволяющая визуально работать с проектом и игровым контентом, а не только IDE для написания кода или runtime-библиотека.

| Проект | Тип и стек | Что исследовать | Ограничения |
|---|---|---|---|
| [Defold](https://github.com/defold/defold) · [Editor manual](https://defold.com/manuals/editor/) | Интегрированный 2D/3D Editor; JVM/JavaFX launcher и graph-oriented editor model; движок и CLI в одном репозитории. | Resource graph, транзакции, Undo, workspace/resource sync, dependency caching, Collection/Scene, Tilemap, GUI, ParticleFX, Editor Scripts, debugger и Bob CLI. | Очень высокая ценность. Defold License 1.0 — специальная лицензия, не MIT/Apache; условия коммерциализации Engine/Editor как Game Engine Product требуют отдельной проверки. |
| [Fyrox](https://github.com/FyroxEngine/Fyrox) · [Fyrox Book](https://fyrox-book.github.io/) | Интегрированный Rust 2D/3D engine/editor; MIT. | Scene Editor, Scene Graph, World Viewer, Inspector, Asset Browser, command/Undo model, Project Manager, UI toolkit и docking. | Высокая инженерная ценность. ARCHITECTURE.md помечен как work in progress; сам upstream описывает engine как в целом monolithic с отдельными crates, а не полностью независимый набор подсистем. |
| [o2 Engine](https://github.com/o2-engine/o2) · [Web Editor demo](https://o2editor.zenkovich.space/) · [Docs](https://github.com/o2-engine/o2/tree/master/Docs) | 2D-oriented engine с визуальным Editor; C++ и JavaScript/TypeScript; MIT. | Scene/Hierarchy/Properties, nested prototypes с overrides, UID asset references, собственный UI framework, animation произвольных reflected fields, curves/layers/state graph, particle scrubbing, Game View, native и browser editor. | Один из наиболее близких по предметной области 2D reference. Меньшее сообщество и зрелость отдельных возможностей требуют самостоятельной оценки. |
| [GDevelop](https://github.com/4ian/GDevelop) · [Architecture overview](https://github.com/4ian/GDevelop/blob/9d595e2fd4ada3f67b7f46c46bce14d740c58ce3/Core/GDevelop-Architecture-Overview.md) · [Wiki](https://wiki.gdevelop.io/) | Web/Desktop visual IDE; Core, TypeScript-based GDJS runtime, React/Electron newIDE и Extensions; MIT для основных перечисленных частей. | Browser-first IDE, Scene Editor, Objects/Behaviors, Events, Preview, Debugger, extension ecosystem, разделение project model/runtime/editor. | Ценный Web-first reference. Event/no-code модель — отличие от TypeScript-native Codogma; изучать архитектуру IDE и расширений, не переносить event language. |
| [ezEngine](https://github.com/ezEngine/ezEngine) · [Docs](https://ezengine.net/pages/docs/) · [Editor overview](https://ezengine.net/pages/getting-started/editor-overview.html) | Интегрированный C++ Editor/engine; MIT. | Editor plugins, feature modularity, Asset Browser/Curator, import pipeline, document/scene editing, visual scripting, custom C++ integration и фоновые asset workflows. | Особенно полезен для assets/extensions. По README полная функциональность доступна только на Windows из-за Direct3D 11; Linux editor экспериментальный и недостаточно функциональный для продуктивной работы. |
| [Stride](https://github.com/stride3d/stride) · [Game Studio manual](https://doc.stride3d.net/latest/en/manual/game-studio/index.html) | Интегрированный C# Game Studio; MIT. Есть отдельный CLI для SDK, создания/обновления проектов и запуска Studio. | Game Studio, scene/entity/component authoring, asset pipeline, prefab/material workflows, editor/CLI разделение, templates и CI build. | Полезен для GUI/CLI separation. Движок и Editor преимущественно 3D-oriented; наличие platformer2d/topdownrpg templates не делает его главным 2D UX-reference. |
| [Doriax](https://github.com/doriaxengine/doriax) · [Docs](https://docs.doriax.org) | Активно развивающийся C++ 2D/3D engine с desktop visual Editor, Lua/C++ scripting; MIT. | Data-oriented/ECS направление, Editor/runtime boundary, Scene/Entity authoring, экспорт standalone CMake project и WebAssembly target. | Exploratory/watchlist. Перед использованием деталей нужно отдельно исследовать фактические workflows, стабильность форматов и зрелость документации. Не считать текущую ветку стабильным baseline. |
| [Castle Game Engine](https://github.com/castle-engine/castle-engine) · [Editor](https://castle-engine.io/editor) · [Manual](https://castle-engine.io/manual) | Cross-platform engine с визуальным 2D/3D Editor и CLI build tool; Object Pascal. | Scene/viewport authoring, component/property workflows, manifest-driven projects, CLI build, VS Code/Lazarus integration, glTF/Spine import. | Интересный пример GUI Editor + отдельный build tool. Важно разделение лицензий: engine core — LGPL со static linking exception, visual editor — GPL. Код редактора не переносить без отдельной юридической оценки. |

### 2.1. Закреплённые upstream revisions

Это snapshot источников, проверенных 02.11.2026, а не обязательство следовать плавающей ветке upstream.

| Проект | Pinned revision | Дата commit | Лицензия / примечание |
|---|---|---|---|
| Defold | [6aa5449](https://github.com/defold/defold/tree/6aa5449b409c7034afc5c10625d89ef22a529719) | 02.11.2026 | Defold License 1.0. Пункт 4(a) запрещает коммерциализировать Work/Derivative Works как Game Engine Product. Для Codogma изучать архитектуру, не копировать код без legal review. |
| Fyrox | [b5b151b](https://github.com/FyroxEngine/Fyrox/tree/b5b151b603bba0549ac03db676568726f17e6807) | 01.11.2026 | MIT; architecture document work in progress. |
| o2 | [485bac1](https://github.com/o2-engine/o2/tree/485bac1642b2bdeef1720c9b0fa2aa43f8176871) | 30.10.2026 | MIT. |
| GDevelop | [9d595e2](https://github.com/4ian/GDevelop/tree/9d595e2fd4ada3f67b7f46c46bce14d740c58ce3) | 02.11.2026 | README указывает MIT для Core, GDJS, newIDE и Extensions; имя/логотип имеют отдельные trademark restrictions. |
| ezEngine | [2662620](https://github.com/ezEngine/ezEngine/tree/2662620e22e9423a34bacb5063e0e3e1161b5692) | 02.11.2026 | MIT; editor/runtime full functionality в README ограничена Windows. |
| Stride | [1375835](https://github.com/stride3d/stride/tree/137583516d320c0f7210d8b04cae36eaf5358da0) | 02.11.2026 | MIT. |
| Doriax | [7d06780](https://github.com/doriaxengine/doriax/tree/7d06780c40800c1cd6f43319de518b3f72dca040) | 02.11.2026 | MIT; актуальный HEAD часто меняется, повторно проверять API/форматы. |

## 3. Что изучать в первую очередь

### 3.1. Defold: транзакционная resource graph

Главный источник — [Editor Systems Overview](https://github.com/defold/defold/blob/6aa5449b409c7034afc5c10625d89ef22a529719/editor/README_SYSTEMS_OVERVIEW.md).

- Editor держит graph nodes и connections для editable resources. У node есть inputs, outputs и properties; outputs вычисляются через зависимости.
- Cached outputs сохраняются до изменения upstream dependencies; ошибки представлены как ErrorValue, распространяются по графу и могут вести к источнику.
- Изменения выполняются через транзакции: крупная операция строится из небольших transaction steps; транзакция применяет все шаги или ни одного.
- Undo использует общую ordered history; совместимые операции могут объединяться по operation sequence.
- Workspace отслеживает изменения файлов и синхронизирует их с project/resource graph. Resource type задаёт node type, read/write functions и sanitize/migration behavior.
- Dirty state определяется сравнением исходного read value и вычисленного save value; несовпадение после открытия документа сигнализирует о проблеме read/serialize symmetry.

**Вопросы для Codogma:** atomic transaction boundaries, Undo grouping, cache invalidation, обработка external rename/delete/modify, round-trip/migrations и diagnostics с путём до первопричины.

**Не копировать автоматически:** единую graph на project data + workspace + view nodes. В Codogma canonical Project Model и transient Editor UI state должны оставаться разными владельцами данных. Заимствовать transaction/cache/resource-sync concepts, не обязательно весь graph architecture.

### 3.2. Fyrox: самостоятельная UI-библиотека и docking

Источники: [ARCHITECTURE.md](https://github.com/FyroxEngine/Fyrox/blob/b5b151b603bba0549ac03db676568726f17e6807/ARCHITECTURE.md), [fyrox-ui](https://github.com/FyroxEngine/Fyrox/tree/b5b151b603bba0549ac03db676568726f17e6807/fyrox-ui), [Editor](https://github.com/FyroxEngine/Fyrox/tree/b5b151b603bba0549ac03db676568726f17e6807/editor).

Интересны graphics-API-agnostic UI toolkit, message-based communication between widgets, layout system, queued drawing commands и DockingManager с dock/undock/resize окон в tiles. При этом ARCHITECTURE.md прямо описывает большую часть Fyrox как monolithic engine и отмечает, что документ не завершён.

**Вопросы для Codogma:** граница UI widgets/drawing backend/domain state; docking operations как команды; panel lifecycle и layout persistence; тестирование layout model без renderer.

**Ограничение:** native Rust controls и message model нельзя переносить буквально в SolidJS. Изучать ownership, layout tree и interaction, не копировать framework.

### 3.3. o2: 2D authoring, prototypes и reflection-driven animation

Источники: [repository](https://github.com/o2-engine/o2/tree/485bac1642b2bdeef1720c9b0fa2aa43f8176871), [Docs](https://github.com/o2-engine/o2/tree/485bac1642b2bdeef1720c9b0fa2aa43f8176871/Docs), [Editor](https://github.com/o2-engine/o2/tree/485bac1642b2bdeef1720c9bfa2aa43f8176871/Editor).

README описывает all-in-one editor с dockable windows для scene, hierarchy, properties, assets, animation/state graph, Game View и memory analyzer; собственный UI framework используется в Editor и игре. Особенно интересны:

- actor/component hierarchy, nested prototypes/prefabs и overrides;
- asset references по UID, а не только по пути;
- reflection-driven animation полей с curves, layers, weights и state graph;
- timeline sub-tracks для звука, видео и частиц, scrubbing preview;
- общие editor/game UI primitives;
- браузерная версия Editor и native/WebAssembly targets.

**Вопросы для Codogma:** nested Prefab overrides; связь schema fields с Inspector и animation tracks; stable asset identity при rename; какие UI concepts можно переиспользовать без связи Editor/game bundle.

Это один из наиболее ценных источников для COD-8, COD-27, COD-84, COD-86 и COD-91.

### 3.4. GDevelop: Core / Editor / Runtime / Extensions

Источники: [architecture overview](https://github.com/4ian/GDevelop/blob/9d595e2fd4ada3f67b7f46c46bce14d740c58ce3/Core/GDevelop-Architecture-Overview.md), [newIDE](https://github.com/4ian/GDevelop/tree/9d595e2fd4ada3f67b7f46c46bce14d740c58ce3/newIDE), [Extensions](https://github.com/4ian/GDevelop/tree/9d595e2fd4ada3f67b7f46c46bce14d740c58ce3/Extensions).

Полезны границы между Core game/project model, TypeScript GDJS runtime и IDE, а также extension ecosystem. Это пример visual IDE, которая связывает Scene Editor, object behaviors, Events, Preview и community extensions.

**Вопросы для Codogma:** discovery и поставка extensions; Editor поверх отдельного game runtime; preview/debugger связь с текущим проектом; отключение capabilities и build graph.

**Ограничение:** GDevelop строит пользовательский сценарий вокруг event/no-code. Codogma не должен перенимать эту модель вместо TypeScript components/scripts.

### 3.5. ezEngine: editor plugins и asset processing

Источники: [Editor source](https://github.com/ezEngine/ezEngine/tree/2662620e22e9423a34bacb5063e0e3e1161b5692/Code/Editor), [Documentation](https://github.com/ezEngine/ezEngine/tree/2662620e22e9423a34bacb5063e0e3e1161b5692/Documentation), [README/design philosophy](https://github.com/ezEngine/ezEngine/blob/2662620e22e9423a34bacb5063e0e3e1161b5692/README.md).

README описывает модульную модель, где большие функции поставляются engine/editor plugins и могут быть удалены или заменены; примеры — sound, physics и particle effects. Для Codogma полезны editor plugin ownership, import/asset processing, resource dependencies и разделение UI от engine capabilities.

**Ограничение платформ:** upstream README указывает, что полная функциональность доступна только на Windows из-за Direct3D 11; Linux editor экспериментальный. Это архитектурный reference, но не доказательство кроссплатформенной готовности.

### 3.6. Stride: общий GUI Editor и headless CLI

Источники: [Game Studio source](https://github.com/stride3d/stride/tree/137583516d320c0f7210d8b04cae36eaf5358da0/sources/editor), [CLI launcher](https://github.com/stride3d/stride/tree/137583516d320c0f7210d8b04cae36eaf5358da0/sources/launcher), [Game Studio manual](https://doc.stride3d.net/latest/en/manual/game-studio/index.html).

Исследовать не столько 2D-интерфейс, сколько согласованную поставку Game Studio, SDK/CLI, templates и user-project build. CLI создаёт проекты, устанавливает/обновляет версии движка и открывает Studio. Это полезная модель для Editor-independent validation/build tooling.

## 4. CocosBuilder и Cocos2d-x: историческая связка

[CocosBuilder repository](https://github.com/cocos2d/CocosBuilder) — самостоятельное macOS/Xcode приложение для визуального создания Cocos2d content. Версия v3.5.0 закреплена на commit 021d741909b2ffa1ecf9d35027ba67ec76546c66 от 22.05.2013. Это исторический 2D content editor, не современная полноценная IDE уровня Defold/Godot.

Важно различать проекты:

- [cocos2d-x](https://github.com/cocos2d/cocos2d-x) — C++ game framework/runtime. Сам по себе это не полноценный integrated visual Editor.
- [CocosBuilder](https://github.com/cocos2d/CocosBuilder) — отдельный companion editor для сцен, UI и анимаций; он экспортирует данные, которые затем загружает соответствующий Cocos2d runtime через reader.
- CocosBuilder поддерживал несколько Cocos2d target integrations; конкретный exporter/reader и совместимость проверять по версии.

### Что полезно изучить в CocosBuilder

1. **Editable document vs runtime representation.** Файл .ccb — редактируемый plist document; default publisher создаёт .ccbi binary representation, которую читает CCBReader. Документ описывает node graph, properties, resolution settings, guides, notes, animation sequences и keyframes.
2. **Declarative node/property plugins.** CCBPProperties.plist описывает node class, editor class, inheritance, editable properties, parent/child restrictions и поведение drop sprite frame. Это пример metadata-driven Inspector.
3. **Export plugins.** Экспортёр получает структуру документа и возвращает данные целевого формата. Это пример разделения Editor document model от публикации runtime format.
4. **Timeline.** Sequence, animated properties, keyframes, easing и chained sequences полезны для изучения компактной 2D animation authoring model.
5. **Editor-only metadata.** Guides/notes/resolution settings и поля состояния поднимают вопрос: какие данные входят в scene asset, какие относятся к authoring metadata, а какие — к local workspace/preferences.

### Ограничения

- upstream revision историческая; commit v3.5.0 датирован 2013 годом. Не использовать CocosBuilder как современный UX/API baseline.
- Основное приложение ориентировано на macOS/Xcode и старый Objective-C toolchain.
- В репозитории есть отдельные license files для сторонних компонентов. MIT в LICENSE_CocosBuilder.txt не означает автоматически MIT для каждого vendored dependency.
- Не переносить устаревшие string-based runtime connections или Cocos2d-specific class names. Заимствовать document/export separation, plugin metadata и timeline.
- Не обещать .ccb/.ccbi import compatibility: это исследовательский источник.

## 5. Дополнительные и специализированные редакторы

Эти проекты расширяют контекст, но не должны автоматически попадать в основной baseline.

| Проект | Почему стоит посмотреть | Почему не основной reference |
|---|---|---|
| [ct.js](https://github.com/ct-js/ct-js) | Компактный 2D desktop IDE, Room/Texture editors, tilemaps, TypeScript/JavaScript scripting, custom modules (catmods); MIT. | Узкий и более opinionated 2D workflow; полезен для быстрых authoring сценариев, а не всего масштаба Workbench. |
| [microStudio](https://github.com/pmgl/microstudio) | Browser-first environment, sprites/maps/sound/code, collaboration и self-hosted deployment; MIT. | Не аналог scene/component/Inspector-centric IDE. Брать web workflow и низкий порог авторинга, не считать заменой полноценной Scene Editor. |
| [Gideros](https://github.com/gideros/gideros) | 2D engine/Studio ecosystem, asset workflow и platform tooling. | Перед использованием фиксировать версию и проверять лицензии Studio и bundled tools; license compatibility в этом проходе не подтверждалась. |
| [rbfx](https://github.com/rbfx/rbfx) | C++17 engine/framework с WYSIWYG Editor; MIT, экспериментальные C# bindings. | Дополнительный source для scene/editor lifecycle; в основном не 2D-oriented продуктовый reference. |
| [Traktor](https://github.com/apistol78/traktor) | C++ engine и собственные editor/tooling paths; MPL-2.0. | В первую очередь общий/3D-oriented engineering source; изучать asset cooking, hot reload и build/deploy tooling. |
| [Wicked Engine](https://github.com/turanszkij/WickedEngine) | MIT, открытый самостоятельный Editor и engine; полезен для scene tooling и runtime/debug workflows. | В README позиционируется как 3D engine; 2D path не является основной областью. |
| [Feather Engine](https://github.com/feather-game-engine/feather) | Исследовательский C++ editor/runtime source; MIT. | Небольшой проект с давней активностью (последняя проверенная активность репозитория — декабрь 2023); только exploratory reference. |
| [UPBGE](https://github.com/UPBGE/upbge) и [Armory3D](https://github.com/armory3d/armory) | Blender-integrated workflows, visual scripting, scene/asset authoring и extension concepts. | Blender является центральной authoring средой; это не самостоятельный Web-first 2D Workbench. В первую очередь 3D-проекты. |
| [jMonkeyEngine SDK](https://github.com/jMonkeyEngine/jmonkeyengine) | Java code-first IDE/SDK и scene tooling вокруг NetBeans ecosystem. | Другой класс developer workflow: полезно для Java tooling, но не основной reference 2D scene editor. |

## 6. Карта применения источников к задачам Codogma

Использовать таблицу как навигацию; конкретная issue должна ссылаться только на те исходники и руководства, которые отвечают её техническому вопросу.

| Задачи | Основные дополнительные источники | Что исследовать |
|---|---|---|
| COD-80 / COD-83 — Workbench, docking, workspace | Defold, Fyrox, o2, GDevelop | Граф/состояние редактора, docking primitives, panel lifecycle, workspace persistence, browser-first IDE. |
| COD-8 / COD-27 / COD-91 — Prefab, Component Schema, Inspector | o2, CocosBuilder, Fyrox | Nested prototypes/overrides, UID refs, reflection, property schema, metadata-driven Inspector, serialization. |
| COD-86 / COD-55 / COD-59 — Assets, atlas, importers | Defold, ezEngine, o2, GDevelop | Resource type registry, dependency tracking, UID, import/reimport, caches, importer/plugin lifecycle. |
| COD-84 — Animation | o2, CocosBuilder, Fyrox | Reflected property tracks, curves/layers, sequence/keyframe model, state graphs, scrubbing and undo. |
| COD-40 / COD-41 — Tilemap and 2D ordering | Defold, GDevelop; Cocos Creator/Godot remain primary 2D workflow cross-checks | Tilemap tools, painting workflow, asset/layer ordering, scene/runtime contract. CocosBuilder здесь только исторический source UI/scene data, не tilemap benchmark. |
| COD-53 — Editor Extensions | Defold, ezEngine, GDevelop, CocosBuilder | Extension discovery, metadata, lifecycle, custom panels, node/property plugins, exporter registration, permission boundary. |
| COD-30 / COD-47 / COD-58 — Preview, diagnostics, runtime Console | Defold, GDevelop, o2, Stride | Editor/runtime ownership, preview lifecycle, error propagation, browser debugging, GUI-independent execution. |

## 7. Единый checklist исследования

Для каждой задачи не нужно изучать все движки. Выбери 1–3 источника, которые показывают разные инженерные решения для конкретной проблемы, и зафиксируй выводы в issue/PR.

1. **Model ownership:** кто владеет canonical project data, view state, generated runtime state и external file changes?
2. **Document lifecycle:** как документы открываются, dirty-marked, сохраняются, мигрируются, закрываются и восстанавливаются после сбоя?
3. **Undo/Redo:** atomic transaction, reversible command, snapshot или operation log? Как объединяются соседние изменения?
4. **Resource identity:** путь или стабильный UID? Что происходит после rename/move/reimport/delete? Как строится dependency graph?
5. **Inspector/reflection:** откуда берутся свойства, ограничения, defaults, custom editors, resource refs и diagnostics?
6. **Extensibility:** как регистрируются component types, panels, importers, exporters, tools? Есть ли versioning, permissions и recovery после ошибки extension?
7. **Preview/runtime:** используется тот же runtime и сериализованные данные или отдельная симуляция? Кто владеет loop, input, pause/resume и cleanup?
8. **Headless workflow:** можно ли без GUI проверить проект, импортировать ресурсы, выполнить build и вернуть детерминированные diagnostics?
9. **Performance:** какие данные лениво загружаются, кэшируются, инвалидируются и виртуализируются? Измеряется ли overhead самого Editor/Profiler?
10. **Failure cases:** как выглядят missing assets, unsupported property types, corrupt project, interrupted import, stale refs и incompatible project version?

### Формат результата по каждой задаче

- **Adopt:** подтверждённый паттерн, который соответствует Codogma contracts.
- **Adapt:** полезная идея, требующая другой реализации из-за SolidJS/TypeScript/Web/Phaser.
- **Reject:** паттерн не подходит; фиксируется причина (runtime semantics, product scope, licensing, security, complexity или target platform).
- **Evidence:** commit/tag, конкретные source files/docs, fixture/test и observed behavior. README или скриншот без проверки исходника не подтверждают внутреннюю архитектуру.
- **Compatibility:** не менять существующие Project Model, serializer, Phaser 4.2.1 или public API из-за сходства с внешним движком. Изменение собственного контракта требует отдельного gap analysis/ADR.

## 8. Лицензии и provenance

- Проверять лицензию не только корневого репозитория, но и конкретного файла, стороннего модуля, bundled asset и codegen output. Сохранять copyright, attribution, NOTICE и third-party notices.
- MIT у Fyrox/o2/GDevelop/ezEngine/Stride/Doriax/ct.js и отдельных проектов из каталога не означает, что все их зависимости имеют MIT.
- Defold License 1.0 имеет специальное ограничение на коммерциализацию самого Engine/Editor как Game Engine Product; не использовать исходники для Codogma code reuse без отдельного legal review.
- У Castle Game Engine core и Editor разные лицензии (LGPL со static linking exception против GPL). Это хороший reference по лицензированию, но не разрешение переносить Editor code в Codogma.
- У CocosBuilder есть отдельные license files для зависимостей. MIT в LICENSE_CocosBuilder.txt не заменяет аудит сторонних компонентов.
- Для исторических/малых проектов проверять реальное состояние ветки, релизов, документов, тестов и поддержки целевых платформ. Наличие editor каталога не подтверждает готовность продукта.
- При возможном заимствовании кода сначала подготовить file-level provenance record и license review. По умолчанию предпочтительно заимствовать идеи и реализовывать собственные контракты.

**Ключевое правило:** Codogma изучает разные редакторы, чтобы увеличить инженерный контекст и избежать повторения известных проблем. Источники помогают задавать правильные вопросы и сравнивать варианты, но не заменяют собственные requirements, TypeScript contracts, тесты, measurement и acceptance на реальном 2D Web workflow.
