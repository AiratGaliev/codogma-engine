# Legacy Project, Scene, Prefab и Asset Pack: форматный и importer inventory

> Статус: фактический inventory текущего dev, не новая спецификация сериализатора и не заявление о полной обратной совместимости.  
> Проверенная база: dev / eecd989224d1f5807578dee08937a51d65141626 (2026-11-05).  
> Охват: checked-in test workspace и исходники репозитория; пользовательские проекты вне workspace не исследовались.

## 1. Назначение и границы

Документ фиксирует наблюдаемые wire formats и контракты:

- Project/Scene/Prefab и User Components;
- Asset Pack v2, importer-ы, content type detection, source paths и reimport;
- sprite/frame metadata и geometry;
- storage abstraction, HTTP API, legacy extension points и editor Undo/Redo;
- соответствия и несовпадения с Project Model v1 и новым SolidJS Editor Host.

**COD-17 — inventory-only.** Здесь не реализуются новый serializer, migration engine, Scene Loader, Editor UI, importer pipeline, автоматическое переписывание пользовательских файлов или миграция проектов. Дефекты и пробелы направляются в задачи-владельцы.

### Уровни достоверности

| Маркер | Что доказано |
|---|---|
| Source | Поведение непосредственно видно в реализации на указанном dev SHA. |
| Fixture | Формат и значения присутствуют в checked-in файле проекта/тестовой среды. |
| Automated | Есть соответствующий текущий automated test; это не обязательно интеграционный тест Colibri/browser. |
| Gap | В проверенной базе нет реализации или тестового подтверждения; отсутствие в репозитории не доказывает невозможность внешнего ручного обхода. |
| External QA | Проверка должна проводиться независимым QA на интегрированном candidate; в рамках COD-17 не выполнялась. |

Colibri используется ниже только как legacy evidence. Его Workbench, Parts, controls, global Platform, private imports, plugin registry и lifecycle **не являются архитектурным образцом для SolidJS Host**.

## 2. Проверенные реальные fixtures

В текущем dev проверено наличие всех 27 файлов в tests/workspace/test-typescript/scenes/:

| Группа | Fixtures |
|---|---|
| Базовые Scene / Prefab / game data | AgentLevel.scene, CoinRush.scene, Level.scene, MyGame.scene, OfficialE2E.scene, TestOneObjectScene.scene |
| Prefab и composition | CoinPrefab.scene, DinoPrefab.scene, DoubleDinoPrefab.scene, issue154/BaseContainerPrefab.scene, issue154/DerivedContainer1Prefab.scene, issue154/Issue154.scene |
| Вложенные Prefab / Container | nestedPrefabInContanerIssue/AnotherPrefabPrefab.scene, nestedPrefabInContanerIssue/NestedInsideContainerPrefabInstanceScene.scene, nestedPrefabInContanerIssue/NestedPrefabInContainerPrefab.scene |
| Components / lifecycle | componentsAwake/TestComponentsAwakeEvent.scene, prefabAwake/PrefabAwakeTest.scene, prefabAwake/WithAwakeEventPrefab.scene, prefabAwake/WithoutAwakeEventPrefab.scene |
| Serialization / migration edge cases | TestListFieldScene.scene, originMigration/OriginMigration.scene, originMigration/TextWithOriginPrefab.scene |
| 2D authoring / rendering | TestTileSpriteSizeInInspector.scene, TextWordWrapScene.scene, fx-acceptance.scene |
| Physics / Tilemap / regression | box2d-acceptance.scene, issue147/Issue147.scene |

Полные относительные пути находятся в tests/workspace/test-typescript/scenes/. Эти файлы — реальные fixture data, а не synthetic примеры. Их наличие доказывает только представленные варианты одного test workspace.

### Per-fixture source, format и version inventory

Все пути ниже относительны корня репозитория. Значение missing означает, что поле meta.version отсутствует в исходном JSON; версия не выводится из имени файла или даты.

| Source fixture | Format / sceneType | meta.version | displayList entries | plainObjects | lists |
|---|---|---:|---:|---:|---:|
| tests/workspace/test-typescript/scenes/AgentLevel.scene | .scene / SCENE | 5 | 4 | 1 | 0 |
| tests/workspace/test-typescript/scenes/CoinPrefab.scene | .scene / PREFAB | 5 | 1 | 0 | 0 |
| tests/workspace/test-typescript/scenes/CoinRush.scene | .scene / SCENE | 5 | 4 | 0 | 0 |
| tests/workspace/test-typescript/scenes/DinoPrefab.scene | .scene / PREFAB | missing | 1 | 0 | 0 |
| tests/workspace/test-typescript/scenes/DoubleDinoPrefab.scene | .scene / PREFAB | missing | 1 | 0 | 1 |
| tests/workspace/test-typescript/scenes/Level.scene | .scene / SCENE | missing | 5 | 0 | 0 |
| tests/workspace/test-typescript/scenes/MyGame.scene | .scene / SCENE | 5 | 2 | 0 | 0 |
| tests/workspace/test-typescript/scenes/TestListFieldScene.scene | .scene / SCENE | missing | 1 | 0 | 2 |
| tests/workspace/test-typescript/scenes/OfficialE2E.scene | .scene / SCENE | 5 | 2 | 1 | 1 |
| tests/workspace/test-typescript/scenes/TestOneObjectScene.scene | .scene / SCENE | missing | 1 | 0 | 0 |
| tests/workspace/test-typescript/scenes/TestTileSpriteSizeInInspector.scene | .scene / SCENE | 3 | 2 | 0 | 0 |
| tests/workspace/test-typescript/scenes/TextWordWrapScene.scene | .scene / SCENE | missing | 2 | 0 | 0 |
| tests/workspace/test-typescript/scenes/box2d-acceptance.scene | .scene / SCENE | 5 | 5 | 0 | 0 |
| tests/workspace/test-typescript/scenes/componentsAwake/TestComponentsAwakeEvent.scene | .scene / SCENE | missing | 3 | 0 | 0 |
| tests/workspace/test-typescript/scenes/fx-acceptance.scene | .scene / SCENE | 5 | 4 | 0 | 0 |
| tests/workspace/test-typescript/scenes/issue147/Issue147.scene | .scene / SCENE | 3 | 2 | 0 | 1 |
| tests/workspace/test-typescript/scenes/issue154/BaseContainerPrefab.scene | .scene / PREFAB | 2 | 1 | 0 | 0 |
| tests/workspace/test-typescript/scenes/issue154/DerivedContainer1Prefab.scene | .scene / PREFAB | 2 | 1 | 0 | 0 |
| tests/workspace/test-typescript/scenes/issue154/Issue154.scene | .scene / SCENE | 2 | 1 | 0 | 0 |
| tests/workspace/test-typescript/scenes/nestedPrefabInContanerIssue/AnotherPrefabPrefab.scene | .scene / PREFAB | 3 | 1 | 0 | 0 |
| tests/workspace/test-typescript/scenes/nestedPrefabInContanerIssue/NestedInsideContainerPrefabInstanceScene.scene | .scene / SCENE | 3 | 1 | 0 | 0 |
| tests/workspace/test-typescript/scenes/nestedPrefabInContanerIssue/NestedPrefabInContainerPrefab.scene | .scene / PREFAB | 3 | 1 | 0 | 0 |
| tests/workspace/test-typescript/scenes/originMigration/OriginMigration.scene | .scene / SCENE | 3 | 1 | 0 | 0 |
| tests/workspace/test-typescript/scenes/originMigration/TextWithOriginPrefab.scene | .scene / PREFAB | 3 | 1 | 0 | 0 |
| tests/workspace/test-typescript/scenes/prefabAwake/PrefabAwakeTest.scene | .scene / SCENE | missing | 2 | 0 | 0 |
| tests/workspace/test-typescript/scenes/prefabAwake/WithAwakeEventPrefab.scene | .scene / PREFAB | 3 | 1 | 0 | 0 |
| tests/workspace/test-typescript/scenes/prefabAwake/WithoutAwakeEventPrefab.scene | .scene / PREFAB | missing | 1 | 0 | 0 |

