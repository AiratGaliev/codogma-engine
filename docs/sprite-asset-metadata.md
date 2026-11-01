# Sprite asset metadata и reimport contract

## Назначение

Документ описывает UI-independent, versioned metadata для изображений и кадров spritesheet. Контракт первоначально был реализован и использован через legacy Asset Pack Editor (COD-39), но его owner — project Asset Pack data, а не Colibri UI. Метаданные хранят авторские настройки рядом с Asset Pack entry, сериализуются вместе с проектом и доступны importer services, Inspector/Scene authoring и новому SolidJS Host (интеграция Host workflow — COD-86).

Источник истины для engineering-реализации — поле `codogma` внутри JSON каждого поддерживаемого Asset Pack item. Временный `AssetPackItem.getEditorData()` для этого не используется: он не входит в `AssetPack.toJSON()`.

## Формат v1

Каждый image/spritesheet item может содержать:

```json
{
  "codogma": {
    "schemaVersion": 1,
    "assetId": "stable-uuid",
    "source": {
      "url": "images/hero.png",
      "size": 4096,
      "modifiedAt": 1730000000000,
      "signature": "f3a1c902"
    },
    "importSettingsFingerprint": "a7b42d10",
    "frames": {
      "0": {
        "id": "stable-frame-uuid",
        "sourceRect": { "x": 64, "y": 96, "width": 20, "height": 30 },
        "sourceSize": { "width": 40, "height": 48 },
        "trimRect": { "x": 5, "y": 7, "width": 20, "height": 30 },
        "pivot": { "x": 0.5, "y": 1 },
        "trim": { "x": 4, "y": 2, "width": 24, "height": 28 },
        "crop": { "x": 2, "y": 2, "width": 20, "height": 24 },
        "collisionShapes": [
          { "type": "rectangle", "x": 5, "y": 4, "width": 20, "height": 24 }
        ]
      }
    },
    "orphanedFrames": [],
    "conflicts": []
  }
}
```

Фактические необязательные поля frame metadata могут отсутствовать, пока пользователь их не настроил. Неизвестные поля сохраняются при миграции и повторной сериализации.

- `schemaVersion` — версия схемы metadata, не версия всего Asset Pack.
- `assetId` — стабильный ID ресурса.
- `frames[frameKey].id` — стабильный ID кадра при сохранении его source rectangle.
- `sourceRect` — физический packed-прямоугольник кадра в source image/atlas texture.
- `sourceSize` — размер исходного, не обрезанного canvas спрайта.
- `trimRect` — размещение видимого packed-прямоугольника внутри исходного canvas (эквивалент `spriteSourceSize`).
- `pivot` — нормализованные координаты от 0 до 1.
- `trim` — редактируемый прямоугольник размещения внутри `sourceSize`; при применении его исходные размеры берутся из `sourceSize`.
- `crop` — прямоугольник в локальных пикселях packed frame.
- `collisionShapes` — авторская геометрия в координатах кадра.
- `orphanedFrames` — настройки кадров, для которых после reimport не найдено совместимого продолжения.
- `conflicts` — диагностические записи, которые не удаляются автоматически.

## Координаты и collision shapes

Collision geometry задаётся в координатах исходного, не обрезанного canvas (`sourceSize`), от его левого верхнего угла. Для обычных изображений эти координаты совпадают с пикселями изображения; для atlas frames они учитывают смещение `trimRect`.

- Rectangle: `x`, `y` — левый верхний угол; `width` и `height` положительные, прямоугольник целиком помещается в `sourceSize`.
- Circle: `x`, `y` — центр; `radius` положительный, круг целиком помещается в `sourceSize`.
- Polygon: не менее трёх точек; каждая точка — пара чисел `[x, y]` или объект `{ "x": ..., "y": ... }` внутри `sourceSize`.

Render/trim data и physics collision data — разные сущности. Контур видимых пикселей сам по себе не становится физической формой.

## Import и reimport

Single-file и batch import используют существующие Importer-ы. Для image-frame items после успешной загрузки создаётся metadata v1 с asset/frame IDs и source description. Ошибка batch import откатывает уже добавленные в Asset Pack entries.

