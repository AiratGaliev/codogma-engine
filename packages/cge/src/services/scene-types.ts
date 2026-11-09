/** A lifecycle callback that may complete synchronously or asynchronously. */
export type RuntimeMaybePromise<T> = T | Promise<T>;
