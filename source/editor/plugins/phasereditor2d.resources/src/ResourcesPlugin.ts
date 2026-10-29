namespace phasereditor2d.resources {

    // phasereditor2d.blocks
    export const ICON_BLOCKS = "blocks";
    // phasereditor2d.blocks
    export const ICON_PLAY = "play";
    // phasereditor2d.outline
    export const ICON_OUTLINE = "outline";
    // phasereditor2d.blocks
    export const ICON_ASSET_PACK = "asset-pack";
    export const ICON_ANIMATIONS = "animations";
    export const ICON_ASEPRITE = "aseprite";
    export const ICON_TILEMAP = "tilemap";
    export const ICON_TILEMAP_LAYER = "tilemap-layer";
    export const ICON_SPINE = "spine";
    // phasereditor2d.files
    export const ICON_NEW_FILE = "file-new";
    export const ICON_PROJECT = "project";
    // phasereditor2d.scene
    export const ICON_GROUP = "group";
    export const ICON_TRANSLATE = "translate";
    export const ICON_ANGLE = "angle";
    export const ICON_SCALE = "scale";
    export const ICON_ORIGIN = "origin";
    export const ICON_SELECT_REGION = "select-region";
    export const ICON_BUILD = "build";
    export const ICON_LOCKED = "locked";
    export const ICON_UNLOCKED = "unlocked";
    export const ICON_LIST = "list";
    export const ICON_USER_COMPONENT = "user-component";
    export const ICON_USER_PROPERTY = "dot";
    export const ICON_IMAGE_TYPE = "image-type";
    export const ICON_SPRITE_TYPE = "sprite-type";
    export const ICON_TILESPRITE_TYPE = "tilesprite";
    export const ICON_TEXT_TYPE = "text-type";
    export const ICON_BITMAP_FONT_TYPE = "bitmapfont-type";
    export const ICON_LAYER = "layer";
    export const ICON_ALIGN_LEFT = "align-left";
    export const ICON_ALIGN_CENTER = "align-center";
    export const ICON_ALIGN_RIGHT = "align-right";
    export const ICON_ALIGN_TOP = "align-top";
    export const ICON_ALIGN_MIDDLE = "align-middle";
    export const ICON_ALIGN_BOTTOM = "align-bottom";
    export const ICON_BORDER_LEFT = "border-left";
    export const ICON_BORDER_CENTER = "border-center";
    export const ICON_BORDER_RIGHT = "border-right";
    export const ICON_BORDER_TOP = "border-top";
    export const ICON_BORDER_MIDDLE = "border-middle";
    export const ICON_BORDER_BOTTOM = "border-bottom";
    export const ICON_GRID = "grid";
    export const ICON_COLUMN = "column";
    export const ICON_ROW = "row";
    export const ICON_ORIGIN_TOP_LEFT = "origin-topleft";
    export const ICON_ORIGIN_TOP_CENTER = "origin-topcenter";
    export const ICON_ORIGIN_TOP_RIGHT = "origin-topright";
    export const ICON_ORIGIN_MIDDLE_LEFT = "origin-middleleft";
    export const ICON_ORIGIN_MIDDLE_CENTER = "origin-middlecenter";
    export const ICON_ORIGIN_MIDDLE_RIGHT = "origin-middleright";
    export const ICON_ORIGIN_BOTTOM_LEFT = "origin-bottomleft";
    export const ICON_ORIGIN_BOTTOM_CENTER = "origin-bottomcenter";
    export const ICON_ORIGIN_BOTTOM_RIGHT = "origin-bottomright";
    export const ICON_ARCADE_COLLIDER = "collider";
    export const ICON_KEYBOARD_KEY = "keyboard-key";
    export const ICON_9_SLICE = "9slice";
    export const ICON_3_SLICE = "3slice";
    export const ICON_FX = "fx";
    // phasereditor2d.webContentTypes
    export const ICON_FILE_FONT = "file-font";
    export const ICON_FILE_IMAGE = "file-image";
    export const ICON_FILE_VIDEO = "file-movie";
    export const ICON_FILE_SCRIPT = "file-script";
    export const ICON_FILE_SOUND = "file-sound";
    export const ICON_FILE_TEXT = "file-text";

    /**
     * Bundled Godot editor icons (vector, light/dark variants).
     *
     * Source: godotengine/godot @ c8256a8ecec068340753869e423dd478c84ef167,
     * folder editor/icons, MIT license (see icons/GODOT-ICONS-LICENSE.txt).
     * Files: icons/{dark,light}/godot/<name>.svg; light variants are generated
     * by scripts/generate-godot-light-icons.mjs.
     */
    // generic UI
    export const ICON_RELOAD_GODOT = "godot/reload";
    export const ICON_SEARCH_GODOT = "godot/search";
    export const ICON_EXTERNAL_LINK_GODOT = "godot/external-link";
    export const ICON_MARKER_GODOT = "godot/marker";
    // 2D scene object types
    export const ICON_NODE_2D_GODOT = "godot/node-2d";
    export const ICON_SPRITE_2D_GODOT = "godot/sprite-2d";
    export const ICON_COLLISION_SHAPE_2D_GODOT = "godot/collision-shape-2d";
    export const ICON_CAMERA_2D_GODOT = "godot/camera-2d";
    export const ICON_TIMER_GODOT = "godot/timer";
    export const ICON_AUDIO_STREAM_2D_GODOT = "godot/audio-stream-2d";
    export const ICON_PATH_2D_GODOT = "godot/path-2d";
    export const ICON_ANIMATION_PLAYER_GODOT = "godot/animation-player";
    export const ICON_PARTICLES_2D_GODOT = "godot/particles-2d";
    export const ICON_PARTICLE_MATERIAL_GODOT = "godot/particle-material";
    export const ICON_BONE_2D_GODOT = "godot/bone-2d";
    export const ICON_CURVE_2D_GODOT = "godot/curve-2d";
    export const ICON_VISIBILITY_NOTIFIER_2D_GODOT = "godot/visibility-notifier-2d";

    /** every registered Godot icon name; kept in sync with the svg files */
    export const GODOT_ICON_NAMES = [
        ICON_RELOAD_GODOT, ICON_SEARCH_GODOT, ICON_EXTERNAL_LINK_GODOT, ICON_MARKER_GODOT,
        ICON_NODE_2D_GODOT, ICON_SPRITE_2D_GODOT, ICON_COLLISION_SHAPE_2D_GODOT, ICON_CAMERA_2D_GODOT,
        ICON_TIMER_GODOT, ICON_AUDIO_STREAM_2D_GODOT, ICON_PATH_2D_GODOT, ICON_ANIMATION_PLAYER_GODOT,
        ICON_PARTICLES_2D_GODOT, ICON_PARTICLE_MATERIAL_GODOT, ICON_BONE_2D_GODOT, ICON_CURVE_2D_GODOT,
        ICON_VISIBILITY_NOTIFIER_2D_GODOT
    ];

    export class ResourcesPlugin extends colibri.Plugin {

        // icons

        private static _instance = new ResourcesPlugin();
        private _res: { [name: string]: any };

        static getInstance() {

            return this._instance;
        }

        private constructor() {
            super("phasereditor2d.resources", {
                loadIconsFromAtlas: true,
                loadResources: true,
                svgIcons: GODOT_ICON_NAMES
            });
        }
    }

    export function getResString(key: string) {

        return ResourcesPlugin.getInstance().getResources().getResString(key);
    }

    export function getResData(key: string) {

        return ResourcesPlugin.getInstance().getResources().getResData(key);
    }

    export function getIcon(name: string) {

        return ResourcesPlugin.getInstance().getIcon(name);
    };

    export function getIconDescriptor(name: string) {

        return ResourcesPlugin.getInstance().getIconDescriptor(name);
    };

    colibri.Platform.addPlugin(ResourcesPlugin.getInstance());
}