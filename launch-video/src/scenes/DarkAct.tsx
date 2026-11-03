import { Easing, useCurrentFrame } from 'remotion';
import { DARK, LIGHT } from '../../../lib/theme';
import { Crop, Pointer, Ring, Rule, Slit, clamp01, flip, inCubic, inOutCubic, lerp, ramp, ranges, shot } from '../kit';
import { Strata } from '../Strata';

/**
 * Ask, answer, citations and source: 561-789, one unbroken dark layer. The scenes hand their parts
 * to each other (the composer becomes the bubble, the answer pans to its citation, the claim line
 * and its ring travel into the strip), so they share one timeline here instead of four components.
 */

const DARKBANDS = [
	{ color: LIGHT.accentDeep, height: 30 },
	{ color: LIGHT.ochre, height: 22 },
	{ color: LIGHT.borderHover, height: 24 },
	{ color: DARK.well, height: 24 }
];

// The stream captures that show raw markdown asterisks are skipped.
const STREAM = ranges([1, 10], [13, 30], [37, 64]);

const pointer_path = Easing.bezier(0.3, 0, 0.1, 1);

/** The act's left-to-right wipe, past both frame edges so no sliver of the wave is left at either end. */
function wipe(frame: number) {
	if (frame >= 570) return undefined;
	const x = lerp(-12, 1932, inOutCubic((frame - 561) / 9));
	const points: string[] = [];
	for (let y = 0; y <= 1080; y += 40) points.push(`${(x + Math.sin(y / 230) * 12).toFixed(1)}px ${y}px`);
	return `polygon(0 0, ${points.join(', ')}, 0 1080px)`;
}

