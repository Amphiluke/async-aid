type NonNullish = string | number | bigint | boolean | symbol | object;
type AnyFn = (...args: any[]) => any;
type KeyFn<F extends AnyFn> = (...args: Parameters<F>) => NonNullish;
type FnWrapper<F extends AnyFn> = (...args: Parameters<F>) => Promise<Awaited<ReturnType<F>>>;

type CacherOptions<F extends AnyFn> = {
  cacheRejection?: boolean;
  keyFn?: KeyFn<F>;
};
export function createCacher<F extends AnyFn>(fn: F, options?: CacherOptions<F>): FnWrapper<F>;
export function resetCacher<F extends AnyFn>(cacher: FnWrapper<F>, key?: NonNullish): boolean;

type DeduperOptions<F extends AnyFn> = {
  keyFn?: KeyFn<F>;
};
export function createDeduper<F extends AnyFn>(fn: F, options?: DeduperOptions<F>): FnWrapper<F>;
export function resetDeduper<F extends AnyFn>(deduper: FnWrapper<F>, key?: NonNullish): boolean;

type RetryerOptions = {
  maxRetries?: number;
  retryDelays?: number[];
  canRetry?: (error: any) => (boolean | Promise<boolean>);
};
export function createRetryer<F extends AnyFn>(fn: F, options?: RetryerOptions): FnWrapper<F>;

type SupersederOptions<F extends AnyFn> = {
  keyFn?: KeyFn<F>;
};
export function createSuperseder<F extends AnyFn>(fn: F, options?: SupersederOptions<F>): FnWrapper<F>;

type TimeKeeperOptions = {
  timeout: number;
};
export function createTimekeeper<F extends AnyFn>(fn: F, options: TimeKeeperOptions): FnWrapper<F>;
export const CODE_TIMED_OUT: unique symbol;
