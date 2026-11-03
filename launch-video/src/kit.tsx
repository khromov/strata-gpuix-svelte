import type { CSSProperties, ReactNode } from 'react';
import { Img, staticFile, useCurrentFrame } from 'remotion';
import { LIGHT } from '../../lib/theme';

/**
 * What every scene is built from. Positions are in frame pixels on the 1920x1080 frame, and
 * times are absolute frames: scenes read `useCurrentFrame()` directly, with no Sequence, so
 * their numbers match the music grid in timeline.ts.
 */

export const clamp01 = (t: number) => Math.min(1, Math.max(0, t));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** Fast out, soft landing. */
export const EASE = (t: number) => 1 - (1 - clamp01(t)) ** 3;
export const inOutCubic = (t: number) => {
	const c = clamp01(t);
	return c < 0.5 ? 4 * c * c * c : 1 - (-2 * c + 2) ** 3 / 2;
};
export const inCubic = (t: number) => clamp01(t) ** 3;

/** 0 to 1 over `dur` frames starting at `from`. */
export const ramp = (frame: number, from: number, dur: number, ease: (t: number) => number = EASE) => ease((frame - from) / dur);

/** A real capture of the window, 2560x1440: public/shots/<seq>/NNNN.png. */
export const shot = (seq: string, n = 1) => staticFile(`shots/${seq}/${String(n).padStart(4, '0')}.png`);
/** One of the demo brain's real photos, 800x600. */
export const photo = (id: number) => staticFile(`photos/${id}.jpg`);

/** Which capture a flipbook shows: its captures spread evenly over from..to, holding the last. */
export function flip(frame: number, from: number, to: number, captures: number | number[]) {
	const list = typeof captures === 'number' ? Array.from({ length: captures }, (_, i) => i + 1) : captures;
	const at = Math.floor(clamp01((frame - from) / (to - from)) * list.length);
	return list[Math.min(list.length - 1, at)];
}

/** `lo-hi` capture ranges as one list, for flipbooks that skip some. */
export const ranges = (...spans: Array<[number, number]>) => spans.flatMap(([lo, hi]) => Array.from({ length: hi - lo + 1 }, (_, i) => lo + i));

export interface CropProps {
	/** From `shot()`. */
	src: string;
	/** The crop in the window's logical pixels (the window is 1280x720). */
	rect: [lx: number, ly: number, lw: number, lh: number];
	/** Frame pixels per logical pixel. A capture is sharp up to 2. */
	s: number;
	x: number;
	y: number;
	radius?: number | string;
	shadow?: string;
	style?: CSSProperties;
	children?: ReactNode;
}

/** A window of a capture placed on the frame. Children sit on top, in the crop's own box. */
export const Crop: React.FC<CropProps> = ({ src, rect: [lx, ly, lw, lh], s, x, y, radius, shadow, style, children }) => (
	<div style={{ position: 'absolute', left: x, top: y, width: lw * s, height: lh * s, overflow: 'hidden', borderRadius: radius, boxShadow: shadow, ...style }}>
		<Img src={src} style={{ position: 'absolute', left: -lx * s, top: -ly * s, width: 1280 * s, height: 720 * s, maxWidth: 'none' }} />
		{children}
	</div>
);

export interface TypeProps {
	text: string;
	x?: number;
	/** The right edge instead of `x`, in frame pixels from the left. */
	right?: number;
	baseline: number;
	size: number;
	color: string;
	weight?: number;
	/** Letter-spacing in em. */
	ls?: number;
	font?: string;
	style?: CSSProperties;
}

const type_style = ({ size, color, weight = 600, ls = -0.025, font = 'IBM Plex Sans' }: TypeProps): CSSProperties => ({
	fontFamily: font,
	fontSize: size,
	fontWeight: weight,
	letterSpacing: `${ls}em`,
	lineHeight: 1,
	color,
	whiteSpace: 'nowrap'
});

/** One line of type, placed by its left edge and baseline, as the treatment specifies it. */
export const Type: React.FC<TypeProps> = (props) => {
	const { text, x, right, baseline, size, style } = props;
	return <div style={{ position: 'absolute', top: baseline - size * 0.875, left: right === undefined ? x : undefined, right: right === undefined ? undefined : 1920 - right, ...type_style(props), ...style }}>{text}</div>;
};

export interface SlitProps extends TypeProps {
	/** The frame it starts rising. */
	from: number;
	dur?: number;
	/** The frame it starts leaving upward, if it does. */
	out?: number;
	outDur?: number;
	/** How far below the baseline the slit's lower lip sits, in em. Lower it to rise from behind something. */
	lip?: number;
}

/** The film's one way for type to arrive: a line rises through a slit at its own baseline. */
export const Slit: React.FC<SlitProps> = (props) => {
	const frame = useCurrentFrame();
	const { text, x, right, baseline, size, from, dur = 8, out, outDur = 6, lip = 0.25, style } = props;
	const rise = (1 - ramp(frame, from, dur)) * size * 1.3;
	const leave = out === undefined ? 0 : ramp(frame, out, outDur, inCubic) * size * 1.3;
	const top = baseline - size * 0.95;
	const pad = size * 0.2;
	return (
		<div
			style={{
				position: 'absolute',
				top,
				height: size * (0.95 + lip),
				left: right === undefined ? (x ?? 0) - pad : undefined,
				right: right === undefined ? undefined : 1920 - right - pad,
				padding: `0 ${pad}px`,
				overflow: 'hidden'
			}}
		>
			<div style={{ marginTop: size * 0.075, transform: `translateY(${rise - leave}px)`, ...type_style(props), ...style }}>{text}</div>
		</div>
	);
};