Итог по выборке: meta.version=2 — 3 файла; version=3 — 8; version=5 — 7; поле отсутствует — 9. Все 27 JSON документов имеют id. Все файлы являются .scene и используют legacy Scene content-type resolver; SCENE/PREFAB определяется полем sceneType. displayList entries — только верхнеуровневые элементы списка, не рекурсивный total node count.

Дополнительно проверены:

- tests/workspace/test-typescript/components/Behaviors.components — definitions PushOnClick и Tint; gameObjectType = Phaser.GameObjects.Image; числовое свойство pushScale с default 0.5; option tint со значениями red/green/blue; generateAwakeEvent; outputLang: TYPE_SCRIPT.
- tests/workspace/test-typescript/scenes/componentsAwake/AwakeTest.components — definitions ComponentWithoutAwake и ComponentWithAwake без properties; различаются generateAwakeEvent.
- tests/workspace/test-typescript/assets/asset-pack.json — Asset Pack v2 с section1.files[] и item { type: "image", key: "dino", url: "assets/dino.png" }; metadata contentType, app, version: 2.

### Состояние связанного migration evidence

PR [#41 — COD-25](https://github.com/AiratGaliev/codogma-engine/pull/41) содержит расширенный field mapping, копии fixtures в Core migration test area и migration regression tests. На момент проверки PR остаётся open/draft, его head отстаёт/разошёлся с текущим dev, GitHub сообщает mergeable=false. Его converter/tests **не входят в проверенный dev** и не используются здесь как доказательство уже поставленной реализации. Исходные fixtures выше подтверждены непосредственно в текущем дереве.

## 3. Legacy Scene и Prefab wire format

### 3.1 Контейнер документа

Источники: source/editor/plugins/phasereditor2d.scene/src/core/json/ISceneData.ts, Scene.ts, SceneWriter.ts, SceneContentTypeResolver.ts.

| Поле | Наблюдаемое назначение / правило |
|---|---|
| id | ID Scene document; сериализуется как строка, генерация legacy Scene использует UUID. |
| sceneType | Разделяет SCENE и PREFAB. Это discriminator внутри .scene, не отдельный формат файла. |
| settings | Scene/editor/compiler/runtime-generation settings в одном legacy object; не все поля предназначены для game runtime. Defaults часто не записываются. |
| displayList | Основные GameObject nodes с сохранением порядка массива и вложенных children. |
| plainObjects | Отдельная коллекция serializable non-GameObject objects. Её взаимный порядок с displayList не задан. |
| lists | Дополнительные object lists; сериализуются при наличии. Не путать с Node list. |
| prefabProperties | Legacy declarations exposed Prefab properties. |
| codeSnippets | Scene-associated code snippets, если присутствуют. |
| meta | app, url, contentType, optional version; Scene resolver принимает .scene только при распознанном meta.contentType. |

Scene.CURRENT_VERSION = 5. В checked-in fixtures встречаются разные значения meta.version (в том числе 2, 3, 5) и отсутствие версии. Это версия legacy Scene serialization, а не версия Project-wide graph или Asset Pack.

**Prefab — это документ того же формата .scene с sceneType: "PREFAB".** Scene content-type resolver распознаёт расширение .scene; отдельный legacy .prefab extension/serializer в проверенных fixtures и resolver-е не обнаружен.

### 3.2 Object / Node data

Источники: source/editor/plugins/phasereditor2d.scene/src/core/json/IObjectData.ts, Serializer.ts, Scene.ts.

| Поле | Наблюдаемая семантика |
|---|---|
| id | Сохраняемая идентичность GameObject; используется в editor operations, references и сериализации. |
| type | Legacy object discriminator, например Image, Text, Container, TileSprite, EditableTilemap, FX/physics-specific objects. Разрешается через зарегистрированный legacy object extension. |
| label / displayName | Имя/отображаемая подпись объекта; это не type ID. |
| list | Вложенные children для Container/Layer-подобных объектов; порядок массива значим. |
| plainObjects (на уровне документа) | Другая коллекция, не вложенный список GameObjects. |
| components | Legacy имена User Component classes, не stable type IDs и не Component instance IDs. |
| prefabId | Ссылка на legacy Prefab, разрешаемая через SceneFinder. Не путь файла. |
| unlock | Список разблокированных properties для Prefab instance; Serializer использует его при чтении/записи overrides. |
| nestedPrefabs | Дополнительные nested Prefab data; сохраняется отдельно от обычного list. Полная propagation semantics не выводится из поля. |
| scope, private_np | Legacy code-generation/editor metadata; не следует автоматически переносить в runtime Node contract. |

Object payload также содержит type-specific поля: transform, text/font/wrap, texture/frame, TileSprite sizes, tilemap/layer data, Arcade/Box2D body/shape/material, Collider references, FX values и другие свойства соответствующих legacy object extensions. Примеры есть в реальных fixtures выше.

### 3.3 Transform, order, unknown type и migrations

- Transform-поля сериализуются в составе type-specific object data. Не существует гарантии, что любой произвольный numeric-like value является валидным transform: Core v1 валидирует finite numbers.
- Слои и контейнеры образуют вложенный display order; Scene traversal и sorting выполняются depth-first для дочерних GameObjects.
- При сериализации Prefab instance записываются только поля, разрешённые unlock; namespaced properties User Components обрабатываются отдельно. Это legacy механизм property overrides, а не эквивалент Core v1 PrefabOverride без explicit mapping.
- Serializer разрешает object type через legacy extension. Отсутствующее расширение для указанного type — ошибка, а не generic Node fallback.
- Legacy Scene migration реализована отдельными SceneDataMigrationExtension implementations: UnlockPositionMigration_v1_to_v2, OriginMigration_v2_to_v3 и TextAlignMigration. Первые две учитывают старые документы без версии как version 1; миграции работают с вложенными списками. Origin migration специально пропускает fix-up сломанного Prefab reference, чтобы не остановить обработку остальных children.
- В проверенном dev не найден полный declarative registry всех возможных переходов Scene v1→v5 с доказательством исчерпывающего покрытия. Нельзя выводить из CURRENT_VERSION = 5, что любой старый документ уже полностью мигрируется.
- Автоматический legacy Scene → Core Project Model v1 converter в текущем dev отсутствует. Его opt-in реализация находится в неслитом PR #41.

## 4. User Components: definition и instance — разные данные

### 4.1 Legacy definition file

Реальные .components fixtures описывают definitions в JSON:

- верхнеуровневый components[];
- name, baseClass, gameObjectType;
- properties[]: name, label, tooltip, defValue, customDefinition, type и optional options;
- generateAwakeEvent;
- meta с приложением/content type, outputLang.

В этих fixtures нет отдельного versioned schema marker, stable module ID или stable component typeId. Имя класса и gameObjectType не являются безопасным stable identity для новой схемы.

### 4.2 Legacy Scene instance

Scene object components содержит имена классов (например, PushOnClick, Tint). Namespaced property values могут храниться в object data. Для преобразования в Core v1 недостаточно сопоставления по имени без однозначной декларации.

### 4.3 Core v1 target mapping

Текущий packages/cge/src/project-model/contracts.ts ожидает:

- ComponentInstance.id — ID конкретного attachment;
- typeId — stable registered type identity;
- schemaVersion — версия property contract;
- enabled и properties — persisted component state;
- Project component-module manifest — явное разрешение modules/types, а не поиск source files по имени.

**Правило совместимости:** legacy class name → Core typeId разрешается только явной таблицей/manifest с известной schemaVersion; instance ID должен существовать отдельно. Не выводить IDs из имени класса, файла или индекса массива. Неизвестный class/component, custom property или value не удаляется молча: это требует structured diagnostic и решения COD-25/COD-27.

## 5. Asset Pack v2 и legacy Asset IDs

Источник: source/editor/plugins/phasereditor2d.pack/src/core/AssetPack.ts, AssetPackItem.ts, workspace fixture.

- Asset Pack metadata использует meta.contentType = phasereditor2d.pack.core.AssetContentType, meta.version = 2; item data обычно содержит type, key и format-specific URL/config fields.
- key — имя lookup для Phaser/Asset Pack, а не стабильный ID ресурса.
- URLs — project/public-relative file locators; importer-ы могут хранить несколько ссылок и специальные поля (atlasURL, textureURL, fontDataURL, jsonURL, audioURL, path, normalMap и другие).
- AssetPack.fromJSON() читает все root sections, в которых есть files[], затем создаёт typed items и сортирует их по key. Неизвестный item type приводит к ошибке создания.
- AssetPack.toJSON() нормализует содержимое в одну section1.files и записывает собственный ограниченный набор meta fields. Следовательно, произвольные root-level fields, исходное разбиение на несколько sections и неизвестные root metadata **не имеют гарантии round-trip** через legacy AssetPack serializer. При этом item data остаётся объектом, и его дополнительные поля могут сохраниться.
- AssetPackItem.getEditorData() — ephemeral in-memory data; он не является сериализованной частью item JSON. Сохраняемые custom metadata должны находиться в getData().
- Default dependency discovery смотрит url, urls, normalMap; subclasses добавляют собственные поля. Внешний URL field, не учтённый конкретным item type, не становится автоматически tracked dependency.

## 6. Legacy importer catalog

Importer registration находится в DefaultAssetPackExtension.createImporters(); registry в Importers.getAll() собирает importer-ы из extensions; content-type detection регистрируется в AssetPackPlugin.registerExtensions(). Ниже указаны реальные importer families, а не обещание одинакового preview/runtime support для всех типов.

| Asset Pack type | Importer / распознавание источника | Создаваемые data fields / ограничения |
|---|---|---|
| image | Single file, image content type | url: string; исходное изображение. |
| svg | Single file, SVG content type | url: string; отдельный SVG item. Для SVG также есть legacy importer path как image. |
| atlas | JSON с frames object | atlasURL + textureURL; texture PNG подбирается по sibling/extension convention. |
| atlasXML | XML с одним TextureAtlas node | atlasURL + textureURL; полный XML schema validation resolver-ом не выполняется. |
| unityAtlas | Файл с расширением .meta | atlasURL + textureURL; resolver классифицирует по extension без проверки metadata contents. |
| multiatlas | JSON с textures object | url + path; parser перебирает textures и их frames. |
| spritesheet | Image content type | url + frameConfig (по умолчанию 32×32, start 0, end -1, spacing/margin 0). |
| aseprite | JSON export с meta.app, содержащим www.aseprite.org | Atlas-style atlasURL + textureURL; читает frame tags. Это Aseprite JSON export + image, не нативный raw .aseprite layer importer. |
| animation | Animations content type, single-file URL | url; animation config зависит от связанного Asset Pack/runtime parser. |
| bitmapFont | XML с одним font и одним chars element | fontDataURL + sibling textureURL PNG. |
| font | Recognized font content type | url, inferred TTF/OTF/WOFF/WOFF2/EOT format, empty descriptors; browser loading/GPU support здесь не доказывается. |
| texture | Texture content type | url: { IMG: ... }; special Phaser texture config shape. |
| tilemapCSV | CSV content type | url; tile dimensions / tilesets не появляются из одного CSV автоматически. |
| tilemapImpact | Impact tilemap content type | url; proprietary format path. |
| tilemapTiledJSON | JSON heuristic: layers[], tilesets[], tilewidth number; проверка tileheight в resolver фактически недостаточна | url; item читает layer names/tilesets и caches TILED_JSON. TMX/XML importer не найден. |
| spineJson | JSON, skeleton.spine string starting with 4 | Single file url; resolver matches Spine major version 4 only. |
| spineBinary | .skel extension | Single file url; binary structure не валидируется resolver-ом. |
| spineAtlas | Spine atlas content type | Single file url; связанный atlas/image resolution требует соответствующих sibling files. |
| audioSprite | JSON с resources[] и spritemap object | jsonURL + найденные sibling audio files в audioURL[], сопоставленные по basename. |
| audio | Audio content type, single file | url[] (array mode), позволяющий несколько файлов в item; фактический codec/browser support требует target testing. |
| video | Video content type, single file | url[]; codec/browser support отдельно не гарантируется. |
| plugin | JavaScript content type | url, defaults start: false, mapping: "". |
| sceneFile | JavaScript content type | url; внешний JS Scene source, не .scene serialization. |
| scenePlugin | JavaScript content type | url, systemKey и sceneKey по имени файла. |
| script | JavaScript content type | url; source file reference. |
| scripts | JavaScript content type, multi-file importer | url[] с выбранными файлами в заданном порядке. |
| text, json, xml, css, glsl, html | Single file по соответствующему content type | url; parser semantics зависят от item/runtime consumer. |
| htmlTexture | HTML content type | url, defaults width/height 512. |
| binary | Generic binary content type | Generic file url; no type-specific data guarantee. |

### 6.1 Metadata, reimport и fixture coverage по зарегистрированным importer routes

Ниже зафиксировано не только наличие importer в registry, но и фактическое поведение post-import metadata и reimport. Общий error/rollback contract находится в следующем разделе; format-specific rollback override у зарегистрированных importer-ов не найден.

| Asset Pack type / importer route | Source recognition | Entry/dependency data | Metadata after successful import | Reimport и реальные fixture |
|---|---|---|---|---|
| image / SingleFileImporter | Cached Image content type | url: project/public-relative string; key из имени файла | codogma v1 автоматически создаётся после build для ImageFrameContainerAssetPackItem с string url | Reimport UI доступен. Единственный image source в workspace — tests/workspace/test-typescript/assets/dino.png, referenced by assets/asset-pack.json; это fixture data, не automated import/reimport test |
| svg / SingleFileImporter → svg | Cached SVG content type | url + svgConfig defaults {width:0,height:0,scale:0} | SvgAssetPackItem наследуется от ImageAssetPackItem; codogma v1 создаётся через общий ImageFrameContainer path | Reimport UI проходит через ImageAssetPackItem predicate и string url; отдельного SVG source fixture нет |
| image / SVG-as-image route | Тот же cached SVG content type; отдельный registry route создаёт type=image | url string, без svgConfig из svg-type route | Image item получает codogma v1, если parser возвращает frames | Reimport UI доступен как Image item; отдельного SVG source fixture нет. Registry содержит два разных SVG import routes (image и svg), это не два разных исходных формата |
| atlas | Atlas JSON resolver: frames object | atlasURL + textureURL; texture path выбирается по sibling/PNG extension convention | codogma не инициализируется: entry не имеет строкового url; frame parser сам по себе не создаёт codogma metadata | Reimport UI отсутствует; общий reimport требует string url, а здесь atlasURL. Atlas JSON/PNG fixture отсутствует |
| atlasXML | XML resolver: ровно один TextureAtlas element | atlasURL + textureURL | codogma отсутствует по той же причине, что и для Atlas | Reimport UI/общий string-url reimport не поддерживаются; XML atlas fixture отсутствует |
| unityAtlas | Resolver принимает extension .meta без разбора содержимого | atlasURL + textureURL | codogma отсутствует | Reimport UI/общий string-url reimport не поддерживаются; Unity .meta/texture fixture отсутствует |
| multiatlas | Multiatlas JSON resolver: textures object | url string + path; dependency scan читает textures[].image и добавляет каждый texture URL | MultiatlasAssetPackItem — ImageFrameContainerAssetPackItem с string url, поэтому текущий initializer создаёт codogma v1 | AssetReimportSection не показывает UI для Multiatlas; при прямом вызове registered MultiatlasImporter + общий single-string reimport path технически совместимы. Multiatlas JSON и page images fixture отсутствуют |
| spritesheet | Cached Image content type | url + frameConfig defaults: frameWidth/Height 32, startFrame 0, endFrame -1, spacing/margin 0 | codogma v1 и frame descriptors после parser build | Reimport UI доступен; dedicated spritesheet image/frameConfig fixture отсутствует |
| aseprite | Aseprite JSON resolver проверяет meta.app substring www.aseprite.org | atlasURL + textureURL через BaseAtlasImporter; AssetPack item читает JSON frameTags и строит animation configs | Outer Aseprite item не является ImageFrameContainerAssetPackItem; codogma initializer не применяется | Reimport UI и общий reimport не поддерживаются: источник лежит в atlasURL, не в string url. Fixture Aseprite JSON export + PNG отсутствует; native .aseprite layer importer не найден |
| animation | JSON resolver проверяет meta.contentType === Phaser v3 Animations | url string | Отдельная Sprite metadata не создаётся | Общая UI reimport секция не допускает animation item; animation JSON fixture отсутствует |
| bitmapFont | XML resolver требует один font и один chars element | fontDataURL + sibling textureURL PNG | Специальная Sprite metadata не создаётся | Reimport UI отсутствует; bitmap-font XML/PNG fixture отсутствует |
| font | Cached Font content type | url string + format inferred from ttf/otf/woff/woff2/eot extension + empty descriptors | Font-specific entry fields; codogma frame metadata не создаётся | Reimport UI отсутствует; отдельного font source fixture нет |
| texture | Cached Texture content type | url object, обычно {IMG: project-relative URL}; TextureAssetPackItem наследует ImageAssetPackItem | codogma не создаётся: initializer принимает только string url | Подтверждён reimport mismatch: AssetReimportSection predicate принимает TextureAssetPackItem через ImageAssetPackItem inheritance, но Importer.reimportItem отвергает object url с требованием single string source URL. Нужно либо исключить Texture из UI predicate, либо реализовать корректный IMG URL contract. Texture fixture отсутствует |
| tilemapCSV | Cached CSV content type | url string | Специальная metadata не создаётся | Reimport UI отсутствует; CSV tilemap fixture отсутствует |
| tilemapImpact | JSON resolver требует entities[] и layer[] | url string | Специальная metadata не создаётся | Reimport UI отсутствует; Impact JSON fixture отсутствует |
| tilemapTiledJSON | JSON resolver эвристически проверяет layers[], tilesets[] и tilewidth number; tileheight фактически не валидируется | url string; item строит Phaser TILED_JSON cache и использует layer/tileset data | Специальная metadata не создаётся | Reimport UI отсутствует; Tiled JSON fixture отсутствует. AgentLevel.scene — legacy EditableTilemap scene data, не Tiled import source |
| spineJson | Spine JSON resolver требует skeleton object и spine string, начинающуюся с 4 | url string; key strips -pro/-ess suffix | Специальная Sprite metadata не создаётся | Reimport UI отсутствует; Spine JSON fixture отсутствует |
| spineBinary | Resolver классифицирует extension .skel | url string; binary structure на этапе resolver не разбирается | Специальная Sprite metadata не создаётся | Reimport UI отсутствует; .skel fixture отсутствует |
| spineAtlas | Resolver классифицирует extension .atlas | url string; key нормализуется удалением -pma и суффиксом -atlas | Специальная Sprite metadata не создаётся | Reimport UI отсутствует; Spine atlas/image fixture отсутствует |
| audioSprite | JSON resolver требует resources[] и spritemap object | jsonURL + audioURL[] sibling audio files с тем же basename | Audio-sprite data only | Reimport UI отсутствует; audio-sprite JSON/audio fixture отсутствует |
| audio | Cached Audio content type; SingleFileImporter запускается в url-array mode | url: [source URL] | Специальная metadata не создаётся | Reimport UI отсутствует; аудиофайл/codec fixture отсутствует |
| video | Cached Video content type; url-array mode | url: [source URL] | Специальная metadata не создаётся | Reimport UI отсутствует; видеофайл/codec fixture отсутствует |
| plugin | Cached JavaScript content type | url + start:false + mapping:"" | Специальная metadata не создаётся | Reimport UI отсутствует; dedicated Asset Pack plugin entry fixture отсутствует |
| sceneFile | Cached JavaScript content type | url string | Специальная metadata не создаётся | Reimport UI отсутствует; generated Scene .ts companions и game.js не являются Asset Pack sceneFile entry fixtures |
| scenePlugin | Cached JavaScript content type | url + systemKey + sceneKey из basename | Специальная metadata не создаётся | Reimport UI отсутствует; Scene Plugin Asset Pack entry fixture отсутствует |
| script | Cached JavaScript content type | url string | Специальная metadata не создаётся | Reimport UI отсутствует; отдельный Asset Pack script entry fixture отсутствует |
| scripts | Cached JavaScript content type; multi-file importer | Один entry с url[] в порядке выбранных файлов; key по первому файлу | Специальная metadata не создаётся | Reimport UI отсутствует; batch scripts entry fixture отсутствует |
| text / json / xml / css / glsl / html | Соответствующие cached Web content types | Generic SingleFileImporter: url string; special parser behavior not guaranteed by importer | Специальная metadata не создаётся | Reimport UI отсутствует. В workspace есть locale/*.json и config JSON, но они не являются fixtures Asset Pack import/preview/reimport |
| htmlTexture | Cached HTML content type | url string + width:512 + height:512 defaults | Специальная metadata не создаётся | Reimport UI отсутствует; HTML texture entry fixture отсутствует |
| binary | Generic CONTENT_TYPE_ANY fallback | url string; no format-specific parser/metadata | Специальная metadata не создаётся | Reimport UI отсутствует. Fallback может создать opaque binary entry, но не делает raw PSD/.aseprite/TMX импортируемым, не декодирует файл и не подтверждает preview/runtime support. Format fixture отсутствует |

**Правила интерпретации этой матрицы:**

1. Все routes получают type и уникализированный Asset Pack key через общий Importer; их format-specific metadata определяется только конкретным createItemData()/AssetPackItem/parser. Успешная регистрация, content type или generic binary fallback не равны format validation.
2. Sprite metadata v1 автоматически добавляется не всем форматам, а только ImageFrameContainerAssetPackItem с string data.url. В текущем коде это покрывает Image, SVG, Spritesheet и Multiatlas. Atlas/Atlas XML/Unity Atlas хранят atlasURL + textureURL; Texture — object url; Aseprite — atlasURL/textureURL и animation item. Для них этот initializer не создаёт codogma metadata.
3. Низкоуровневый Importer.reimportItem() общий, но требует string data.url и исходный файл в project tree. AssetPackEditor.reimportItem_async() дополнительно требует ImageFrameContainerAssetPackItem. User-facing AssetReimportSection ещё уже: predicate ограничен ImageAssetPackItem и SpritesheetAssetPackItem. Эти три границы не взаимозаменяемы.
4. Для всех импортёров действует общая preload/build cleanup политика, описанная ниже. В текущем test workspace существует только один фактический image source dino.png, используемый Asset Pack v2 fixture; остальные перечисленные external-format source fixtures отсутствуют. Это inventory implementation, а не подтверждение всех browser codecs/preview/generated runtime paths.

### Import transaction и error/rollback semantics

Путь импорта состоит из двух уровней, и их гарантии нужно различать:

1. Importer.autoImport() выбирает один из двух контрактов: обычный importer вызывает importFile() для каждого файла; multi-file importer получает весь массив и создаёт один item через importMultipleFiles().
2. importFile()/importMultipleFiles() добавляет entry в Asset Pack до preload/build. Если отдельный item не строится, importer удаляет его и сбрасывает cache. Внешний autoImport() при ошибке также удаляет все entries, которые успели успешно импортироваться в рамках текущего batch, и сбрасывает их caches. Частичный результат не остаётся в Asset Pack.
3. AssetPackEditor.importData_async() делает snapshot до импорта, получает items от importer, повторно выполняет preload/build для списка импортированных items, обновляет viewer/blocks и создаёт snapshot Undo operation после успеха. Если последующий шаг завершается ошибкой, editor удаляет созданные entries, очищает caches, пробует обновить blocks и повторно выбрасывает исходную ошибку.
4. Таким образом, заявленная атомарность относится к in-memory Asset Pack entries/cache и editor snapshot operation. Она не означает transaction для копирования/изменения source files на диске и не доказывает rollback внешних побочных эффектов importer-а.

Это фактический legacy контракт. Новому Host нужен эквивалентный typed transaction/error policy, но не импорт Colibri editor classes.

### Content type detection — фактическая строгость

Resolver не равен полноценному validator:

- Atlas JSON проверяет наличие frames и тип object; multiatlas проверяет textures object.
- Atlas XML ищет ровно один TextureAtlas element через DOMParser.
- Unity Atlas resolver принимает любой файл с расширением .meta.
- Aseprite resolver читает JSON и проверяет meta.app substring.
- Bitmap font resolver проверяет существование одного font и одного chars element.
- Audio sprite resolver проверяет resources[] и spritemap object.
- Tiled JSON resolver имеет defect: typeof(data.tileheight) возвращает строку в любом случае, поэтому условие не проверяет числовой тип и не подтверждает наличие tileheight. Текущая detection heuristic должна быть усилена тестами в owner issue; inventory не исправляет importer.
- Spine JSON resolver принимает version string, начинающийся с 4; Spine JSON иной major version не проходит этот resolver.
- Generic extension-based content types (например .skel) классифицируют по расширению, не разбирая весь формат.

### PSD, Aseprite, Tiled и TMX

| Format | Состояние на dev | Owner / следующий шаг |
|---|---|---|
| Aseprite JSON + PNG export | **Частично поддерживается** через Asset Pack aseprite, atlas frames и frameTags. Native layer editing/raw file import не подтверждены. | [COD-59](https://linear.app/codogma-engine/issue/COD-59/dobavit-psdaseprite-importer-extensions-cherez-obshij-asset) — общий metadata/stable ref/reimport contract и отдельный format PR. |
| PSD | **Importer/resolver не найден** в текущем source tree. Не считать PSD supported из-за поддержки Image/PNG. | COD-59 после license/provenance and fixture review. |
| Tiled JSON | **Legacy Asset Pack import path есть**, content type detection — структурная heuristic; item extracts tile layer names/tilesets and adds TILED_JSON cache data. | [COD-12](https://linear.app/codogma-engine/issue/COD-12/zakryt-defekty-asset-pack-importyorov-i-brauzernyh-api) для importer robustness; [COD-86](https://linear.app/codogma-engine/issue/COD-86/perenesti-asset-browser-asset-pack-i-sprite-authoring-v-solidjs-editor) для нового Host workflow. |
| Tiled TMX/XML | **Importer не найден** в текущем tree. Atlas XML — иной format, не TMX. | COD-12 / COD-86 после отдельного scope и реальных fixtures. |

Список Asset Pack type constants в AssetPack.ts — перечень loadable entry discriminators, **не доказательство**, что каждый тип имеет полноценный user-facing importer, preview или одинаковую browser/runtime совместимость.

## 7. Sprite Asset Metadata v1, slicing и reimport

Нормативный текущий контракт описан в [docs/sprite-asset-metadata.md](sprite-asset-metadata.md); его owner — завершённая [COD-39](https://linear.app/codogma-engine/issue/COD-39/uluchshit-sprite-editor-i-asset-authoring-workflow). Не переписывать этот contract в COD-17.

### 7.1 Схема и geometry

- Asset Pack item сохраняет metadata под codogma; её schemaVersion = 1 независим от Asset Pack meta.version = 2.
- assetId — stable ID image/spritesheet metadata; frames[frameKey].id — независимый stable frame ID.
- sourceRect — физическая область в исходном изображении/atlas texture; sourceSize — исходный untrimmed canvas; trimRect — размещение видимого frame внутри source canvas.
- pivot нормализован в диапазон 0..1; trim относится к исходному canvas; crop задан в локальных координатах packed frame; collision shapes — в координатах исходного untrimmed canvas.
- Rectangle/Circle/Polygon geometry проверяется на валидность/bounds. Render/trim geometry и physics collision shape — разные сущности.

### 7.2 Slicing

Legacy Spritesheet importer задаёт frameWidth, frameHeight, startFrame, endFrame, spacing, margin. Phaser frame parser вычисляет физические source frames; metadata снимается с фактически созданных AssetPackImageFrame, а не из предположения о линейных индексах.

Host-domain src/editor/src/domain/sprite-asset-model.ts имеет отдельный local Image/Spritesheet descriptor path и тесты на margin/spacing/start/end semantics. Он прямо не обрабатывает Atlas/Multiatlas: для них нужен отдельный importer adapter. Не смешивать Host domain function tests с доказательством работы browser importer.

### 7.3 Reimport transaction

В legacy Importer.reimportItem():

1. Проверяет совпадение importer type и единственный project-relative url.
2. Находит исходный файл в проекте; отсутствующий/нефайл — ошибка без успешной подмены source.
3. Повторно строит data из source, затем сохраняет прежние type/key/config/custom fields, заменяя source URL на вычисленный текущий.
4. Сбрасывает cache, preload/build; для Image/Spritesheet строит frame descriptors.
5. Вызывает SpriteAssetMetadata.reconcile: совместимая geometry сохраняет frame IDs/manual settings; геометрия/source canvas/trim placement изменились — старые authored settings архивируются, создаётся conflict; удалённый frame с настройками архивируется в orphaned frames.
6. При ошибке возвращает исходные item data, сбрасывает cache и пробует восстановить preload. Ошибка самого restore логируется отдельно; восстановление cache не гарантируется, если повторный preload тоже падает. После успешного importer reimport AssetPackEditor добавляет snapshot Undo operation и помечает pack dirty до refreshBlocks(). Если поздний refreshBlocks() падает, method выбрасывает ошибку, но уже изменённые item data/Undo snapshot не откатывает. UI может показать “Reimport failed” после того, как data уже обновлены; это post-commit UI refresh error, а не importer rollback.

AssetPackEditor.reimportItem_async() оборачивает operation в before/after Asset Pack snapshots, добавляет Undo/Redo operation и помечает документ dirty до обновления blocks/preview.

**Фактический user-facing reimport scope не равен общему importer API.** AssetReimportSection.canEdit() проверяет ImageAssetPackItem и SpritesheetAssetPackItem; за счёт наследования это также пропускает SvgAssetPackItem и TextureAssetPackItem. Однако Importer.reimportItem() требует string data.url: Texture хранит url object и поэтому завершается явной ошибкой. Atlas/Atlas XML/Unity Atlas/Aseprite хранят atlasURL/textureURL и не проходят общий url precondition. Multiatlas не показывается в UI, хотя его ImageFrameContainer + string url технически совместимы с прямым вызовом общего reimport path. Для COD-86 нужен явный allowlist supported item types, а не только instanceof inheritance predicate.

Frame matching — консервативная геометрическая эвристика по frame key, packed source rectangle, source size и trim placement. Она не распознаёт визуальную идентичность. Пересортировка/перенарезка кадров может требовать ручного разрешения конфликтов; конфликт не должен автоматически затираться.

### 7.4 Phaser-specific ограничения

- Asset metadata при создании Scene object копируется в соответствующие Scene object settings; уже размещённые объекты не обновляются автоматически при изменении Asset Pack metadata.
- Pivot попадает в Origin component; trim задаётся на frame clone для конкретного GameObject, а не через мутацию shared Texture Manager frame; crop применяется к поддерживаемому GameObject через setCrop().
- Phaser 4.2.1 NineSlice не поддерживает trimmed textures; NineSlice и TileSprite не предоставляют setCrop(). Для несовместимого применения требуется явная диагностика/ошибка.
- Текущий Arcade bridge автоматически мапит только одну Rectangle или Circle collision shape. Polygon не является поддержанным автоматическим Arcade Body shape.

## 8. Asset reference и path semantics: legacy → Project Model v1

| Legacy | Что означает фактически | Core v1 / требуемое решение |
|---|---|---|
| Scene id / Prefab id | Document ID; Prefab instance prefabId resolves by ID through SceneFinder. | Сохранять как explicit stable document/asset identity после проверки уникальности/валидности. |
| Node id | Object identity в Scene/Prefab; часть fixtures содержит вложенные node identities. | Core Node stable ID. Missing/duplicate IDs — diagnostic/blocker, не генерировать по label/index. |
| type | Legacy object extension discriminator, часто Phaser/editor-specific. | Не отождествлять с runtime Node/component typeId; нужен явный adapter/mapping и lossless legacy payload policy. |
| components[] class names | Legacy name-based attachment refs. | Explicit component module manifest + stable typeId + instance ID + schema version. |
| prefabId | Legacy document ID link, не source path. | Map to explicit Prefab AssetReference / Prefab identity; validate target. |
| unlock[] and component namespaced values | Legacy per-property override allowlist. | Explicit target node/component/property-path overrides; no automatic guess when property was renamed/removed. |
| Asset Pack key | Runtime cache lookup key; can collide/rename/change. | Not an Asset ID; create stable Asset ID through explicit project mapping. |
| Asset Pack url / atlasURL / textureURL etc. | Project-relative/public-relative file locator. Moving/renaming source can invalidate it. | Core AssetReference{id,path,kind,subResourceId?}; path validation and explicit path mapping. |
| Sprite metadata codogma.assetId | Stable image/spritesheet metadata ID; not available on all other Asset Pack item types. | Reuse only where proven; map other asset IDs explicitly. |
| Frame key | Asset Pack/Phaser frame lookup key; not stable identity after slicing/reimport. | Core reference includes explicit subResourceId; frame-ID mapping is required. |

Core v1 contract is in packages/cge/src/project-model/contracts.ts; validation in validation.ts enforces stable ID grammar, project-safe paths, asset kinds, optional subResourceId, and reference validation. Current Core serializer migrates Project envelope v0→v1 in memory; Scene/Prefab parsers validate v1. The full legacy .scene→Core converter is still in unmerged PR #41, not in dev.

### 8.1 Mapping dispositions

| Legacy field/family | Disposition to Project Model v1 | Risk / owner |
|---|---|---|
| Document and Node IDs | **Preserve** when present and unique; invalid/missing IDs require blocking diagnostics. | COD-25 |
| DisplayList / nested list | **Normalize** into ordered rootNodes/children, preserving exact ordering and collection context. | COD-25; real fixtures above |
| plainObjects, document lists | **Requires explicit mapping**; not equivalent to ordinary Node children and ordering relative to DisplayList is not inherently inferable. | COD-25 |
| Transform numeric values | **Preserve** finite supported values; invalid/special values block or require explicit correction; defaults must be documented. | COD-25; Core tests |
| Legacy type and renderer-specific fields | **Preserve in compatibility payload / explicit adapter** until target runtime renderer contract owns them; no generic conversion implied. | COD-25 / COD-103 |
| Legacy User Components | **Requires explicit mapping** from class name to stable module/type/schema; unsupported definitions/values must be reported. | COD-25 / COD-27 / COD-91 |
| Prefab link prefabId | **Preserve/map** only when exact target document ID is resolvable. | COD-8 / COD-25 |
| Prefab unlock, prefabProperties, nestedPrefabs | **Requires explicit semantics mapping** for instance override targets, rename/remove conflicts and nesting. Keep original payload until resolved. | COD-8 |
| Asset Pack key/URL | **Requires explicit asset index mapping**; never synthesize stable ID from key/path alone. | COD-25 / COD-86 |
| Frame key and Sprite Metadata | **Preserve/map** through explicit asset/frame ID index; use subResourceId for frame-like subresources. | COD-25 / COD-86 |
| Editor/compiler settings, scope, private_np | **Editor-only/deprecated/compatibility payload**, field-by-field classification required; do not leak into runtime config by default. | COD-25 / COD-97 |
| Unknown JSON-compatible extension fields | **Preserve** where schema contract allows; otherwise emit loss diagnostic. No silent discard. | COD-25 |

This table is a compatibility decision register, not an implementation of the mappings.

## 9. IFileStorage, HTTP API and path lifecycle

### 9.1 Storage interface

source/editor/plugins/colibri/src/core/io/IFileStorage.ts exposes:

- project lifecycle: reload(), openProject(), getRoot();
- text/binary IO: getFileString(), setFileString(), getFileBinary();
- mutations: createFile(), createFolder(), deleteFiles(), renameFile(), moveFiles(), copyFile(), uploadFile();
- image dimensions: getImageSize();
- changes: addChangeListener(), addFirstChangeListener(), removeChangeListener().

FilePath identity is hierarchical path/name, not persistent Asset ID. getProjectRelativeName() composes parent names; getUrl() builds ./project<path>?m=<modTime>. A project path is a locator and can change independently from Asset identity.

### 9.2 HTTPServerFileStorage and server API

Legacy HTTPServerFileStorage uses POST to relative api with JSON { method, body }; files are read with GET using FilePath project URL. Server dispatch in server/server.mjs includes the relevant methods below.

| Operation | Legacy method/body shape |
|---|---|
| Project tree/hash | GetProjectFiles, GetProjectFilesHash |
| Write text | SetFileString { path, content } |
| Create folder | CreateFolder { path } |
| Delete | DeleteFiles { paths } |
| Rename | RenameFile { oldPath, newPath } |
| Copy | CopyFile { fromPath, toPath } |
| Move | MoveFiles { movingPaths, movingToPath } |
| Image dimension | GetImageSize { path } |

Server route validation uses project-safe path helpers; do not replace those constraints with unchecked client path concatenation. HTTPServerFileStorage.apiRequest() converts network/JSON errors to returned {error} data; callers must inspect it. New Host callEditorApi() instead throws on HTTP failure, invalid JSON and application error.

### 9.3 Change events, moves and rename defect

- Legacy focus refresh compares file paths, modification time and size. A path that disappears and a new path that appears is reported as delete + add; refresh does not infer semantic rename from content similarity.
- Explicit renameFile() calls recordRename(fromPath,toPath) and updates the in-memory FilePath.
- **Confirmed defect:** FileStorageChange._renameFromToMap is a JavaScript Map, but recordRename() writes this._renameFromToMap[fromPath] = toPath; getRenameTo() also reads via property access, while isRenamed() uses .has(fromPath). Therefore the rename is not registered as a Map entry and isRenamed(fromPath) returns false even after recordRename(). Consumers using isRenamed can miss the event.
- Asset Pack URLs are path-based. No general storage contract was found that rewrites every Asset Pack importer URL, Prefab link, scene reference or Sprite source when a file/folder moves. Broken/moved source paths must be diagnosed by a higher-level project/asset validation layer.

**Host/backend mismatch:** src/editor/src/services/editor-api.ts renameProjectFile(relativePath,newName) sends RenameFile { path, newName }, but server/server.mjs and Colibri call the server with { oldPath, newPath }. This contract mismatch means the Host rename operation does not match the current server handler; it is recorded as a follow-up, not fixed by COD-17.

### 9.4 New SolidJS Host subset

Current src/editor/src/services/editor-api.ts exposes typed wrappers for project file tree, read, write, create folder, rename and delete. It is intentionally not a copy of all Colibri IFileStorage APIs: no public Host wrapper was found for binary read, upload, copy, move or image size. A future Host backend contract should define explicit typed operations/errors and remain independent from the legacy storage class and Workbench lifecycle.

## 10. Extension/plugin registry and Undo/Redo boundaries

### 10.1 Legacy extension points

- Colibri Extension exposes a point ID and numeric priority; ExtensionRegistry groups extensions by point and returns sorted entries.
- FileStorageExtension creates an IFileStorage; the HTTP storage provider is registered by a legacy storage extension.
- Asset Pack uses AssetPackExtension to contribute item types, item factories, importers, renderer/property providers; AssetPackPlugin registers content-type resolver extensions and editor commands.
- Asset Pack item type → extension lookup is built at plugin startup. Importer list is assembled from registered AssetPack extensions.
- These are real legacy contracts only. New Host extension lifecycle/permission/trust contract is tracked separately in [COD-53](https://linear.app/codogma-engine/issue/COD-53/realizovat-editor-extension-lifecycle-i-registraciyu-rasshirenij), and package metadata/trust in COD-51/52/ADR-0003. Do not port Colibri registry/private hooks into SolidJS.

### 10.2 Undo/Redo

- Legacy Operation defines synchronous undo() and redo(); execute() may be async.
- UndoManager.add() pushes operation and clears redo before awaiting execute(); undo()/redo() synchronously move operations between stacks.
- Scene editors provide snapshot and specialized operations. Asset Pack delete/import/reimport capture before/after snapshot operations.
- Importer failure rollback removes newly created entries and resets caches; reimport restores previous entry data/cache on error.
- Operations are editor-session state, not a persisted event log or part of Scene/Asset Pack JSON. The checked-in SolidJS Host domain functions are immutable/pure transformations with tests; a unified Host undo journal covering Scene/Prefab/Asset metadata and backend persistence was not found in the inspected files.
- Operation-stack behavior on asynchronous execute() rejection needs explicit error/stack policy before using this abstraction as a future service contract; current add() pushes before awaiting.
- New Project Model/Core v1 does not own editor Undo/Redo. Prefab semantics belong to COD-8; asset authoring integration to COD-86; generic extension hooks to COD-53.

## 11. Current SolidJS Host vs legacy coverage

| Area | Current dev evidence | What is not proven / owner |
|---|---|---|
| Scene model | src/editor/src/domain/scene-model.ts reads/writes legacy .scene shape; tests cover parse/format, unknown fields, IDs, hierarchy operations and supported Image/Text/Container creation. | Not the Core Project Model v1 serializer or runtime Scene Loader; full user workflow is not accepted here. |
| Prefab model | prefab-model.ts creates legacy-compatible sceneType: PREFAB document, instance prefabId, simple typed prefabProperties and default/override resolution. | Does not establish nested propagation, source-update merge, rename/delete conflict policy, durable save/reopen or integrated Undo/Redo; COD-8. |
| Sprite metadata | sprite-asset-model.ts models Image/Spritesheet, metadata, slicing, collision validation and reconcile; unit tests exist. | Atlas/Multiatlas importer adapter and browser import/preview/reimport workflow are not covered by this domain module; COD-86/COD-55. |
| Core Project Model | packages/cge/src/project-model/* exposes v1 Project/Scene/Prefab validation and deterministic serialization; Project v0→v1 in-memory migration. | Current dev has no integrated legacy .scene/.components/Asset Pack conversion; PR41 remains unmerged; COD-25. |
| Storage | Host API has typed tree/read/write/folder/rename/delete wrappers. | Rename body mismatch; incomplete file operation coverage; COD-12/COD-86. |
| Runtime bridge | Separate packages and adapter tasks own runtime behavior. | Host domain parsing and a green unit suite do not establish generated Phaser runtime or browser acceptance; COD-103/COD-28/CODQA work. |

## 12. Compatibility risks and owner routing

| Risk / observed behavior | Evidence | Owner / disposition |
|---|---|---|
| Missing/duplicate document or Node IDs; no safe inference from filename/index | 27 real Scene/Prefab fixtures; Core stable ID validator/tests | [COD-25](https://linear.app/codogma-engine/issue/COD-25/opredelit-serializuemuyu-project-model-i-versioned-schema): blocking diagnostics, explicit mapping and fixtures. |
| Legacy class names have no stable component type/instance IDs | two .components fixtures; Scene components[]; Core ComponentInstance contract | COD-25 / COD-27 / COD-91: explicit manifest mapping, preserve unknown classes/values, no name guessing. |
| Prefab nested data, overrides, property removal/rename and source propagation do not map 1:1 to Core overrides | Prefab/nested fixtures; legacy prefabId, unlock, nestedPrefabs, prefabProperties; COD-8 criteria | [COD-8](https://linear.app/codogma-engine/issue/COD-8/stabilizirovat-prefab-workflow-vlozhennost-overrides-i-obnovlenie): policy + regression tests; do not infer semantics in COD-17. |
| displayList, plainObjects, document lists, Node list, nestedPrefabs have different collection meanings | ISceneData/IObjectData/SceneWriter and fixtures | COD-25: explicit field-by-field mapping, collection/order preservation. |
| Legacy Asset Pack key/URL not stable identity; metadata IDs exist only on certain image/spritesheet entries | AssetPack v2 + Sprite Metadata v1 | COD-25 / COD-86: explicit asset index and subResource ID mapping. |
| Atlas/Multiatlas metadata/reimport and authoring adapters incomplete; PSD absent; Aseprite limited; TMX absent | importer list/resolvers, reimport section, source tree | COD-86 base workflow; COD-55 atlas analysis; COD-59 PSD/Aseprite; COD-12 importer robustness. |
| Tiled JSON heuristic fails to validate tileheight type/presence; TMX importer absent | TilemapTiledJSONContentTypeResolver.ts, importer registry | COD-12 / COD-86: add parser fixtures/negative cases before claiming robust Tiled support. |
| Legacy AssetPack serializer normalizes all sections to section1 and emits narrow meta | AssetPack.fromJSON() / toJSON() | COD-25 / COD-86: decide which vendor/root fields are contractually preserved; round-trip fixtures. |
| File rename event map does not register Map entries | FileStorageChange.recordRename() / isRenamed() | Minimal regression: recordRename("assets/a.png","assets/b.png"); assert isRenamed(old) === true and getRenameTo(old) === new; current Map property assignment fails. No automated Colibri test exists in inspected tree | COD-12: fix/test Map semantics and consumers. |
| Host rename body does not match backend parameter names | editor-api.ts vs server.mjs / Colibri server_renameFile() | COD-12 / COD-86: align a typed Host API request contract; add contract/integration test. |
| Texture AssetPackItem is shown by Image-based reimport eligibility despite url being an object, while generic reimport requires a string | AssetReimportSection.canEdit() ImageAssetPackItem inheritance; TextureAssetPackItem.getUrl() reads url.IMG; Importer.reimportItem() rejects non-string previousData.url | Reproduction: add type=texture entry with url:{IMG:"assets/dino.png"}, invoke AssetPackEditor.reimportItem_async(); current importer throws “Reimport requires a single project-relative source URL.” Assert UI does not offer unsupported action or importer handles IMG source without data loss. No regression test exists yet | COD-12: align reimport eligibility and data contract; COD-86 must use explicit supported type allowlist. |
| Asset paths may become stale after moves/deletes; automatic reference rewrites were not found | AssetPack URLs + FileStorageChange path events | COD-12 / COD-25 / COD-86: path/reference validator with explicit repair; never silent fallback. |
| Colibri extension registry is tightly coupled to Platform/Workbench | legacy extension code; COD-53 requirements | COD-53: independent versioned Host Extension API; no legacy registry port. |
| Undo/Redo is UI operation stack, not persisted transaction log; async execute error stack policy unclear | Operation/UndoManager + snapshot operations | COD-8 / COD-86: Host-owned undo transaction semantics; do not couple Core persistence to Colibri manager. |
| Sprite metadata frame reconciliation is geometry heuristic, not visual identity | SpriteAssetMetadata.reconcile() and docs/sprite-asset-metadata.md | COD-39 contract retained; COD-86 workflow must surface conflicts; no silent remapping. |

## 13. Automated evidence and outstanding verification

| Evidence | Current status | Scope limitation |
|---|---|---|
| 27 actual .scene files, 2 .components files, Asset Pack v2 fixture | **Fixture: verified present on dev** | One checked-in test workspace, not a representative census of all user projects. |
| Legacy Scene model domain tests | **Automated: present** in src/editor/tests/scene-model.test.ts | Tests SolidJS domain helpers, not Colibri serialization/editor round-trip on browser. |
| Legacy Prefab domain tests | **Automated: present** in src/editor/tests/prefab-model.test.ts | Basic document/instance/property values; not propagation/merge/undo/reopen. |
| Sprite Asset domain tests | **Automated: present** in src/editor/tests/sprite-asset-model.test.ts | Host-domain metadata/slicing/reconcile; not exhaustive Colibri importer/browser integration. |
| Core Project Model tests | **Automated: present** in packages/cge/tests/project-model.test.ts | Project v0/v1 + current Scene/Prefab v1 validation; legacy scene migration tests remain in unmerged PR41. |
| Legacy Colibri importer integration tests | **Gap in inspected test tree** | Do not equate Host domain tests with actual legacy importers; COD-12/COD-86. |
| Real browser import/reimport, large directories, multiple DirectoryReader batches, media/font codecs and GPU/browser matrix | **External QA / not run in COD-17** | CODQA-10 and COD-12 on integrated candidate. |
| Generated Phaser game compatibility for migrated assets/scene/prefab data | **Not established by this inventory** | COD-103/COD-28 and relevant QA. |
| Save/reopen + rename/move/deleted source + stale reference behavior across a complete project | **Partially traced, integration evidence missing** | COD-8/COD-12/COD-25/COD-86. |

### Checks actually performed for this inventory

- Read current repository instructions AGENTS.md / CLAUDE.md, root README, relevant docs, Skills registry/lock, and applicable code paths.
- Compared the live GitHub dev branch/tree SHA with the legacy Scene/Prefab/AssetPack/Storage/API/Undo/Core/Host source paths and tests.
- Verified each of the 27 fixture paths plus both .components files and Asset Pack v2 fixture exist in the current dev tree.
- Traced every importer route registered by DefaultAssetPackExtension.createImporters() to its source content-type detection, createItemData(), AssetPack item type and shared Importer transaction/reimport implementation; added the per-format metadata/reimport/fixture matrix above.
- Verified the current workspace contains no dedicated source fixtures for atlas/spritesheet/Aseprite/PSD/Tiled/TMX/audio/video/font/Spine/compressed-texture importer routes; dino.png is the only Asset Pack source image.
- Verified exact automated test names for Core path/reference validation, Sprite Host-domain metadata/reimport behavior and server path-security/symlink/race handling; no legacy Colibri importer integration test suite was found in the inspected tree.
- Re-read the updated Linear COD-17 acceptance criteria (updatedAt 2026-11-05T10:49:48.899Z) and its current discussion comment; the updated criteria explicitly require per-importer recognition/data/metadata/reimport/error/rollback/fixture evidence.
- Inspected issue COD-17 and related owners COD-8, COD-12, COD-25, COD-27, COD-39, COD-53, COD-55, COD-59, COD-86, COD-91 and COD-105; COD-17 now has a scope-confirmation discussion comment by the issue owner.
- No local checkout/shell was available through the permitted tool path in this run. No local typecheck, tests, build, browser run or independent QA is claimed. PR CI is the verification gate for this Markdown-only change.

## 14. Decision summary

1. **Retain as compatibility evidence:** exact legacy Scene/Prefab fields, serializer behavior, actual fixtures, Asset Pack v2 entry shapes, importer-specific URL/config, Sprite Metadata v1 and source reimport behavior.
2. **Redesign for Host/Core:** explicit typed services and versioned model contracts for project files, asset IDs/references, importer extensions, diagnostics and Undo/Redo. New Host APIs must not inherit Colibri globals or private extension lifecycle.
3. **Defer to owners:** Prefab propagation/override semantics (COD-8), Project Model and mapping (COD-25), Component Schema mapping (COD-27), generic asset/API defects (COD-12), Asset Browser/authoring migration (COD-86), atlas analyzer (COD-55), PSD/Aseprite format extensions (COD-59), Host extension lifecycle (COD-53).
4. **Do not claim:** complete compatibility for arbitrary external projects, native PSD/Aseprite/TMX support, Atlas reimport, automatic path rewrite, end-to-end browser/runtime acceptance, or full legacy-to-Core conversion in current dev.

COD-17 covers the inventory, observed compatibility policy and follow-up ownership map. It does not implement importer extensions, new serializers/migrations, Editor UI or runtime integrations. Every registered legacy importer route is listed with source recognition, entry data, metadata/reimport behavior and exact fixture availability; shared error/rollback rules and the known Texture reimport mismatch are stated separately. No external-format browser/runtime support is claimed without a source fixture and acceptance. The open/draft legacy migration PR #41 is supplemental COD-25 work and is not a dependency for completing this inventory. COD-12 owns legacy importer/storage defects, COD-8 Prefab semantics, COD-25 Project Model mapping, COD-55 atlas analysis, COD-59 new PSD/Aseprite extensions and COD-86 new Host authoring workflows. COD-17 can move to Done after this inventory PR is reviewed and merged; those implementation tasks proceed independently under their owners.

## 15. Source index

All source links below refer to the inspected dev branch unless the row explicitly says PR #41:

- [Legacy scene contracts](https://github.com/AiratGaliev/codogma-engine/tree/dev/source/editor/plugins/phasereditor2d.scene/src/core/json)
- [Scene serialization and migrations](https://github.com/AiratGaliev/codogma-engine/tree/dev/source/editor/plugins/phasereditor2d.scene/src/core/migrations)
- [Scene fixtures](https://github.com/AiratGaliev/codogma-engine/tree/dev/tests/workspace/test-typescript/scenes)
- [Component fixtures](https://github.com/AiratGaliev/codogma-engine/tree/dev/tests/workspace/test-typescript/components)
- [Asset Pack fixture](https://github.com/AiratGaliev/codogma-engine/blob/dev/tests/workspace/test-typescript/assets/asset-pack.json)
- [Asset Pack implementation/importers](https://github.com/AiratGaliev/codogma-engine/tree/dev/source/editor/plugins/phasereditor2d.pack/src)
- [Importer transaction implementation](https://github.com/AiratGaliev/codogma-engine/tree/dev/source/editor/plugins/phasereditor2d.pack/src/ui/importers)
- [Sprite Metadata v1 contract](sprite-asset-metadata.md)
- [Colibri storage contracts](https://github.com/AiratGaliev/codogma-engine/tree/dev/source/editor/plugins/colibri/src/core/io)
- [Legacy Undo/Redo](https://github.com/AiratGaliev/codogma-engine/tree/dev/source/editor/plugins/colibri/src/ui/ide/undo)
- [HTTP server API](https://github.com/AiratGaliev/codogma-engine/blob/dev/server/server.mjs)
- [SolidJS Host domain](https://github.com/AiratGaliev/codogma-engine/tree/dev/src/editor/src/domain)
- [SolidJS Host API](https://github.com/AiratGaliev/codogma-engine/blob/dev/src/editor/src/services/editor-api.ts)
- [Core Project Model contracts](https://github.com/AiratGaliev/codogma-engine/tree/dev/packages/cge/src/project-model)
- [Core Project Model tests](https://github.com/AiratGaliev/codogma-engine/blob/dev/packages/cge/tests/project-model.test.ts)
- [COD-17](https://linear.app/codogma-engine/issue/COD-17/inventarizirovat-formaty-scenprefabassetov-i-kontrakty-importyorov)
- [COD-25 migration PR #41 — open/draft, not integrated](https://github.com/AiratGaliev/codogma-engine/pull/41)
