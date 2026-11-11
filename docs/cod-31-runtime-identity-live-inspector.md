# COD-31 — Runtime Identity и Live Inspector

## Контракт

SolidJS Editor Host запускает Preview через `BrowserPreviewHost`. Host создаёт отдельную Core/Phaser runtime session на основе сохранённого снимка Project и Scene. Runtime Identity включает Project ID, Scene ID, session ID и стабильный persisted Node ID либо Component instance ID. `typeId` проверяет тип Component, но никогда не используется вместо instance ID.

Runtime Hierarchy отражает дерево фактической активной сессии. Выбор Node/Component вызывает `selectRuntimeIdentity`; Host разрешает соответствующий authoring object строго по Node ID и Component instance ID. Отсутствующий или несовпадающий объект отображается как stale selection. Fallback по имени, индексу или type ID запрещён.

Live Inspector получает текущие runtime snapshots, а не читает сериализованные значения как источник live state. Transform показывает runtime и сохранённые значения рядом. Component-поля с `storage: "runtime"` доступны только через синхронный `ComponentBehavior.inspect()`; сериализуемые свойства остаются обычными редактируемыми полями с меткой SAVED. Runtime fields маркируются LIVE · SESSION ONLY, read-only и не участвуют в Project Model, Save или Undo/Redo.

Stop полностью dispose-ит Preview Host: очищаются selection/snapshot, polling, ResizeObserver и event subscriptions. Restart создаёт новую runtime session и новые session-scoped identities; выбор из прошлой сессии не переносится. Смена Scene/Project и unmount выполняют тот же cleanup. События от старого Host/session отбрасываются по generation, host reference и session ID.

## Preview module boundary

Core `ProjectSceneLoader` валидирует runtime Components через module manifest и registry. Встроенные Renderer/FX-типы редактора не являются пользовательскими Script Assets, поэтому Host добавляет для них временные manifest references и минимальные runtime definitions только в in-memory Preview Project. Эти записи не сериализуются и не меняют исходный Project. Пользовательские Components разрешаются через `Project.componentModules` и Core `resolveProjectComponentRegistry`.

Host загружает bounded dependency graph из зарегистрированных в Project Model TypeScript Script Assets (`.ts`/`.tsx`). Разрешены статические относительные `import`/`export ... from`, включая cycles и TypeScript type-only imports; resolver поддерживает extensionless `.ts`/`.tsx`, `.js` → `.ts`/`.tsx` и `index.ts`/`index.tsx`. Каждый путь нормализуется от importer и обязан разрешиться в явный Project Script Asset; абсолютные/package imports, aliases/baseUrl, пути за пределами Project root, assets других типов, `require()`, dynamic `import()`, `import.meta`, JSX и top-level `await` отклоняются с диагностикой. Лимиты Preview loader: 1 MiB на источник, 128 модулей и 8 MiB суммарного исходного графа. TypeScript transpile выполняется для каждого модуля, после чего граф исполняется через единый in-memory CommonJS-compatible loader с cache для циклических зависимостей. Это контролируемая граница зависимостей, но не sandbox: код Script Asset запускается в browser realm Host только после явного Play. Package-manager dependency resolution, tsconfig `extends` resolution в Editor checker и изоляция исполнения остаются отдельными возможностями; неподдерживаемые импорты завершают Preview диагностикой без неявного fallback.

Built-in runtime definitions в этой задаче обеспечивают создание Core Component instances и runtime identity. Asset loading и визуальные Phaser view factories для всех Renderer/FX providers остаются отдельным Preview/renderer workflow; этот PR не объявляет их готовыми.

## UI reference review

| Reference | Решение для COD-31 |
|---|---|
| **Unity 6.6 (6000.6), основной UX reference** | **Adopt:** явное разделение Edit/Play workflow и отдельное состояние работающей игры. **Adapt:** live значения отображаются рядом с authoring Inspector как read-only данные, не становятся изменениями Project Model и исчезают после Stop. |
| **Cocos Creator 4.0 LTS, workflow cross-check** | **Adopt:** непрерывная связь Scene/Hierarchy/Inspector и отдельная операция Preview. **Adapt:** runtime tree — сессионное дерево; переход к authoring selection разрешён только при точном совпадении идентификаторов. |
| **Godot Editor, implementation reference** | **Adopt:** Remote Scene Tree/remote Inspector как модель наблюдения за работающей иерархией и runtime properties. **Adapt:** Codogma использует локальную in-process session и typed snapshot API. **Reject:** поиск authoring target по имени или позиции в иерархии и сопоставление Component по одному type ID. |

Официальные источники: [Unity 6.6 Inspector Manual](https://docs.unity3d.com/6000.6/Documentation/Manual/UsingTheInspector.html), [Unity Game view Manual](https://docs.unity3d.com/ru/current/Manual/GameView.html), [Cocos Creator 4.0 Manual](https://docs.cocos.com/creator/4.0/manual/en/), [Godot — Debugger and Remote Scene Tree](https://docs.godotengine.org/en/stable/tutorials/scripting/debug/overview_of_debugging_tools.html).

## Acceptance сценарий

1. Открыть disposable acceptance Project и Scene.
2. Перейти в Game View и нажать Play; проверить создание runtime session и Runtime Hierarchy.
3. Убедиться, что два Component instances одного `typeId` остаются разными runtime identities.
4. Выбрать второй Component в Runtime Hierarchy; authoring Hierarchy/Inspector должны перейти к точному Node/instance ID.
5. Наблюдать изменяющееся runtime-only значение через `inspect()`, одновременно убедиться, что SAVED значения не изменяются.
6. Перезапустить Preview: session ID меняется, предыдущая selection сбрасывается.
7. Нажать Stop: Host, event subscriptions, snapshots и runtime selection очищаются.
8. Прочитать сериализованный Scene JSON и убедиться, что runtime-only поля не записаны.

Playwright сценарий добавлен в `src/editor/browser-tests/runtime-identity-live-inspector.spec.ts`. Он входит в promotion-gated browser acceptance и не запускается на feature PR по CI правилам репозитория. CI Fast на PR проверяет typecheck/unit/build; browser acceptance выполняется после попадания интегрированного candidate в `test`.


## Live World membership and runtime-only entities

Runtime snapshots are materialized from the current Core `ComponentWorld`, not by assuming that every entry in the immutable Scene graph is still alive. Runtime detach/destroy removes the corresponding entry without invalidating the rest of the Inspector snapshot. Runtime-created Nodes and Components are shown with their session identity and explicitly have no persisted Project Model counterpart (`null` saved values); selection of such an entry cannot silently resolve to an authoring object. If a persisted parent Node is destroyed while a child remains alive in Core, the surviving child is promoted to a root in the runtime snapshot because Core currently has no mutable parent/reparenting contract.
