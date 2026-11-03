# Acceptance slice: Project Model, User Components и TypeScript authoring

**Дата baseline:** 03.11.2026  
**Связанные задачи:** COD-23, COD-24, COD-25, COD-26, COD-27, COD-28, COD-30, COD-35, COD-91, CODQA-21.  
**Область:** 2D, Web-first, SolidJS Editor Host + host-neutral Core.

## 1. Зачем зафиксирован slice

Первый end-to-end acceptance должен доказать не наличие отдельных панелей или классов, а единую цепочку данных:

`Project → versioned Scene → stable Node IDs / Transform → registered TypeScript component module → Component Schema → Inspector edit → validation → deterministic save/reopen → runtime adapter → Preview → standalone HTML5 build`.

Каждый переход использует явный контракт. Scene data не импортирует произвольные файлы, не угадывает module/class по имени сцены и не исполняет данные через `eval`. Type ID компонента и ID отдельного instance различаются. Для каждого persisted value остаётся один владелец истины.

**Acceptance boundary текущего PR:** реализованы и автоматизированы контрактные/Host slices до serialized authoring data и изолированного ComponentWorld. Phaser adapter, data-driven Scene Loader, Preview Host и standalone HTML5 production build этим изменением не объявляются готовыми.

## 2. Нормативные контракты

### Project Model v1

`ProjectDocumentV1` содержит стабильный project ID, имя, ссылки на Scenes/Assets/Prefabs, явный список component modules и runtime adapter configuration. Все ссылки разрешаются по ID, а не по порядку файлов или имени класса. Asset path — относительный путь внутри project root; абсолютные URL, traversal и некорректные сегменты не являются project asset paths.

### Scene / Node / Prefab v1

Scene хранится как versioned data: stable scene/node/component IDs, иерархия nodes, Transform, active state, component instances, prefab references/overrides и settings. Component instance содержит собственный ID, stable type ID, schema version, enabled flag и persisted properties.

### Component Schema v1

Schema задаёт типы `string`, `number`, `boolean`, `enum`, `asset`, `node`; ограничения, required/default values и storage semantics:

- `persisted` — единственные значения, записываемые в project data;
- `editorOnly` — метаданные редактора, не сериализуемые как runtime state;
- `runtime` — временное runtime state, не записываемое в authoring data.

Один Core validator применяется к schema registration, Inspector edits, Scene pre-save validation и сериализации. Diagnostics имеют machine-readable code, severity, property path, entity/component identity. Неизвестные JSON-compatible properties сохраняются с warning ради forward compatibility; некорректные значения не сериализуются.

Asset и node references используют стабильные IDs и проверяются через переданный validation context. Файловое имя/путь не служит идентичностью runtime type.

### Component lifecycle

`ComponentRegistry` принимает только явно зарегистрированные definitions. `ComponentWorld.update(deltaSeconds)` вызывается внешним владельцем tick; Core не создаёт свой `requestAnimationFrame`. Lifecycle: create → enable → start → update → disable → destroy; структурные attach/detach mutations, запрошенные как внутри update, так и из lifecycle callbacks вне tick, фиксируются на границе текущей операции. Во время dispose новые mutations отклоняются до завершения cleanup; повторный вход и orphan instances не допускаются. Registry сохраняет неизменяемый snapshot schema, а queued attach фиксирует properties на момент запроса. Disposal освобождает component/system state.

## 3. Host authoring workflow

Текущая SolidJS реализация сохраняет существующие `.scene` и `.components` форматы:

1. Project Browser открывает `.components` metadata и TypeScript `.ts/.tsx` source.
2. User Component definition отображает attached component в Inspector; поля Number/String/Boolean/Enum выбираются из Core Schema adapter.
3. Изменение persisted property проходит schema validation перед созданием Scene history entry; Save Scene выполняет повторную проверку всех доступных registered definitions.
4. Неизвестные legacy component references и namespaced fields сохраняются, не удаляются молча.
5. TypeScript source редактируется в центральном Source view и сохраняется существующим project-file API. Для нового definition можно создать adjacent `.ts` file.
6. Source view использует закреплённый TypeScript compiler для syntax/emit diagnostics с line/column. Это **не** semantic project typecheck и не разрешение импортов всего проекта; за это отвечает project `tsc` build.

Compatibility adapter формирует временный `legacy.user-component:<class-name>` schema ID исключительно для старого `.components` Inspector workflow. Это **не** public runtime type ID, не ComponentRegistry registration и не module manifest.

## 4. Automated evidence

Core package: `packages/cge/`.

- Project v1 required envelope, stable references, duplicate IDs, safe asset paths, optional sub-resource ID validation и unknown JSON data.
- In-memory Project v0 → v1 migration; исходный файл автоматически не переписывается.
- Deterministic serialization/round-trip и parse/unsupported-version diagnostics.
- Scene duplicate node/component IDs и finite Transform checks.
- Defaults, required values, enum/numeric constraints, discriminator-specific schema metadata, non-JSON value rejection, persisted/editorOnly/runtime filtering, asset/node reference validation и точные property diagnostics.
- Registry duplicate protection/immutable schema snapshot; explicit-tick lifecycle, deferred structural mutations at operation boundaries, disposal reentrancy protection, attach input snapshots, scene world disposal и invalid delta rejection.