`Reimport Source` доступен для Image и Spritesheet items. Операция:

1. Читает текущий project-relative source URL; отсутствующий source завершает операцию ошибкой без изменения entry.
2. Повторно загружает source и производные frame descriptors с прежними Asset Pack key и import settings.
3. Сопоставляет кадры по frame key, packed source rectangle, original source size и trim placement.
4. Сохраняет authored metadata, если все доступные геометрические поля остались совместимыми.
5. Если изменился packed rect, исходный canvas или trim placement, создаёт новый frame ID, архивирует старую authored metadata и добавляет конфликт.
6. Если кадр исчез, переносит пользовательские настройки в orphanedFrames и добавляет конфликт.
7. При ошибке восстанавливает исходный item data и кэш. Успешная операция добавляет одно Undo/Redo действие.

Сопоставление по frame key + packed source rectangle + source size + trim placement — консервативная геометрическая эвристика, а не распознавание визуальной идентичности содержимого. Перестановка/перенарезка кадров может потребовать ручной проверки конфликтов. Повторный импорт не удаляет конфликтующие данные молча.

`source.signature` — быстрая детерминированная подпись URL, размера и modification time. Это **не криптографический hash содержимого файла** и не доказательство идентичности пикселей. Она используется для диагностики изменений source, а не как единственная гарантия безопасности или frame identity.

## Scene и runtime bridge

При создании Scene object из Asset Pack frame:
- pivot копируется в объектный `OriginComponent`, поэтому он сохраняется в scene model и участвует в code generation;
- trim передаётся через `TextureComponent` в клон Phaser `Frame` для конкретного GameObject через `Frame.setTrim()` и `setFrame()`; общий Texture Manager frame не мутируется;
- crop передаётся в `TextureComponent` и Phaser `GameObject.setCrop()`;
- Phaser 4.2.1 `NineSlice` не поддерживает trimmed textures; `NineSlice` и `TileSprite` не предоставляют `setCrop()`. Inspector предупреждает об этих ограничениях, а попытка применить неподдерживаемые настройки завершается явной ошибкой, а не молчаливой потерей данных;
- collision shapes и `sourceSize` копируются в scene texture reference. При первом включении Arcade Body одна rectangle или circle задаёт начальные Body size/offset в исходном canvas coordinate space. После этого scene-level Body settings являются пользовательским override и не перезаписываются при последующей смене texture.

Asset-level pivot/crop/trim/collision metadata копируется в scene object при размещении кадра. Уже размещённые объекты сохраняют собственные scene settings и не переписываются при каждом изменении asset metadata; пользователь может обновить texture reference/объект осознанно.

Текущие пределы physics adapter:
- Phaser Arcade автоматически получает только одну rectangle или circle.
- Polygon и compound shapes сохраняются и валидируются, но не преобразуются в ложный bounding box и не считаются автоматически поддержанными Arcade runtime.
- Для polygon/compound нужна совместимая physics adapter integration и отдельная runtime acceptance. До неё данные остаются в asset/scene metadata.

9-slice и tiled draw mode уже являются Scene Editor workflows для Phaser NineSlice/TileSprite и не дублируются в asset-frame schema. Существующие Phaser `Layer` groups сохраняют порядок по depth-first display-list hierarchy. Именованные Sorting Layers, независимый `sortingOrder` и Y-based ordering ещё не реализованы и принадлежат общему 2D render-order контракту COD-41; не следует трактовать обычный Layer как полноценную систему Sorting Layers.

## Проверки и acceptance

Automated tests:
- metadata IDs, schema migration и сохранение неизвестных полей;
- Asset Pack JSON serialization round-trip;
- slicing и frame lookup (включая margin/spacing и границы);
- reimport preserving, conflict archival и rollback;
- shape validation, bounds и поддерживаемые Arcade rectangle/circle mappings;
- TextureComponent crop/trim application и Phaser code generation.

Функциональная проверка полного workflow в реальном браузере и generated game выполняется отдельно в [CODQA-10](https://linear.app/codogma-engine/issue/CODQA-10/provesti-funkcionalnuyu-priyomku-sprite-editor-i-asset-authoring). CI, unit tests и typecheck не заменяют эту проверку.
