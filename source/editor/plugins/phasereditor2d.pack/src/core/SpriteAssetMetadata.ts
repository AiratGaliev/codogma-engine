namespace phasereditor2d.pack.core {

    export interface ISpriteAssetRect {
        x: number;
        y: number;
        width: number;
        height: number;
    }

    export interface ISpriteAssetFrameDescriptor {
        key: string;
        sourceRect: ISpriteAssetRect;
    }

    /**
     * Версионированные пользовательские настройки изображения/кадров.
     * Данные хранятся в поле codogma Asset Pack entry и не смешиваются
     * с параметрами загрузчика Phaser или временным editorData.
     */
    export class SpriteAssetMetadata {

        static readonly DATA_KEY = "codogma";
        static readonly SCHEMA_VERSION = 1;

        static ensure(
            itemData: any,
            sourceFile: any,
            frames: ISpriteAssetFrameDescriptor[] = []
        ): any {

            const raw = itemData && itemData[this.DATA_KEY];
            const metadata = raw ? this.normalize(raw) : this.createBase();

            if (!metadata.assetId) {
                metadata.assetId = this.createId();
            }

            if (!metadata.frames || typeof metadata.frames !== "object" || Array.isArray(metadata.frames)) {
                metadata.frames = {};
            }

            if (!Array.isArray(metadata.orphanedFrames)) {
                metadata.orphanedFrames = [];
            }

            if (!Array.isArray(metadata.conflicts)) {
                metadata.conflicts = [];
            }

            for (const descriptor of frames) {
                const key = String(descriptor.key);

                if (!metadata.frames[key]) {
                    metadata.frames[key] = this.createFrame(descriptor);
                } else {
                    const frame = metadata.frames[key];

                    if (!frame.id) {
                        frame.id = this.createId();
                    }

                    if (!frame.sourceRect) {
                        frame.sourceRect = this.clone(descriptor.sourceRect);
                    }
                }
            }

            if (!metadata.source && sourceFile) {
                metadata.source = this.createSource(itemData, sourceFile);
            }

            if (!metadata.importSettingsFingerprint) {
                metadata.importSettingsFingerprint = this.getImportSettingsFingerprint(itemData);
            }

            return metadata;
        }

        /**
         * Сопоставляет старые настройки кадров с новой нарезкой.
         * Ручные настройки сохраняются только при неизменной source rectangle.
         * При несовместимости старые данные остаются в orphanedFrames и получают conflict.
         */
        static reconcile(
            previousItemData: any,
            nextItemData: any,
            frames: ISpriteAssetFrameDescriptor[],
            sourceFile: any
        ): any {

            const metadata = this.ensure(previousItemData || {}, sourceFile, []);
            const previousFrames = metadata.frames || {};
            const nextFrames: { [key: string]: any } = {};
            const seen = new Set<string>();

            for (const descriptor of frames) {
                const key = String(descriptor.key);
                const previous = previousFrames[key];
                seen.add(key);

                if (!previous) {
                    nextFrames[key] = this.createFrame(descriptor);
                    continue;
                }

                if (!previous.sourceRect || this.sameRect(previous.sourceRect, descriptor.sourceRect)) {
                    const preserved = this.clone(previous);
                    preserved.id = preserved.id || this.createId();
                    preserved.sourceRect = this.clone(descriptor.sourceRect);
                    nextFrames[key] = preserved;
                    continue;
                }

                if (this.hasUserSettings(previous)) {
                    this.addOrphan(metadata, key, previous);
                    this.addConflict(metadata, {
                        type: "frame-geometry-changed",
                        frameKey: key,
                        previousSourceRect: this.clone(previous.sourceRect),
                        currentSourceRect: this.clone(descriptor.sourceRect),
                        message: "Исходный прямоугольник кадра изменился; прежние пользовательские настройки сохранены отдельно."
                    });
                    nextFrames[key] = this.createFrame(descriptor);
                    continue;
                }

                const updated = this.clone(previous);
                updated.id = updated.id || this.createId();
                updated.sourceRect = this.clone(descriptor.sourceRect);
                nextFrames[key] = updated;
            }

            for (const key of Object.keys(previousFrames)) {
                if (seen.has(key)) {
                    continue;
                }

                const removed = previousFrames[key];

                if (this.hasUserSettings(removed)) {
                    this.addOrphan(metadata, key, removed);
                    this.addConflict(metadata, {
                        type: "frame-removed",
                        frameKey: key,
                        previousSourceRect: this.clone(removed.sourceRect),
                        currentSourceRect: null,
                        message: "Кадр удалён или больше не попадает в slicing; пользовательские настройки сохранены отдельно."
                    });
                }
            }

            metadata.frames = nextFrames;
            metadata.source = this.createSource(nextItemData, sourceFile);
            metadata.importSettingsFingerprint = this.getImportSettingsFingerprint(nextItemData);

            return metadata;
        }

        static describeFrames(frames: AssetPackImageFrame[]): ISpriteAssetFrameDescriptor[] {

            return frames.map(frame => {
                const source = frame.getFrameData().src;

                return {
                    key: String(frame.getName()),
                    sourceRect: {
                        x: Number(source.x) || 0,
                        y: Number(source.y) || 0,
                        width: Number(source.width) || frame.getWidth(),
                        height: Number(source.height) || frame.getHeight()
                    }
                };
            });
        }

        /**
         * Возвращает null для корректной геометрии или диагностическое сообщение.
         * Координаты всех фигур заданы в локальном пространстве кадра, в пикселях.
         */
        static validateCollisionShapes(value: any): string | null {

            if (!Array.isArray(value)) {
                return "Collision shapes должны быть JSON-массивом.";
            }

            for (let index = 0; index < value.length; index++) {
                const shape = value[index];

                if (!shape || typeof shape !== "object" || Array.isArray(shape)) {
                    return `Фигура ${index + 1}: ожидался объект.`;
                }

                switch (shape.type) {
                    case "rectangle":
                    case "rect":
                        if (!this.isFiniteNumber(shape.x) || !this.isFiniteNumber(shape.y)
                            || !this.isPositiveNumber(shape.width) || !this.isPositiveNumber(shape.height)
                            || shape.x < 0 || shape.y < 0) {
                            return `Фигура ${index + 1}: rectangle требует x/y >= 0 и width/height > 0.`;
                        }
                        break;

                    case "circle":
                        if (!this.isFiniteNumber(shape.x) || !this.isFiniteNumber(shape.y)
                            || !this.isPositiveNumber(shape.radius) || shape.x < 0 || shape.y < 0) {
                            return `Фигура ${index + 1}: circle требует x/y >= 0 и radius > 0.`;
                        }
                        break;

                    case "polygon":
                        if (!Array.isArray(shape.points) || shape.points.length < 3) {
                            return `Фигура ${index + 1}: polygon должен содержать минимум три точки.`;
                        }

                        for (const point of shape.points) {
                            const x = Array.isArray(point) ? point[0] : point && point.x;
                            const y = Array.isArray(point) ? point[1] : point && point.y;

                            if (!this.isFiniteNumber(x) || !this.isFiniteNumber(y) || x < 0 || y < 0) {
                                return `Фигура ${index + 1}: координаты polygon должны быть конечными и неотрицательными.`;
                            }
                        }
                        break;

                    default:
                        return `Фигура ${index + 1}: неподдерживаемый тип collision shape.`;
                }
            }

            return null;
        }

        static hasUserSettings(frame: any): boolean {

            if (!frame) {
                return false;
            }

            if (frame.trim || frame.crop) {
                return true;
            }

            if (Array.isArray(frame.collisionShapes) && frame.collisionShapes.length > 0) {
                return true;
            }

            if (frame.pivot) {
                return Number(frame.pivot.x) !== 0.5 || Number(frame.pivot.y) !== 0.5;
            }

            return false;
        }

        private static normalize(value: any): any {

            if (!value || typeof value !== "object" || Array.isArray(value)) {
                throw new Error("Некорректные Codogma asset metadata.");
            }

            const version = Number(value.schemaVersion || 0);

            if (version > this.SCHEMA_VERSION) {
                throw new Error(
                    `Asset metadata schema v${version} новее поддерживаемой v${this.SCHEMA_VERSION}; reimport отменён без изменения данных.`
                );
            }

            const metadata = this.clone(value);

            // Версия 0 — отсутствие versioned metadata. Неизвестные поля сохраняются.
            metadata.schemaVersion = this.SCHEMA_VERSION;

            return metadata;
        }

        private static createBase(): any {

            return {
                schemaVersion: this.SCHEMA_VERSION,
                assetId: this.createId(),
                source: null,
                importSettingsFingerprint: "",
                frames: {},
                orphanedFrames: [],
                conflicts: []
            };
        }

        private static createFrame(descriptor: ISpriteAssetFrameDescriptor): any {

            return {
                id: this.createId(),
                sourceRect: this.clone(descriptor.sourceRect)
            };
        }

        private static createSource(itemData: any, sourceFile: any): any {

            const url = itemData && typeof itemData.url === "string" ? itemData.url : "";
            const size = sourceFile && typeof sourceFile.getSize === "function"
                ? sourceFile.getSize() : null;
            const modifiedAt = sourceFile && typeof sourceFile.getModTime === "function"
                ? sourceFile.getModTime() : null;
            const signature = this.fingerprint(`${url}|${size}|${modifiedAt}`);

            return {
                url,
                size,
                modifiedAt,
                signature
            };
        }

        private static getImportSettingsFingerprint(itemData: any): string {

            const settings = {
                type: itemData && itemData.type,
                frameConfig: itemData && itemData.frameConfig || null
            };

            return this.fingerprint(JSON.stringify(settings));
        }

        private static sameRect(a: ISpriteAssetRect, b: ISpriteAssetRect): boolean {

            return Number(a.x) === Number(b.x)
                && Number(a.y) === Number(b.y)
                && Number(a.width) === Number(b.width)
                && Number(a.height) === Number(b.height);
        }

        private static addOrphan(metadata: any, frameKey: string, frame: any) {

            const id = frame.id || this.createId();

            if (!metadata.orphanedFrames.some((entry: any) => entry.id === id)) {
                metadata.orphanedFrames.push(Object.assign(
                    { frameKey },
                    this.clone(frame),
                    { id }
                ));
            }
        }

        private static addConflict(metadata: any, conflict: any) {

            const signature = `${conflict.type}|${conflict.frameKey}|${JSON.stringify(conflict.currentSourceRect)}`;
            const exists = metadata.conflicts.some((entry: any) =>
                `${entry.type}|${entry.frameKey}|${JSON.stringify(entry.currentSourceRect)}` === signature
            );

            if (!exists) {
                metadata.conflicts.push(Object.assign({ id: this.createId() }, conflict));
            }
        }

        private static isFiniteNumber(value: any): boolean {

            return typeof value === "number" && Number.isFinite(value);
        }

        private static isPositiveNumber(value: any): boolean {

            return this.isFiniteNumber(value) && value > 0;
        }

        private static fingerprint(value: string): string {

            // Это детерминированная подпись размера/mtime/URL, а не криптографический hash файла.
            let hash = 2166136261;

            for (let i = 0; i < value.length; i++) {
                hash ^= value.charCodeAt(i);
                hash = Math.imul(hash, 16777619);
            }

            return (hash >>> 0).toString(16).padStart(8, "0");
        }

        private static createId(): string {

            const bytes = new Uint8Array(16);

            if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
                crypto.getRandomValues(bytes);
            } else {
                for (let i = 0; i < bytes.length; i++) {
                    bytes[i] = Math.floor(Math.random() * 256);
                }
            }

            bytes[6] = (bytes[6] & 0x0f) | 0x40;
            bytes[8] = (bytes[8] & 0x3f) | 0x80;

            const hex = Array.from(bytes, value => value.toString(16).padStart(2, "0")).join("");

            return `${hex.substring(0, 8)}-${hex.substring(8, 12)}-${hex.substring(12, 16)}-${hex.substring(16, 20)}-${hex.substring(20)}`;
        }

        private static clone<T>(value: T): T {

            return value === undefined || value === null
                ? value
                : JSON.parse(JSON.stringify(value));
        }
    }
}
