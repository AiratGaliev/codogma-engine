# Значки Colibri: источник и лицензия

Базовые значки интерфейса Colibri в Codogma Engine взяты из набора **Godot Editor Icons**.

- Репозиторий: https://github.com/godotengine/godot/tree/c8256a8ecec068340753869e423dd478c84ef167/editor/icons
- Зафиксированный commit Godot: `c8256a8ecec068340753869e423dd478c84ef167`
- Лицензия: MIT; полный текст уведомления сохранён в `GODOT-MIT-LICENSE.txt`.

## Карта значков

| Имя в Colibri | Исходник |
|---|---|
| `checked.svg` | [`GuiChecked.svg`](https://github.com/godotengine/godot/blob/c8256a8ecec068340753869e423dd478c84ef167/editor/icons/GuiChecked.svg) |
| `close.svg` | [`Close.svg`](https://github.com/godotengine/godot/blob/c8256a8ecec068340753869e423dd478c84ef167/editor/icons/Close.svg) |
| `color.svg` | [`ColorPicker.svg`](https://github.com/godotengine/godot/blob/c8256a8ecec068340753869e423dd478c84ef167/editor/icons/ColorPicker.svg) |
| `delete.svg` | [`Remove.svg`](https://github.com/godotengine/godot/blob/c8256a8ecec068340753869e423dd478c84ef167/editor/icons/Remove.svg) |
| `dirty.svg` | [`StatusWarning.svg`](https://github.com/godotengine/godot/blob/c8256a8ecec068340753869e423dd478c84ef167/editor/icons/StatusWarning.svg) |
| `file.svg` | [`File.svg`](https://github.com/godotengine/godot/blob/c8256a8ecec068340753869e423dd478c84ef167/editor/icons/File.svg) |
| `folder.svg` | [`Folder.svg`](https://github.com/godotengine/godot/blob/c8256a8ecec068340753869e423dd478c84ef167/editor/icons/Folder.svg) |
| `inspector.svg` | [`EditorInspector.svg`](https://github.com/godotengine/godot/blob/c8256a8ecec068340753869e423dd478c84ef167/editor/icons/EditorInspector.svg) |
| `keymap.svg` | [`InputEventKey.svg`](https://github.com/godotengine/godot/blob/c8256a8ecec068340753869e423dd478c84ef167/editor/icons/InputEventKey.svg) |
| `menu.svg` | [`PopupMenu.svg`](https://github.com/godotengine/godot/blob/c8256a8ecec068340753869e423dd478c84ef167/editor/icons/PopupMenu.svg) |
| `minus.svg` | Производный знак минуса на основе геометрии Godot `Add.svg` |
| `plus.svg` | [`Add.svg`](https://github.com/godotengine/godot/blob/c8256a8ecec068340753869e423dd478c84ef167/editor/icons/Add.svg) |
| `section-collapse-left.svg` | [`ArrowLeft.svg`](https://github.com/godotengine/godot/blob/c8256a8ecec068340753869e423dd478c84ef167/editor/icons/ArrowLeft.svg) |
| `section-collapse.svg` | [`Collapse.svg`](https://github.com/godotengine/godot/blob/c8256a8ecec068340753869e423dd478c84ef167/editor/icons/Collapse.svg) |
| `section-expand.svg` | [`ArrowRight.svg`](https://github.com/godotengine/godot/blob/c8256a8ecec068340753869e423dd478c84ef167/editor/icons/ArrowRight.svg) |
| `small-menu.svg` | [`GuiTabMenu.svg`](https://github.com/godotengine/godot/blob/c8256a8ecec068340753869e423dd478c84ef167/editor/icons/GuiTabMenu.svg) |
| `tree-collapse-left.svg` | [`GuiTreeArrowLeft.svg`](https://github.com/godotengine/godot/blob/c8256a8ecec068340753869e423dd478c84ef167/editor/icons/GuiTreeArrowLeft.svg) |
| `tree-collapse.svg` | [`GuiTreeArrowDown.svg`](https://github.com/godotengine/godot/blob/c8256a8ecec068340753869e423dd478c84ef167/editor/icons/GuiTreeArrowDown.svg) |
| `tree-expand-left.svg` | [`GuiTreeArrowRight.svg`](https://github.com/godotengine/godot/blob/c8256a8ecec068340753869e423dd478c84ef167/editor/icons/GuiTreeArrowRight.svg) |
| `tree-expand.svg` | [`GuiTreeArrowRight.svg`](https://github.com/godotengine/godot/blob/c8256a8ecec068340753869e423dd478c84ef167/editor/icons/GuiTreeArrowRight.svg) |
| `zoom-reset.svg` | [`ViewportZoom.svg`](https://github.com/godotengine/godot/blob/c8256a8ecec068340753869e423dd478c84ef167/editor/icons/ViewportZoom.svg) |
| `zoom_in.svg` | [`Add.svg`](https://github.com/godotengine/godot/blob/c8256a8ecec068340753869e423dd478c84ef167/editor/icons/Add.svg) |
| `zoom_out.svg` | Производный знак минуса на основе геометрии Godot `Add.svg` |

## Адаптации

- Каталоги `dark/` и `light/` содержат варианты для тем редактора.
- В вариантах `light/` нейтральный цвет Godot `#e0e0e0` заменён на `#4a4a4a`; светлые стрелки также перекрашены для контраста на светлом фоне.
- Имена, используемые существующим кодом Colibri, сохранены.
- `minus.svg` и `zoom_out.svg` — простой знак минуса, выполненный в геометрии и размере Godot `Add.svg`, поскольку в наборе нет отдельного общего значка минуса.
- Исходные PNG-атласы оставлены в репозитории для совместимости с прежними инструментами; плагин Colibri теперь загружает SVG. Другие плагины сохраняют поведение по умолчанию.

Значки являются графическими ресурсами, лицензируемыми отдельно от изменений кода Codogma Engine. При распространении включайте уведомление MIT из `GODOT-MIT-LICENSE.txt`.