SolidJS Host:

- Legacy `.components` → Core schema adapter, default initialization, enum/numeric Inspector validation, validation of definition/property edits, safe special property names и unknown namespaced field preservation.
- TypeScript single-file syntax diagnostics с line/column.
- Browser regression scenarios проверяют enum attach/detach/edit/save/reopen и TypeScript source open/edit/save/reopen; они запускаются как часть независимой acceptance на promotion candidate по CODQA-21.

## 5. Product UX reference: adopt / adapt / reject

**Unity 6.6 (6000.6), основной 2D UX reference.** Script Component является отдельным script asset: его можно прикрепить к GameObject, а параметры видны в Inspector. Unity Script asset Inspector показывает информацию о файле/preview и предоставляет переход Open; редактирование выполняется в script editor, а не в Inspector. Сохраняем separation между source asset и component instance; адаптируем переход к source в центральный Source view SolidJS Host. Не копируем Unity `MonoBehaviour`, C# serialization semantics или Unity-specific lifecycle. На проверенной странице Unity Manual 6000.6 указано состояние Alpha, поэтому её используем только как UX reference, а не как stable API baseline:
- [Create components with scripts](https://docs.unity.cn/6000.6/Documentation/Manual/CreatingComponents.html)
- [Inspector items](https://docs.unity.com/en-us/engine/6000.6/manual/unity-editor/editor-windows-views-reference/using-the-inspector/inspector-items)

**Cocos Creator 4.0 LTS, дополнительный TypeScript workflow reference.** TypeScript script создаётся как project asset, редактируется и сохраняется, затем добавляется к Scene Node через Add Component/Custom Component и отображается в Properties/Inspector. Это близкий workflow reference для asset → source → node component → Inspector:
- [Cocos Creator 4.0 scripting](https://docs.cocos.com/creator/4.0/manual/en/scripting/index.html)

**Adopt:** source script как project asset; отдельное действие Attach/Add Component; Inspector component block; typed/default property presentation; переход от component definition к source.

**Adapt:** используем существующий Project Browser, центральный Source tab, backend/file API и единый Core Component Schema. Существующий legacy `.components` формат остаётся совместимым до миграции data/runtime contracts. Не вводим editor dependency на Monaco/CodeMirror только ради первой стадии source authoring.

**Reject/defer:** не переносим Colibri registry/controls/lifecycle; не копируем Cocos `cc.Component` или Unity `MonoBehaviour`; не связываем runtime identity с именем source-файла; не считаем syntax-only diagnostics полной TypeScript project compilation.

## 6. Оставшиеся шаги сквозного slice

| Переход | Владелец | Состояние после этого PR |
|---|---|---|
| Project/Scene/Node/Component schemas, validation и migration | COD-24 / COD-25 | Начальный v1 contract и tests реализованы; compatibility с текущими project formats и миграции требуют дальнейшей проверки |
| Component registry/lifecycle/scheduler/dispose | COD-26 | Минимальный host-neutral ComponentWorld и explicit tick tests реализованы; ещё нет loader, system phases и Phaser adapter integration |
| Единственная schema для Inspector/serialization | COD-27 | Core schema + Host adapter, Inspector validation и save preflight интегрированы; persisted reference resolution через полный Project Model graph ограничено передаваемым context |
| Source authoring и User Components Host integration | COD-91 | Открытие/создание/сохранение source, syntax diagnostics, schema-backed Inspector и browser tests подготовлены; runtime type registration/semantic type diagnostics остаются незавершёнными |
| Project Model → Phaser view/runtime | COD-28 | Не реализовано |
| Play/Pause/Resume/Restart/Stop Preview lifecycle | COD-30 | Не реализовано; текущий Game View iframe generated game не является Preview Host |
| Standalone reproducible HTML5 build | COD-33 / COD-34 / COD-35 | Не реализовано; `npm run build` Editor/Core не является game production build |
| Browser workflow acceptance on integrated candidate | CODQA-21 | Отдельная QA; не запускать на topic PR |

## 7. Definition of end-to-end acceptance

Полный slice принимается только после того, как один независимый TypeScript component module:
1. внесён в явный project module manifest с stable type ID;
2. проходит project semantic typecheck и schema validation;
3. назначается как отдельный component instance на два разных stable node IDs;
4. переживает сохранение/закрытие/повторное открытие проекта без изменения значений и unknown fields;
5. загружается data-driven loader без generated TS class для Scene;
6. получает детерминированный lifecycle через Phaser-controlled tick, а не отдельный Core loop;
7. корректно запускается/останавливается в Preview с проверяемой очисткой;
8. попадает в reproducible standalone HTML5 build с проверенными asset/module references.

Пункты 5–8 нельзя считать закрытыми по результатам unit tests Core или Host typecheck. Для них нужны отдельные integration/browser/runtime/build evidence и соответствующие owner issues.