export const DarkAct: React.FC = () => {
	const frame = useCurrentFrame();
	const between = (from: number, to: number) => frame >= from && frame < to;

	// 618-628: composer text onto bubble text, measured glyph to glyph on the captures.
	const travel = ramp(frame, 618, 10);
	const shrink = ramp(frame, 618, 4);
	// The bubble comes up under the words, weighted late, so its copy stays a ghost while they are
	// still apart. They stay solid until they land, which their layer ending at 628 does exactly.
	const bubble_in = clamp01((frame - 622) / 6) ** 3;

	// 689-703: the pan, rounded so the sharp crops and the base under them never disagree by a pixel.
	const pan = ramp(frame, 689, 14);
	const tx = Math.round(lerp(-789, -1440, pan));
	const ty = Math.round(lerp(-152, -315, pan));
	const dim = ramp(frame, 693, 8);

	// 732 on: the panel settles into the strip, the claim and its ring ride into it.
	const settle = ramp(frame, 732, 10);
	const panel_top = lerp(270, 36, settle);
	const panel_bottom = lerp(1080, 120, settle);
	const lift = ramp(frame, 732, 8);
	const claim_x = lerp(936 + tx, 41, lift);
	const claim_y = lerp(612 + ty, 42, lift);
	const handoff = ramp(frame, 732, 4, clamp01);
	const grow = ramp(frame, 732, 12);

	const glide = pointer_path(clamp01((frame - 718) / 10));

	return (
		<div style={{ position: 'absolute', inset: 0, backgroundColor: DARK.bg, overflow: 'hidden', clipPath: wipe(frame) }}>
			{between(622, 689) ? (
				<Crop src={frame < 625 ? shot('ask_thinking') : shot('ask_stream', flip(frame, 625, 661, STREAM))} rect={[268, 151, 640, 158]} s={3} x={15} y={301} />
			) : null}
			{/* Above the answer crop, whose page would otherwise hide "what you saved." from 622 with its exit only half done. */}
			{between(566, 624) ? <Slit text="Ask about" x={67} baseline={290} size={180} color={DARK.ink} from={566} out={618} /> : null}
			{between(575, 624) ? <Slit text="what you saved." right={1848} baseline={490} size={180} color={DARK.accent} from={575} out={618} /> : null}
			{between(622, 695) ? (
				<Crop
					src={frame < 625 ? shot('ask_thinking') : frame < 689 ? shot('ask_stream', flip(frame, 625, 661, STREAM)) : shot('ask_done')}
					rect={[950, 88, 294, 47]}
					s={3}
					x={966}
					y={120 - ramp(frame, 689, 6, inCubic) * 300}
					style={{ opacity: bubble_in }}
				/>
			) : null}
			{between(575, 628) ? (
				<Crop
					src={shot('ask_typing', Math.min(frame - 574, 43))}
					rect={[268, 656, 616, 48]}
					s={3}
					x={72 + 897 * travel}
					y={650 + 24 * (1 - ramp(frame, 575, 8)) - 531.5 * travel}
					style={{
						opacity: ramp(frame, 575, 8),
						// From the whole composer down to the words, leaving the caret behind. Lighten
						// drops the field's fill, so only the words cross the type and land on the bubble.
						clipPath: `inset(${45 * shrink}px ${1018 * shrink}px ${45 * shrink}px ${39 * shrink}px round 12px)`,
						mixBlendMode: 'lighten'
					}}
				/>
			) : null}

			{between(695, 736) ? <Slit text="Answers with citations." x={68} baseline={196} size={168} color={DARK.ink} from={695} out={732} outDur={4} /> : null}

			{frame >= 693 ? <div style={{ position: 'absolute', left: 0, right: 0, top: panel_top, height: panel_bottom - panel_top, backgroundColor: DARK.surface, opacity: ramp(frame, 693, 8) }} /> : null}
			{between(689, 736) ? (
				<div style={{ position: 'absolute', inset: 0, clipPath: `inset(270px 0 ${1080 - panel_bottom}px 0)` }}>
					<Crop src={shot('ask_done')} rect={[0, 0, 1280, 720]} s={3} x={tx} y={ty} style={{ filter: `blur(${7 * dim}px)`, opacity: lerp(1, 0.32, dim) * (1 - handoff) }} />
				</div>
			) : null}

			{/* Under the bands, so its first frames rise from behind the ground instead of printing on it. */}
			{frame >= 747 ? <Slit text="to the source." x={40} baseline={940} size={220} color={DARK.accent} from={747} /> : null}
			<Strata bands={DARKBANDS} />

			{between(689, 736) ? (
				<Crop
					src={shot(frame < 722 ? 'ask_done' : 'ask_hover')}
					rect={[838, 305, 174, 32]}
					s={3}
					x={2514 + tx}
					y={915 + ty}
					style={{ opacity: 1 - handoff, transform: `scale(${between(718, 726) ? 1 + 0.06 * Math.sin((Math.PI * (frame - 718)) / 8) : 1})` }}
				/>
			) : null}

			{frame >= 732 ? (
				// Lighten, because the memo's background is the page's and must not box it while the panel is still under it.
				<div style={{ position: 'absolute', left: 0, top: 0, transformOrigin: '0 0', transform: `translate(${lerp(1074, 44, grow)}px, ${lerp(600, 150, grow)}px) scale(${lerp(0.28, 1, grow)})`, opacity: handoff, mixBlendMode: 'lighten' }}>
					<Crop src={shot('item_memo')} rect={[268, 142, 706, 136]} s={2.6} x={0} y={0} />
				</div>
			) : null}

			{frame >= 689 ? (
				// Opens from "so get a space..." (logical x 575) to the whole line as it rises.
				<Crop src={shot('ask_done')} rect={[312, 204, 574, 24]} s={3} x={claim_x} y={claim_y} style={{ clipPath: `inset(0 0 0 ${789 * (1 - lift)}px)` }} />
			) : null}
			{/* The [4] ring and the claim's ring share a 16 px gap between "ahead" and "[", so this one sits 3 px in from the spec and centres on the lines. */}
			<Ring x={claim_x + 1653} y={claim_y + 3} width={68} height={63} radius={12} color={DARK.accent} from={704} />
			{between(711, 736) ? (
				<div style={{ position: 'absolute', inset: 0, opacity: 1 - handoff }}>
					<Rule x1={1183} y1={363} x2={1183} y2={600} color={DARK.accent} from={711} dur={7} />
				</div>
			) : null}

			{frame >= 738 ? <Rule x1={1728} y1={108} x2={1728} y2={372} color={DARK.accent} from={738} dur={8} /> : null}
			<Ring x={1140} y={45} width={547} height={63} radius={12} color={DARK.accent} from={747} />
			<Ring x={1616} y={372} width={266} height={60} radius={12} color={DARK.accent} from={761} />
			<Ring x={38} y={444} width={281} height={60} radius={12} color={DARK.accent} from={771} dur={4} />

			{frame >= 738 ? <Slit text="Right back" x={28} baseline={720} size={220} color={DARK.ink} from={738} /> : null}

			{between(718, 733) ? (
				<div style={{ position: 'absolute', inset: 0, opacity: ramp(frame, 718, 3, clamp01) }}>
					<Pointer x={lerp(1700, 1424, glide)} y={lerp(960, 664, glide)} press={ramp(frame, 728, 4)} />
				</div>
			) : null}
		</div>
	);
};
