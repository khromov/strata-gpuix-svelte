import { forced, system_appearance, watch_appearance } from './appearance.ts';
import type { Appearance } from './appearance.ts';
import type { Settings } from './settings.ts';
import { DARK, LIGHT, MD_THEME, READER_SIZE, READER_SIZES, reader_md } from './theme.ts';

export type ThemeMode = 'system' | 'light' | 'dark';

export const theme = $state<{ mode: ThemeMode; system: Appearance }>({ mode: 'system', system: system_appearance() });
/** The text size of an entry's body, in the reader and the editor alike. */
export const reader = $state({ size: READER_SIZE });

// Plain functions rather than exported $deriveds: a module cannot export a derived,
// and a function that reads $state is tracked wherever it is called.
export const resolved = (): Appearance => (theme.mode === 'system' ? theme.system : theme.mode);
export const tokens = () => (resolved() === 'dark' ? DARK : LIGHT);
export const md_theme = () => MD_THEME[resolved()];
export const reader_theme = () => reader_md(resolved(), reader.size);

let persist: ((mode: ThemeMode) => void) | null = null;
let persist_size: ((size: number) => void) | null = null;
let stop: (() => void) | null = null;

export function bind_theme(app: { settings: Pick<Settings, 'get' | 'set'> }) {
	theme.mode = forced() ?? app.settings.get('theme.mode') ?? 'system';
	persist = (mode) => app.settings.set('theme.mode', mode);
	const size = app.settings.get('reader.textSize');
	reader.size = READER_SIZES.includes(size) ? size : READER_SIZE;
	persist_size = (size) => app.settings.set('reader.textSize', size);
}

/** One step along READER_SIZES, stopping at either end. */
export function step_reader_size(by: 1 | -1) {
	const next = READER_SIZES[READER_SIZES.indexOf(reader.size) + by];
	if (next === undefined) return;
	reader.size = next;
	persist_size?.(next);
}

export function set_mode(mode: ThemeMode) {
	theme.mode = mode;
	persist?.(mode);
}

/** Idempotent, so a hot remount does not start a second poll. */
export function start_system_poll(): () => void {
	if (!stop) {
		stop = watch_appearance((mode) => {
			theme.system = mode;
		});
	}
	return () => {};
}
