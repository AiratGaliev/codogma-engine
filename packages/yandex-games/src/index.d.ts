export type YandexGamesClientState = "idle" | "loading" | "ready" | "failed" | "disposed";
export interface YandexGamesSdkRoot { init(options?: Record<string, unknown>): Promise<any>; }

export interface YandexGamesClientOptions {
    sdkUrl?: string;
    sdkOptions?: Record<string, unknown>;
    sdkLoadTimeoutMs?: number;
    sdkApi?: YandexGamesSdkRoot;
    sdkLoader?: (options: Record<string, unknown>) => Promise<YandexGamesSdkRoot>;
    globalObject?: any;
    documentObject?: Document | null;
    onListenerError?: (error: Error, eventName: string) => void;
}
export interface YandexGamesClient {
    initialize(): Promise<any>;
    getSDK(): any;
    on(eventName: string, listener: (payload: any) => void): () => void;
    emit(eventName: string, payload?: any): void;
    dispose(): void;
    readonly state: YandexGamesClientState;
    readonly isInitialized: boolean;
}
export interface YandexGamesLifecycleOptions {
    onPause?: (context: { reason: string }) => void;
    onResume?: (context: { reason: string }) => void;
}
export interface YandexGamesPlatformOptions extends YandexGamesClientOptions {
    lifecycle?: YandexGamesLifecycleOptions;
    adTimeoutMs?: number;
    signedPayments?: boolean;
}
export interface AdResult {
    kind: "fullscreen" | "rewarded";
    wasShown: boolean;
    rewarded: boolean;
    error?: Error;
}
export interface AdCallbacks {
    onOpen?: (context: { kind: "fullscreen" | "rewarded" }) => void;
    onClose?: (result: { wasShown: boolean; rewarded: boolean; error?: Error }) => void;
    onRewarded?: (context: { kind: "rewarded"; token: string }) => void;
    onError?: (error: Error) => void;
}
export interface YandexGamesLifecycle {
    ready(): boolean;
    gameplayStart(): boolean;
    gameplayStop(): boolean;
    readonly isGameplayActive: boolean;
    readonly isSuspended: boolean;
    dispose(): void;
}
export interface YandexGamesAds {
    showFullscreen(options?: AdCallbacks): Promise<AdResult>;
    showRewarded(options?: AdCallbacks): Promise<AdResult>;
}
export interface YandexGamesPlayer {
    getPlayer(options?: { scopes?: boolean }): Promise<any>;
    getProfile(options?: { scopes?: boolean }): Promise<{ id?: string; name?: string; photo?: string; payingStatus?: string; authorized: boolean }>;
    isAuthorized(): Promise<boolean>;
    authorize(options?: { scopes?: boolean }): Promise<any>;
    loadData(keys?: string[], options?: { scopes?: boolean }): Promise<Record<string, unknown>>;
    saveData(data: Record<string, unknown>, options?: { flush?: boolean; scopes?: boolean }): Promise<void>;
    getStats(keys?: string[], options?: { scopes?: boolean }): Promise<Record<string, number>>;
    setStats(stats: Record<string, number>, options?: { scopes?: boolean }): Promise<void>;
    incrementStats(stats: Record<string, number>, options?: { scopes?: boolean }): Promise<void>;
}
export interface YandexGamesLeaderboards {
    isAvailable(methodName: string): Promise<boolean>;
    setScore(name: string, score: number, extraData?: string): Promise<void>;
    getDescription(name: string): Promise<any>;
    getEntries(name: string, options?: Record<string, unknown>): Promise<any>;
    getPlayerEntry(name: string, options?: Record<string, unknown>): Promise<any>;
}
export interface YandexGamesPayments {
    getPayments(): Promise<any>;
    getCatalog(): Promise<any[]>;
    getPurchases(): Promise<any[]>;
    purchase(productId: string): Promise<any>;
    consumePurchase(token: string): Promise<void>;
}
export interface YandexGamesPlatformServices {
    getEnvironment(): any;
    getLanguage(): string;
    getFlags(options?: { defaultFlags?: Record<string, string>; clientFeatures?: Array<{ name: string; value: string }> }): Promise<Record<string, string>>;
    getServerTime(): Promise<number>;
    requestFullscreen(): Promise<void>;
    exitFullscreen(): Promise<void>;
    isFullscreen(): boolean;
    canReview(): Promise<any>;
    requestReview(): Promise<{ requested: boolean; feedbackSent: boolean; reason?: string }>;
    canShowShortcut(): Promise<any>;
    showShortcutPrompt(): Promise<{ requested: boolean; outcome: string }>;
    writeClipboard(text: string): Promise<void>;
    openExternalLink(url: string): Promise<void>;
}
export interface YandexGamesPlatform extends YandexGamesClient {
    lifecycle: YandexGamesLifecycle;
    ads: YandexGamesAds;
    player: YandexGamesPlayer;
    leaderboards: YandexGamesLeaderboards;
    payments: YandexGamesPayments;
    platform: YandexGamesPlatformServices;
}
export interface CreateMockYandexGamesSdkOptions {
    authorized?: boolean;
    playerData?: Record<string, unknown>;
    playerStats?: Record<string, number>;
    playerId?: string;
    playerName?: string;
    playerPhoto?: string;
    payingStatus?: string;
    fullscreenAd?: { wasShown?: boolean; error?: string };
    rewardedAd?: { wasShown?: boolean; rewarded?: boolean; error?: string };
    catalog?: Array<{ id: string; [key: string]: unknown }>;
    purchases?: Array<Record<string, unknown>>;
    paymentsAvailable?: boolean;
    remoteFlags?: Record<string, string>;
    reviewAvailable?: boolean;
    reviewSent?: boolean;
    shortcutAvailable?: boolean;
    shortcutOutcome?: string;
    authResult?: boolean;
    serverTime?: number;
    environment?: Record<string, unknown>;
}
export class YandexGamesIntegrationError extends Error {
    code: string;
    constructor(code: string, message: string, cause?: unknown);
}
export function loadYandexGamesSdk(options?: { globalObject?: any; documentObject?: Document | null; sdkUrl?: string; timeoutMs?: number }): Promise<YandexGamesSdkRoot>;
export function createYandexGamesClient(options?: YandexGamesClientOptions): YandexGamesClient;
export function createYandexGamesLifecycle(client: YandexGamesClient, options?: YandexGamesLifecycleOptions): YandexGamesLifecycle;
export function createYandexGamesAds(client: YandexGamesClient, options?: { timeoutMs?: number }): YandexGamesAds;
export function createYandexGamesPlayer(client: YandexGamesClient): YandexGamesPlayer;
export function createYandexGamesLeaderboards(client: YandexGamesClient): YandexGamesLeaderboards;
export function createYandexGamesPayments(client: YandexGamesClient, options?: { signed?: boolean }): YandexGamesPayments;
export function createYandexGamesPlatformServices(client: YandexGamesClient): YandexGamesPlatformServices;
export function createYandexGamesPlatform(options?: YandexGamesPlatformOptions): YandexGamesPlatform;
export function createMockYandexGamesSdk(options?: CreateMockYandexGamesSdkOptions): YandexGamesSdkRoot & {
    calls: Array<{ method: string; args: Record<string, unknown> }>;
    emit(eventName: string, payload?: unknown): void;
    getMockState(): Record<string, unknown>;
};
