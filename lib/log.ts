export const log = (...args: unknown[]) => console.log('[strata]', ...args);
export const warn = (...args: unknown[]) => console.warn('[strata]', ...args);
export const error = (...args: unknown[]) => console.error('[strata]', ...args);

export const DEBUG = process.env.GPUIX_BRAIN_DEBUG === '1';
export const debug = DEBUG ? log : () => {};
