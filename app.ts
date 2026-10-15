/**
 * Bun-only: bun:sqlite, Bun.spawn IPC, Bun.Image, HTMLRewriter and bun:ffi have no
 * Node twins, so every script passes `--bun` to the gpuix-svelte bin.
 */

if (!process.versions.bun) {
	console.error('[strata] Strata needs Bun — `bun run start` runs `gpuix-svelte --bun app.ts`');
	process.exit(1);
}

// Imported after the guard: a static import would hoist the Bun-only modules above it.
const { render_hot } = await import('gpuix-svelte');
const { create_app } = await import('./lib/app.ts');
const { WINDOW } = await import('./lib/window.ts');

const stub = process.env.GPUIX_BRAIN_STUB === '1';
const app = await create_app({
	data_dir: process.env.GPUIX_BRAIN_DIR || (stub ? new URL('./.data/stub', import.meta.url).pathname : null),
	seed: stub
});

render_hot(new URL('./App.svelte', import.meta.url), { ...WINDOW, props: { app } });
