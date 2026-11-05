# Asset Pack и Browser API — compatibility evidence

Документ фиксирует проверяемые контракты Asset Pack и границы доказательств. Он не расширяет перечень поддерживаемых браузеров или игровых форматов.

## Автоматизированные регрессии COD-12

| Область | Зафиксированное поведение | Что именно проверяет тест | Что этим не доказано |
|---|---|---|---|
| File storage rename map | FileStorageChange записывает/читает rename через Map.set/get/has и хранит from/to records | tests/editor-data-preview.test.mjs использует реальный скомпилированный класс | Полный Workbench/editor rename lifecycle и синхронизация всех open editors |
| SolidJS Host Rename | Host формирует RenameFile { oldPath, newPath }; оба пути остаются project-relative, target — соседний filename | src/editor/tests/editor-api.test.ts проверяет реальный Host service request body; tests/security-smoke-test.mjs вызывает HTTP handler сервера с тем же DTO и проверяет rename/traversal rejection | Интерактивный browser acceptance Host Explorer/Assets UI |
| Tiled JSON | layers и tilesets должны быть массивами; tilewidth и tileheight — положительными safe integers | Валидный fixture, отсутствующие/string/zero/negative/fractional поля, неверные типы, null, array и malformed JSON | Полная версия спецификации Tiled, TMX/XML import или generated game runtime |
| Texture reimport | Исходник берётся из url.IMG; обновление IMG не удаляет ETC/ASTC/PVR и неизвестные URL variants | Реальный TextureImporter.reimportItem() и TextureAssetPackItem проходят в bundle regression test с test source | Декодирование/загрузка конкретного GPU texture format и поддержка его браузером |
| Font loading | Отсутствующий source/API и неудачный FontFace.load() записывают item-level diagnostic и логируются; ошибка не прерывает открытие всего Asset Pack. Успешный face кешируется, очищает предыдущую ошибку и удаляется при resetCache(); следующий preload повторяет неуспешную загрузку | FontFace/FontFaceSet stub проверяет error → retry → success → cleanup | Реальная загрузка каждого TTF/OTF/WOFF/WOFF2/EOT файла и browser-specific font rendering |
| DirectoryReader | Обход продолжает readEntries() до пустого batch; ошибка отдельного файла не удаляет успешных siblings | Несколько batches и ошибочный дочерний FileEntry в tests/editor-data-preview.test.mjs | Поведение настоящего browser picker/drag-and-drop на разных OS/browser implementations |
| FileList upload | Ошибка одного файла не прекращает следующие upload; неуспешный файл остаётся в очереди, успешные не загружаются повторно при retry | UploadDialog regression test проверяет partial success, очередь повторной попытки и закрытие после успеха | UX/keyboard/accessibility acceptance в реальном браузере |
| Audio/video preview | Сохраняется разбор поддерживаемых Phaser URL форм; скрытие preview удаляет src и вызывает load() | URL model regression tests и lifecycle contract текущих preview sections | Codec support, autoplay policy, memory release на каждой целевой платформе и stop/close всей Editor session |

## Browser, codec и GPU matrix

На текущем этапе проекта нормативная target browser/WebView matrix ещё не утверждена. docs/technical-specification.md требует определить поддерживаемые browsers/WebViews, минимальные версии и устройства до production release. Поэтому:

- Не объявлять Chrome, Edge, Firefox, Safari, Yandex Browser или встроенные WebView поддерживаемыми на основании только Chromium/unit tests.
- Не считать расширение, MIME type, content-type resolver или наличие URL достаточным доказательством декодирования и preview/runtime support.
- CompressedTextureVariants (webp, avif, ktx2, pvr, dds) хранит optional editor/export metadata. Само поле не реализует runtime transcoding, GPU upload или выбор формата по capabilities.
- Texture URL variants (IMG, ETC, ETC1, ASTC, BPTC, PVRTC, S3TC и другие) сохраняются как данные Asset Pack. Сохранение URL не означает, что текущий Phaser loader/editor preview умеет декодировать соответствующий container/format.
- FontFace stub tests проверяют наш error/cache contract, но не заменяют реальные font fixtures. Audio/video URL tests не подтверждают codec decode или autoplay.
- Legacy AudioPreviewSection и VideoPreviewSection освобождают активный media source при скрытии секции (removeAttribute("src") + load()). Отдельный browser memory/decoder acceptance при смене проекта, закрытии editor и завершении browser session ещё нужен.

## Следующая browser acceptance

После утверждения конкретной browser/WebView matrix подготовить реальные небольшие fixtures с корректным происхождением/лицензией и проверить по каждому target:

1. FontFace load/error/retry и повторный reimport одного и того же font key; отсутствие оставшихся FontFace после сброса/переключения asset.
2. Drag/drop каталога с числом файлов, достаточным для нескольких DirectoryReader.readEntries() batches; вложенность, частичная ошибка, отмена и повторная загрузка.
3. Texture decode/preview для каждого заявленного container/GPU family с feature detection и явным fallback; отдельно фиксировать unsupported formats.
4. Audio/video load, play() rejection до user gesture, смену selection, скрытие preview, reimport и освобождение decoder/network ресурса.
5. Save/reopen Asset Pack, missing/invalid source URL и отсутствие потери custom fields/URL variants после reimport.

Результат acceptance должен фиксировать точные browser/version/OS/device/GPU/driver, fixture hashes, шаги, console/network errors и скриншоты/логи. До выполнения этих проверок browser/GPU compatibility остаётся unverified.
