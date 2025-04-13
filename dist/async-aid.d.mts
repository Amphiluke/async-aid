type NonNullish = string | number | bigint | boolean | symbol | object;
type AnyFn = (...args: any[]) => any;
type KeyFn<F extends AnyFn> = (...args: Parameters<F>) => NonNullish;
type FnWrapper<F> = (...args: Parameters<F>) => Promise<Awaited<ReturnType<F>>>;

type CacherOptionss<F extends AnyFn> = {
  cacheRejection?: boolean;
  keyFn?: KeyFn<F>;
};
export function createCacher<F extends AnyFn>(fn: F, options?: CacherOptions<F>): FnWrapper<F>;
export function resetCacher(cacher: Cacher, key?: NonNullish): boolean;

type DeduperOptions<F extends AnyFn> = {
  keyFn?: KeyFn<F>;
};
export function createDeduper<F extends AnyFn>(fn: F, options?: DeduperOptions<F>): FnWrapper<F>;
export function resetDeduper(deduper: Deduper, key?: NonNullish): boolean;

type RetryerOptions = {
  maxRetries?: number;
  retryDelays?: number[];
};
export function createRetryer<F extends AnyFn>(fn: F, options?: RertyerOptions): FnWrapper<F>;

type TimeKeeperOptions = {
  timeout: number;
};
export function createTimekeeper<F extends AnyFn>(fn: F, options: TimeKeeperOptions): FnWrapper<F>;
export const CODE_TIMED_OUT: unique symbol;
