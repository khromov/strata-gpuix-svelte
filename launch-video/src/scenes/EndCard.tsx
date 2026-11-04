import { Img, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { DARK, LIGHT } from '../../../lib/theme';
import { clamp01, ramp, Slit, Type } from '../kit';
import { Strata } from '../Strata';

const smoothstep = (t: number) => {
	const c = clamp01(t);
	return c * c * (3 - 2 * c);
};

/**
 * The wordmark's letters rise through one slit. They stay plain inline spans moved by `top`,
 * because that keeps the word shaped as one run: an inline-block per letter would lose its kerning.
 */
const Wordmark: React.FC = () => {
	const frame = useCurrentFrame();
	const size = 525;
	const baseline = 528;
	const pad = size * 0.2;
	return (
		<div style={{ position: 'absolute', left: 471 - pad, top: baseline - size * 0.95, height: size * 1.2, padding: `0 ${pad}px`, overflow: 'hidden' }}>
			<div style={{ marginTop: size * 0.075, fontFamily: 'IBM Plex Sans', fontSize: size, fontWeight: 500, letterSpacing: '-0.03em', lineHeight: 1, color: DARK.ink, whiteSpace: 'nowrap' }}>
				{[...'Strata'].map((letter, i) => (
					<span key={i} style={{ position: 'relative', top: (1 - ramp(frame, 853 + i * 2, 10)) * size * 1.3 }}>
						{letter}
					</span>
				))}
			</div>
		</div>
	);
};

/** The pill rises whole, through a slit the size of the pill. */
const Download: React.FC = () => {
	const frame = useCurrentFrame();
	const height = 98;
	return (
		<div style={{ position: 'absolute', left: 72, top: 629, height, overflow: 'hidden' }}>
			<div
				style={{
					transform: `translateY(${(1 - ramp(frame, 875, 8)) * height * 1.05}px)`,
					padding: '20px 44px',
					borderRadius: 16,
					fontFamily: 'IBM Plex Sans',
					fontSize: 46,
					fontWeight: 600,
					letterSpacing: '-0.4px',
					lineHeight: 1.25,
					backgroundColor: DARK.accent,
					color: DARK.accentInk,
					whiteSpace: 'nowrap'
				}}
			>
				Download for macOS, Windows and Linux
			</div>
		</div>
	);
};

export const EndCard: React.FC = () => {
	const frame = useCurrentFrame();
	const { fps } = useVideoConfig();
	const up = (delay: number) => spring({ frame: frame - 847 - delay, fps, config: { damping: 17, stiffness: 120 } });
	const mark = spring({ frame: frame - 853, fps, config: { damping: 12, stiffness: 150 } });

	return (
		<>
			{/* Local's layer ends here, when the cover is past the top of the frame. The ground below is still a few px low, and the page's cream would show above it. */}
			{frame >= 858 ? <div style={{ position: 'absolute', inset: 0, backgroundColor: DARK.bg }} /> : null}
			{/* At rise 0 a band's wave crests still show along the bottom edge, so the ground waits just below the frame until the first band moves. */}
			<div style={{ position: 'absolute', inset: 0, transform: `translateY(${Math.max(0, 1 - up(5)) * 20}px)` }}>
				<Strata
					bands={[
						{ color: LIGHT.accentDeep, height: 84, rise: up(5) },
						{ color: DARK.ochre, height: 34, rise: up(7) },
						{ color: DARK.teal, height: 36, rise: up(9) },
						{ color: DARK.tealSoft, height: 34, rise: up(11) },
						{ color: DARK.bg, height: 1180 * ramp(frame, 847, 11, smoothstep), rise: 1 }
					]}
				/>
			</div>
			<Slit text="A second brain that lives on your computer." x={70} baseline={112} size={60} color={DARK.inkMuted} weight={500} ls={-0.01} from={861} />
			{/* Hidden for the spring's first frame, when the cover's edge is still crossing the giant type behind it. */}
			<Img src={staticFile('icon.svg')} style={{ position: 'absolute', left: 28, top: 121, width: 451, height: 451, opacity: clamp01((mark - 0.1) * 5), transform: `scale(${0.6 + mark * 0.4})` }} />
			<Wordmark />
			<Download />
			{/* The kit's baseline formula is Plex's: Lilex would land 2 px high, so 803 is what puts this line's ink on 801. */}
			<Slit text="github.com/khromov/strata-gpuix-svelte" x={72} baseline={803} size={44} color={DARK.ink} weight={500} ls={0} font="Lilex" from={889} />
			<Type text="Dream Relic - Time is a Limited Allowance" x={72} baseline={1056} size={26} color={LIGHT.bg} weight={500} ls={0} style={{ opacity: 0.85 * ramp(frame, 875, 8) }} />
		</>
	);
};
