import { AbsoluteFill, spring, useCurrentFrame } from 'remotion';
import { LIGHT } from '../../../lib/theme';
import { Chip, EASE, Slit, Type, clamp01, inCubic, lerp, ramp } from '../kit';
import { Strata } from '../Strata';
import { DROP, FPS } from '../timeline';

/**
 * The poster, the question and the crack. Every piece belongs to one half of the paper from the
 * start, so the exit only has to move the two halves apart.
 */

const BANDS = [
	{ color: LIGHT.accent, height: 34 },
	{ color: LIGHT.borderStrong, height: 30 },
	{ color: LIGHT.border, height: 34 },
	{ color: LIGHT.sunken, height: 40 }
];

interface HookChip {
	text: string;
	half: 'top' | 'bottom';
	at: number;
	cx: number;
	cy: number;
	tilt: number;
	/** The frames it is lit: it fades in at the first and back out at the second. */
	lit?: [from: number, until?: number];
}

const CHIPS: HookChip[] = [
	{ text: 'New Recording 47', half: 'top', at: 12, cx: 1648, cy: 110, tilt: 3, lit: [61, 75] },
	{ text: 'Untitled note', half: 'bottom', at: 22, cx: 1560, cy: 690, tilt: 2 },
	{ text: 'IMG_4721.jpg', half: 'top', at: 33, cx: 1640, cy: 290, tilt: -4, lit: [90] },
	{ text: 'final_v3_FINAL.png', half: 'bottom', at: 40, cx: 300, cy: 850, tilt: 3, lit: [75, 90] },
	{ text: 'tab 84 of 112', half: 'top', at: 47, cx: 1680, cy: 470, tilt: -3 },
	// About 34 px clear of final_v3's border, and its pop overshoot half what it was over '.png'.
	{ text: 'bookmarks / misc / misc 2', half: 'bottom', at: 54, cx: 962, cy: 846, tilt: -1.5 },
	// Its bleed is deliberate; 1902 keeps its pop's peak (67-71) off the bookmarks chip's '2'.
	{ text: 'Screenshot 2026-09-14 at 11.02.37.png', half: 'bottom', at: 61, cx: 1902, cy: 862, tilt: -2 }
];

const CRACK_AT = 90;
const CRACK = 6;
const FLOWN = 620;
const FLIGHT = 8;
const HOP = 3;

const SEAM: string[] = [];
for (let x = 0; x <= 1920; x += 48) SEAM.push(`${x}px ${(520 + Math.sin(x / 230 + 1.7) * 9 + Math.sin(x / 91 + 2.3) * 3).toFixed(1)}px`);
const ABOVE = `polygon(0 0, 1920px 0, ${[...SEAM].reverse().join(', ')})`;
const BELOW = `polygon(${SEAM.join(', ')}, 1920px 1080px, 0 1080px)`;

const Scrap: React.FC<{ chip: HookChip; index: number }> = ({ chip: { text, at, cx, cy, tilt, lit }, index }) => {
	const frame = useCurrentFrame();
	if (frame < at) return null;
	const pop = spring({ frame: frame - at, fps: FPS, config: { damping: 13, stiffness: 170 } });
	const y = cy + Math.sin(frame / 24 + index * 1.9) * 4;
	const on = lit ? ramp(frame, lit[0], HOP, clamp01) - (lit[1] === undefined ? 0 : ramp(frame, lit[1], HOP, clamp01)) : 0;
	return (
		<>
			{on < 1 ? <Chip text={text} cx={cx} cy={y} tilt={tilt} pop={pop} /> : null}
			{/* Chip's own `lit` grows its ring and swaps the ink at the halfway point; a hop is a fade. */}
			{on > 0 ? (
				<div style={{ position: 'absolute', inset: 0, opacity: on }}>
					<Chip text={text} cx={cx} cy={y} tilt={tilt} pop={pop} lit={1} />
				</div>
			) : null}
		</>
	);
};

export const Hook: React.FC = () => {
	const frame = useCurrentFrame();
	const apart = lerp(ramp(frame, CRACK_AT, DROP - CRACK_AT, inCubic) * CRACK, FLOWN, EASE((frame - DROP) / FLIGHT));
	const chips = (half: HookChip['half']) => CHIPS.map((chip, i) => (chip.half === half ? <Scrap key={chip.text} chip={chip} index={i} /> : null));
	return (
		<>
			{/* Opening's layer takes over once the halves fly. On the drop itself it would put a 12 px strip of window in the crack. */}
			{frame <= DROP ? <AbsoluteFill style={{ backgroundColor: frame > CRACK_AT ? LIGHT.accentDeep : LIGHT.bg }} /> : null}
			<AbsoluteFill style={{ transform: `translateY(${apart}px)` }}>
				<AbsoluteFill style={{ backgroundColor: LIGHT.bg, clipPath: BELOW }} />
				<Strata bands={BANDS} />
				<Slit text="But where?" x={52} baseline={724} size={240} color={LIGHT.accent} from={47} />
				{chips('bottom')}
			</AbsoluteFill>
			<AbsoluteFill style={{ transform: `translateY(${-apart}px)` }}>
				<AbsoluteFill style={{ backgroundColor: LIGHT.bg, clipPath: ABOVE }} />
				<Type text="You saved it" x={70} baseline={244} size={240} color={LIGHT.ink} />
				<Slit text="somewhere." x={65} baseline={484} size={240} color={LIGHT.ink} from={18} />
				{chips('top')}
			</AbsoluteFill>
		</>
	);
};
