/**
 * Films Strata: opens the real window on the demo brain seed.ts built, drives it with
 * simulated keys and clicks, and writes numbered PNGs to public/shots/<sequence>/, which the
 * composition plays back as flipbooks. Everything on screen is the app drawing itself; search
 * runs on the real embedding and CLIP models on the CPU. Only Ask's wording is scripted.
 *
 *   bunx gpuix-svelte --bun launch-video/capture/capture.ts      from the project root
 */

if (!process.versions.bun) {
	console.error('[capture] needs Bun');
	process.exit(1);
}

process.env.GPUIX_BRAIN_FEEDS = '0';

import { mkdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';

const { blur, render, get_native } = await import('gpuix-svelte');
const { create_app } = await import('../../lib/app.ts');
const { WINDOW } = await import('../../lib/window.ts');
const { ScriptedLlm, QUESTION } = await import('./scripted-llm.ts');
const { focus } = await import('../../lib/ui.svelte.ts');
const { back, can_back, push, route } = await import('../../lib/router.svelte.ts');
const { set_mode } = await import('../../lib/theme.svelte.ts');
const { capture } = await import('../../lib/capture.svelte.ts');
const { chat } = await import('../../lib/chat.svelte.ts');
const App = (await import('../../App.svelte')).default;

const video = resolve(import.meta.dir, '..');
const shots = join(video, 'public/shots');
rmSync(shots, { recursive: true, force: true });

const llm = new ScriptedLlm();
const app = await create_app({ data_dir: join(video, 'out/brain'), local: llm });
render(App, { ...WINDOW, width: 1280, height: 720, props: { app } });
const native = get_native()!;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const counts: Record<string, number> = {};
let capture_ms = 0;
let captures = 0;

/** One frame of a sequence; `settle` lets GPUI paint what just changed. */
async function snap(sequence: string, settle = 60) {
	await sleep(settle);
	mkdirSync(join(shots, sequence), { recursive: true });
	const n = (counts[sequence] = (counts[sequence] ?? 0) + 1);
	const started = performance.now();
	native.captureScreenshot(join(shots, sequence, `${String(n).padStart(4, '0')}.png`));
	capture_ms += performance.now() - started;
	captures++;
}

const key_of = (c: string) => (c === ' ' ? 'space' : /[A-Z]/.test(c) ? `shift-${c.toLowerCase()}` : c);

/** Types into whatever has focus, a frame per character when `sequence` is given. */
async function type(text: string, sequence?: string) {
	for (const c of text) {
		native.simulateKeystrokes(key_of(c));
		if (sequence) await snap(sequence, 16);
		else await sleep(20);
	}
}

const park_mouse = () => native.simulateMouseMove(1276, 716);

/** Goes to a route with the pointer out of the way, and gives thumbnails time to arrive. */
async function visit(href: string, settle = 900) {
	park_mouse();
	blur();
	// Home with an empty back stack draws no back arrow, as it does at launch.
	if (href === '/') while (can_back()) back();
	else push(href);
	await sleep(settle);
}

/**
 * Types a query, a frame per character, then presses Enter. Taking a frame outlasts SearchBar's
 * 200 ms debounce, which a person typing at speed never does, so that one timer waits while typing.
 */
async function search(query: string, sequence: string) {
	await visit('/');
	focus('search');
	await sleep(120);
	const real = globalThis.setTimeout;
	globalThis.setTimeout = ((fn: () => void, ms?: number, ...args: unknown[]) => real(fn, ms === 200 ? 60_000 : ms, ...args)) as typeof setTimeout;
	await type(query, `${sequence}_typing`);
	globalThis.setTimeout = real;
	native.simulateKeystrokes('enter');
	for (let i = 0; i < 100 && route.query.q !== query; i++) await sleep(50);
	if (route.query.q !== query) throw new Error(`search never reached "${query}", got "${route.query.q}"`);
	// The real models answer in the background; a few frames show the results landing.
	for (let i = 0; i < 4; i++) await snap(sequence, 350);
	console.log(`[capture] ${sequence}: "${query}"`);
}

await sleep(1500);
for (const model of ['embed', 'whisper', 'clip'] as const) await app.ml.load?.(model);
await sleep(300);

/* ---------- light ---------- */

set_mode('light');
park_mouse();
await sleep(1000);
await snap('timeline_light', 300);

// A thought, typed.
focus('capture');
await sleep(150);
await type('Rain jacket is in the van', 'note_typing');
native.simulateKeystrokes('shift-enter');
await type('Head nets are in the glovebox', 'note_typing');
if (capture.text !== 'Rain jacket is in the van\nHead nets are in the glovebox') throw new Error(`typing went wrong: ${JSON.stringify(capture.text)}`);
native.simulateKeystrokes('enter');
for (let i = 0; i < 6; i++) await snap('note_saved', 120);

// A link, pasted: the real page is fetched while these frames are taken.
focus('capture');
await sleep(150);
capture.text = 'https://en.wikipedia.org/wiki/Eilean_Donan';
await snap('link_pasted', 150);
native.simulateKeystrokes('enter');
for (let i = 0; i < 14; i++) await snap('link_saving', 180);

for (const [name, href] of [['kind_notes', '/notes'], ['kind_links', '/links'], ['kind_images', '/images'], ['kind_audio', '/audio'], ['kind_feeds', '/feeds']]) {
	await visit(href, 1100);
	await snap(name, 100);
}
// A feed's own options: check interval, full articles, retention.
native.simulateClick(1190, 206);
await sleep(500);
park_mouse();
await snap('kind_feeds_options', 200);

await search('bread that rises overnight', 'search_meaning');
await search('Elgol', 'search_keyword');
await search('hairy cow', 'search_picture');
// Click the result, as a person would, to open the picture it found.
native.simulateClick(760, 180);
await sleep(1200);
park_mouse();
await snap('item_cow', 200);
if (!route.path.startsWith('/item/')) throw new Error(`the click went to ${route.path}`);

/* ---------- dark ---------- */

set_mode('dark');
await visit('/', 1000);
await snap('timeline_dark', 200);

await visit('/ask', 900);
await snap('ask_empty', 100);
// The composer has no focus name, so a click puts the caret in it, as a person would.
native.simulateClick(700, 676);
await sleep(200);
await type(QUESTION, 'ask_typing');
if (chat.draft !== QUESTION) throw new Error(`typing went wrong: ${JSON.stringify(chat.draft)}`);

llm.on_word = () => snap('ask_stream', 45);
native.simulateKeystrokes('enter');
await snap('ask_thinking', 30);
for (let i = 0; i < 400 && (chat.streaming || chat.messages.length === 0); i++) await sleep(50);
llm.on_word = null;
const answer = chat.messages.at(-1);
if (answer?.error) throw new Error(`Ask failed: ${answer.error}`);
await snap('ask_done', 500);
// The pointer over the citation that the video follows, so its hover state is the real one.
native.simulateMouseMove(925, 321);
await snap('ask_hover', 250);
console.log('[capture] sources', JSON.stringify(answer?.sources?.map((s) => [s.n, s.title, answer.cited?.includes(s.n)])));

const memo = app.store.list_items({ kind: 'audio', limit: 10 }).find((i) => i.title === 'New Recording 47');
if (!memo) throw new Error('no memo');
await visit(`/item/${memo.id}`, 1300);
await snap('item_memo', 100);

await visit('/settings', 1000);
await snap('settings_0', 100);
for (let i = 1; i <= 5; i++) {
	native.simulateScrollWheel(800, 400, 0, -140);
	await snap(`settings_${i}`, 350);
}

console.log(`[capture] ${captures} frames, ${(capture_ms / captures).toFixed(0)} ms each`);
console.log(JSON.stringify(counts));
app.close();
process.exit(0);