const edge = (frame: number, y: number) => {
	const points: string[] = [];
	for (let x = 0; x <= 1920; x += 48) points.push(`${x}px ${(y + Math.sin(x / 230 + frame / 70) * 9 + Math.sin(x / 91) * 3).toFixed(1)}px`);
	return points;
};

/** Sediment turning the page: a new ground rises with a wave on its top edge. Children ride inside it. */
export const Sheet: React.FC<{ color: string; from: number; dur: number; children?: ReactNode; style?: CSSProperties }> = ({ color, from, dur, children, style }) => {
	const frame = useCurrentFrame();
	const y = lerp(1100, -40, inOutCubic((frame - from) / dur));
	const risen = frame >= from + dur;
	return (
		<div style={{ position: 'absolute', inset: 0, backgroundColor: color, clipPath: risen ? undefined : `polygon(${edge(frame, y).join(', ')}, 1920px 1080px, 0 1080px)`, ...style }}>
			{children}
		</div>
	);
};

export interface RingProps {
	x: number;
	y: number;
	width: number;
	height: number;
	radius: number;
	color: string;
	from: number;
	dur?: number;
	strokeWidth?: number;
	/** Fades away over 4 frames from here, if it does. */
	until?: number;
}

/** A ring that draws itself around a piece of proof. No glow. */
export const Ring: React.FC<RingProps> = ({ x, y, width, height, radius, color, from, dur = 10, strokeWidth = 4, until }) => {
	const frame = useCurrentFrame();
	if (frame < from) return null;
	const drawn = ramp(frame, from, dur);
	const gone = until === undefined ? 0 : ramp(frame, until, 4);
	const m = strokeWidth;
	return (
		<svg width={width + m * 2} height={height + m * 2} style={{ position: 'absolute', left: x - m, top: y - m, opacity: 1 - gone, overflow: 'visible' }}>
			<rect x={m} y={m} width={width} height={height} rx={radius} fill="none" stroke={color} strokeWidth={strokeWidth} pathLength={1} strokeDasharray={1} strokeDashoffset={1 - drawn} />
		</svg>
	);
};

export interface RuleProps {
	x1: number;
	y1: number;
	x2: number;
	y2: number;
	color: string;
	from: number;
	dur: number;
	strokeWidth?: number;
	dots?: boolean;
}

/** One thin line, drawn from its first end to its second, used only where one thing proves another. */
export const Rule: React.FC<RuleProps> = ({ x1, y1, x2, y2, color, from, dur, strokeWidth = 3, dots = true }) => {
	const frame = useCurrentFrame();
	if (frame < from) return null;
	const t = clamp01((frame - from) / dur);
	const x = lerp(x1, x2, t);
	const y = lerp(y1, y2, t);
	return (
		<svg width={1920} height={1080} style={{ position: 'absolute', left: 0, top: 0, pointerEvents: 'none' }}>
			<line x1={x1} y1={y1} x2={x} y2={y} stroke={color} strokeWidth={strokeWidth} />
			{dots ? <circle cx={x1} cy={y1} r={6} fill={color} /> : null}
			{dots && t >= 1 ? <circle cx={x2} cy={y2} r={6} fill={color} /> : null}
		</svg>
	);
};

/** A file-name chip: the hook's mess, and the cow's caption when it comes back. `lit` is 0 to 1. */
export const Chip: React.FC<{ text: string; cx: number; cy: number; tilt: number; lit?: number; pop?: number }> = ({ text, cx, cy, tilt, lit = 0, pop = 1 }) => (
	<div
		style={{
			position: 'absolute',
			left: cx,
			top: cy,
			transform: `translate(-50%, -50%) rotate(${tilt}deg) scale(${pop})`,
			opacity: Math.min(1, pop * 4),
			padding: '12px 24px',
			borderRadius: 14,
			borderWidth: 2,
			borderStyle: 'solid',
			borderColor: LIGHT.border,
			backgroundColor: LIGHT.raised,
			color: lit > 0.5 ? LIGHT.ink : LIGHT.inkMuted,
			fontFamily: 'Lilex',
			fontWeight: 500,
			fontSize: 44,
			lineHeight: 1.25,
			whiteSpace: 'nowrap',
			boxShadow: `0 0 0 ${lit * 4}px ${LIGHT.accent}, 0 10px 30px rgba(42, 37, 31, 0.12)`
		}}
	>
		{text}
	</div>
);

/** The pointer's shape, at `width` frame pixels; `press` is 0 to 1. */
export const Pointer: React.FC<{ x: number; y: number; width?: number; press?: number }> = ({ x, y, width = 62, press = 0 }) => (
	<svg width={width} height={(width * 38) / 28} viewBox="0 0 28 38" style={{ position: 'absolute', left: x, top: y, transform: `scale(${1 - press * 0.15})`, transformOrigin: '0 0', filter: 'drop-shadow(0 2px 3px rgba(0,0,0,0.5))' }}>
		<path d="M2 2 L2 29 L9 23 L14 34 L19 32 L14 21 L24 21 Z" fill="#fff" stroke="#000" strokeWidth={1.6} strokeLinejoin="round" />
	</svg>
);
