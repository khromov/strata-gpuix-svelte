import type { GpuixTheme } from 'gpuix-svelte';
/**
 * The palette. `App.svelte` hands the active one to `set_css_vars`, so a component's
 * `<style>` reads `var(--surface)` and a theme switch is one restyle; this is also
 * the source for the markdown theme.
 *
 * Contrast, in both modes: every text token (inkFaint included) and each kind colour on
 * its Soft wash clears WCAG AA, 4.5:1, on the surfaces it sits on; borderStrong is about
 * 2.3:1 or more against fields and cards, and selected fills (accentSoft, control on
 * sunken) about 1.2:1 or more against their surroundings.
 */

export const LIGHT = {
	appearance: 'light' as 'light' | 'dark',
	bg: '#f5efe4',
	surface: '#fbf7ef',
	raised: '#ffffff',
	sunken: '#e4d9c3',
	well: '#e4d9c3',
	sidebar: '#f1ebdf',
	control: '#fbf7ef',
	controlHover: '#ffffff',
	field: '#ffffff',
	focusSurface: '#ffffff',
	border: '#d9ccb2',
	borderStrong: '#b0a184',
	borderHover: '#9c8d70',
	divider: '#dccfb7',
	ink: '#2a251f',
	inkMuted: '#554d43',
	inkFaint: '#72685a',
	accent: '#587044',
	accentInk: '#f8f5ec',
	accentSoft: '#d3ddc1',
	accentHover: '#4b6139',
	accentDeep: '#3f5a30',
	ochre: '#a47426',
	ochreInk: '#835a1a',
	ochreSoft: '#f1e3c6',
	danger: '#9e4336',
	dangerInk: '#fbf7ef',
	dangerSoft: '#f3dcd6',
	dangerHover: '#883a2e',
	dangerBorder: '#d9a196',
	dangerWash: 'rgba(169, 72, 58, 0.2)',
	info: '#4a6482',
	infoSoft: '#dce6ef',
	plum: '#785776',
	plumSoft: '#ede0ec',
	plumBorder: '#d9c4d8',
	teal: '#386c67',
	tealSoft: '#d9ebe9',
	hover: 'rgba(42, 37, 31, 0.06)',
	hoverStrong: 'rgba(42, 37, 31, 0.09)',
	active: 'rgba(42, 37, 31, 0.12)',
	selection: 'rgba(95, 122, 74, 0.28)',
	scrim: 'rgba(42, 37, 31, 0.42)',
	'scroller-thumb': '#bdae92',
	'scroller-thumb-hover': '#a3957a',
	'tooltip-surface': '#2a251f',
	'tooltip-ink': '#f8f5ec'
};

export type Palette = typeof LIGHT;

export const DARK: Palette = {
	appearance: 'dark',
	bg: '#1b1815',
	surface: '#231f1b',
	raised: '#2b2621',
	sunken: '#151210',
	well: '#36302a',
	sidebar: '#171411',
	control: '#352f29',
	controlHover: '#3f3831',
	field: '#151210',
	focusSurface: '#231f1b',
	border: '#3b352e',
	borderStrong: '#615748',
	borderHover: '#746856',
	divider: '#2b2621',
	ink: '#ece3d3',
	inkMuted: '#b2a791',
	inkFaint: '#988d7f',
	accent: '#8fae74',
	accentInk: '#1b1815',
	accentSoft: '#2e3927',
	accentHover: '#a3c088',
	accentDeep: '#b7d19f',
	ochre: '#d9a34a',
	ochreInk: '#d9a34a',
	ochreSoft: '#3a2e1b',
	danger: '#d97e6f',
	dangerInk: '#1b1815',
	dangerSoft: '#3c2521',
	dangerHover: '#e48e80',
	dangerBorder: '#7a4137',
	dangerWash: 'rgba(212, 111, 94, 0.2)',
	info: '#87a4c3',
	infoSoft: '#26313d',
	plum: '#b68cb2',
	plumSoft: '#352a36',
	plumBorder: '#5a4459',
	teal: '#6fb3ad',
	tealSoft: '#1f3634',
	hover: 'rgba(236, 227, 211, 0.07)',
	hoverStrong: 'rgba(236, 227, 211, 0.10)',
	active: 'rgba(236, 227, 211, 0.13)',
	selection: 'rgba(143, 174, 116, 0.32)',
	scrim: 'rgba(0, 0, 0, 0.55)',
	'scroller-thumb': '#574e41',
	'scroller-thumb-hover': '#6b6052',
	'tooltip-surface': '#4a4237',
	'tooltip-ink': '#ece3d3'
};

export const KIND_COLOR = {
	light: { text: LIGHT.ochre, link: LIGHT.info, image: LIGHT.plum, audio: LIGHT.teal },
	dark: { text: DARK.ochre, link: DARK.info, image: DARK.plum, audio: DARK.teal }
};

export const FONT = { sans: 'IBM Plex Sans', mono: 'Lilex' };

function md(t: Palette, size: number): GpuixTheme {
	const headings = [size + 9, size + 5, size + 2, size];
	return {
		appearance: t.appearance,
		bg: t.surface,
		border: t.border,
		text: t.ink,
		textMuted: t.inkMuted,
		textFaint: t.inkFaint,
		textDim: t.inkFaint,
		accent: t.accent,
		caret: t.accent,
		codeText: t.ink,
		codeWash: t.sunken,
		diffAdd: t.accentSoft,
		diffDel: t.dangerSoft,
		diffHunkBg: t.sunken,
		fontSans: FONT.sans,
		fontMono: FONT.mono,
		syntax: {
			comment: t.inkFaint,
			keyword: t.plum,
			string: t.accent,
			stringSpecial: t.accent,
			escape: t.ochre,
			number: t.ochre,
			boolean: t.ochre,
			constant: t.ochre,
			typeName: t.info,
			typeBuiltin: t.info,
			constructor: t.info,
			function: t.info,
			functionBuiltin: t.info,
			macroName: t.plum,
			property: t.teal,
			variable: t.ink,
			variableSpecial: t.danger,
			parameter: t.ink,
			operator: t.inkMuted,
			punctuation: t.inkFaint,
			tag: t.info,
			attribute: t.ochre,
			label: t.plum,
			invalid: t.danger
		},
		metrics: {
			mdTextSize: size,
			mdLineHeight: line_height(size),
			mdBlockGap: block_gap(size),
			mdHeadingSizes: headings,
			mdHeadingLineHeights: headings.map((h) => Math.round(h * 1.3 + 2)),
			mdInlineCodeRadius: 4,
			mdCodeRadius: 8,
			codeTextSize: size - 2,
			codeLineHeight: Math.round((size - 2) * 1.55)
		}
	};
}

export const line_height = (size: number) => Math.round(size * 1.6);
export const block_gap = (size: number) => Math.round(size * 0.9);

/** Built once per mode, so `<markdown>` sees a stable object identity. */
export const MD_THEME = { light: md(LIGHT, 15), dark: md(DARK, 15) };

/** The text sizes an entry's A− and A+ step through, and where a fresh install starts. */
export const READER_SIZES = [14, 15, 16, 17, 18, 20, 22, 24];
export const READER_SIZE = 17;

const reader_themes = new Map<string, GpuixTheme>();

/** An entry's markdown at its reading size, cached for the same stable identity. */
export function reader_md(appearance: Palette['appearance'], size: number): GpuixTheme {
	const key = `${appearance}/${size}`;
	let theme = reader_themes.get(key);
	if (!theme) reader_themes.set(key, (theme = md(appearance === 'dark' ? DARK : LIGHT, size)));
	return theme;
}
