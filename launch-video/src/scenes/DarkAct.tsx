import { Easing, useCurrentFrame } from 'remotion';
import { DARK, LIGHT } from '../../../lib/theme';
import { Crop, Pointer, Ring, Rule, Slit, Veil, clamp01, flip, inCubic, inOutCubic, lerp, ramp, ranges, shot } from '../kit';
import { Strata } from '../Strata';

/**
 * Ask, answer, citations and source: 561-789, one unbroken dark layer. The scenes hand their parts
 * to each other (the composer becomes the bubble, the answer pans to its citation, the claim line
 * and its ring travel into the strip), so they share one timeline here instead of four components.
 * One read at a time: each new piece of text arrives once the last has been read, and what has
 * been read steps back to 0.4.
 */

/** Moss, gold, teal and a dark teal cap: the dark act's ground and the end card's. */
const DARKBANDS = [
	{ color: LIGHT.accentDeep, height: 30 },
	{ color: DARK.ochre, height: 22 },
	{ color: DARK.teal, height: 24 },
	{ color: DARK.tealSoft, height: 24 }
];

// The stream captures that show raw markdown asterisks are skipped.
const STREAM = ranges([1, 10], [13, 30], [37, 64]);

const pointer_path = Easing.bezier(0.3, 0, 0.1, 1);

/** Presentation only: dims a dark card's text toward the card's own fill. Darken leaves the darker page around it untouched. */
const VEIL: React.CSSProperties = { position: 'absolute', inset: 0, backgroundColor: DARK.surface, mixBlendMode: 'darken', opacity: 0.72 };

/** Where the sharp claim starts inside its crop, in frame px: "at" of "at least three weeks ahead [4]." is logical x 680.5, "space" ends at 676. */
const CLAIM_CLIP = 1098;

/** What has been read steps back to this. */
const READ = 0.4;

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

	// 566-604 the headline is the only text; 597 the composer rises empty; 604-630 the question types and the headline steps back.
	const asked = ramp(frame, 604, 8);
	// 632-642: composer text onto bubble text, measured glyph to glyph on the captures.
	const travel = ramp(frame, 632, 10);
	const shrink = ramp(frame, 632, 4);
	// The bubble comes up under the words, weighted late, so its copy stays a ghost while they are
	// still apart. They stay solid until they land, which their layer ending at 642 does exactly.
	const bubble_in = clamp01((frame - 636) / 6) ** 3;
	// 661: the claim lights in the veiled answer, and the question steps back.
	const claim_on = ramp(frame, 661, 6);

	// 689-703: the pan, rounded so the sharp crops and the base under them never disagree by a pixel.
	const pan = ramp(frame, 689, 14);
	const tx = Math.round(lerp(-789, -1440, pan));
	const ty = Math.round(lerp(-152, -315, pan));
	// One frame ahead of the swap to ask_done at 689, so its citation chips arrive already blurred (2.9 px) instead of readable under the veil.
	const dim = ramp(frame, 688, 6);

	// 732 on: the panel settles into the strip, the claim and its ring ride into it.
	const settle = ramp(frame, 732, 10);
	const panel_top = lerp(270, 36, settle);
	const panel_bottom = lerp(1080, 120, settle);
	const lift = ramp(frame, 732, 8);
	const claim_x = lerp(936 + tx, 72, lift);
	const claim_y = lerp(612 + ty, 42, lift);
	const handoff = ramp(frame, 732, 4, clamp01);
	const grow = ramp(frame, 732, 12);
	// 753: the proof is done, and steps back for the headline.
	const proof = lerp(1, READ, ramp(frame, 753, 8));

	const glide = pointer_path(clamp01((frame - 718) / 10));

	return (
		<div style={{ position: 'absolute', inset: 0, backgroundColor: DARK.bg, overflow: 'hidden', clipPath: wipe(frame) }}>
			{between(636, 689) ? (
				<Crop src={frame < 639 ? shot('ask_thinking') : shot('ask_stream', flip(frame, 639, 661, STREAM))} rect={[268, 151, 640, 158]} s={3} x={15} y={301}>
					<div style={VEIL} />
				</Crop>
			) : null}
			{/* Leaves as the typing ends (628-634), so it is gone before the question flies up through it from 632 and before the answer crop arrives at 636. */}
			{between(566, 634) ? <Slit text="Ask about" x={67} baseline={290} size={180} color={DARK.ink} from={566} out={628} style={{ opacity: lerp(1, READ, asked) }} /> : null}
			{between(575, 634) ? <Slit text="what you saved." right={1848} baseline={490} size={180} color={DARK.accent} from={575} out={628} style={{ opacity: lerp(1, READ, asked) }} /> : null}
			{between(636, 695) ? (
				<Crop
					src={frame < 639 ? shot('ask_thinking') : frame < 689 ? shot('ask_stream', flip(frame, 639, 661, STREAM)) : shot('ask_done')}
					rect={[950, 88, 294, 47]}
					s={3}
					x={966}
					y={120 - ramp(frame, 689, 6, inCubic) * 300}
					style={{ opacity: bubble_in * lerp(1, READ, claim_on) }}
				/>
			) : null}
			{between(597, 642) ? (
				<Crop
					// Empty, its real placeholder, while it rises; then 43 captures over 26 frames, holding the last.
					src={frame < 604 ? shot('ask_empty') : shot('ask_typing', flip(frame, 604, 630, 43))}
					rect={[268, 656, 616, 48]}
					s={3}
					x={72 + 897 * travel}
					y={650 + 24 * (1 - ramp(frame, 597, 8)) - 531.5 * travel}
					style={{
						opacity: ramp(frame, 597, 8),
						// From the whole composer down to the words, leaving the caret behind. Lighten
						// drops the field's fill, so only the words cross the type and land on the bubble.
						clipPath: `inset(${45 * shrink}px ${1018 * shrink}px ${45 * shrink}px ${39 * shrink}px round 12px)`,
						mixBlendMode: 'lighten'
					}}
				/>
			) : null}

			{between(704, 736) ? <Slit text="Answers with citations." x={68} baseline={196} size={168} color={DARK.ink} from={704} out={732} outDur={4} /> : null}

			{/* Fills in exactly as the answer base fades, so the base never thins over the bare page. */}
			{frame >= 689 ? <div style={{ position: 'absolute', left: 0, right: 0, top: panel_top, height: panel_bottom - panel_top, backgroundColor: DARK.surface, opacity: dim }} /> : null}
			{frame >= 689 ? (
				// The answer, blurred and dimmed under the sharp claim. From 732 it rides with the claim into the strip, so the strip is the citation's own line.
				<div style={{ position: 'absolute', inset: 0, clipPath: `inset(${panel_top}px 0 ${1080 - panel_bottom}px 0)` }}>
					<Crop src={shot('ask_done')} rect={[0, 0, 1280, 720]} s={3} x={claim_x - 936} y={claim_y - 612} style={{ filter: `blur(${7 * dim}px)`, opacity: lerp(1, 0.32, dim) * proof }}>
						{/* Carries the answer's veil over the cut from the stream, until blur and dim take over. */}
						<div style={{ ...VEIL, opacity: 0.72 * (1 - dim) }} />
					</Crop>
				</div>
			) : null}

			{/* Under the bands, so its first frames rise from behind the ground instead of printing on it. */}
			{frame >= 754 ? <Slit text="to the source." x={67} baseline={909} size={220} color={DARK.accent} from={754} lip={0.41} /> : null}
			<Strata bands={DARKBANDS} />

			{between(704, 736) ? (
				// The sharp [4] chip lights with the [4] ring and the headline at 704, an echo; until then its blurred base copy stands in.
				<Crop
					src={shot(frame < 722 ? 'ask_done' : 'ask_hover')}
					rect={[838, 305, 174, 32]}
					s={3}
					x={2514 + tx}
					y={915 + ty}
					style={{ opacity: ramp(frame, 704, 6) * (1 - handoff), transform: `scale(${between(718, 726) ? 1 + 0.06 * Math.sin((Math.PI * (frame - 718)) / 8) : 1})` }}
				/>
			) : null}

			{frame >= 732 ? (
				// Lighten, because the memo's background is the page's and must not box it while the panel is still under it.
				<div style={{ position: 'absolute', left: 0, top: 0, transformOrigin: '0 0', transform: `translate(${lerp(1074, 72, grow)}px, ${lerp(600, 150, grow)}px) scale(${lerp(0.291, 1, grow)})`, opacity: handoff * proof, mixBlendMode: 'lighten' }}>
					<Crop src={shot('item_memo')} rect={[268, 166, 706, 112]} s={2.5} x={0} y={0}>
						{/* Everything in the transcript but the words the claim cites. */}
						<Veil src={shot('item_memo')} rect={[268, 166, 706, 112]} s={2.5} box={[0, 152.5, 1510, 62.5]} color={DARK.bg} />
					</Crop>
				</div>
			) : null}

			{frame >= 661 ? (
				// Sits exactly on the veiled answer's line until the pan, so it lights in place: "at least three weeks ahead [4]."
				<Crop src={shot('ask_done')} rect={[312, 204, 574, 24]} s={3} x={claim_x} y={claim_y} style={{ clipPath: `inset(0 0 0 ${CLAIM_CLIP}px)`, opacity: claim_on * proof }} />
			) : null}
			<div style={{ position: 'absolute', inset: 0, opacity: proof }}>
				{/* "[4]." alone until 738: its left stroke splits the 18 px gap between "ahead" and "[", about 7 px a side. */}
				<Ring x={claim_x + 1649} y={claim_y + 1} width={76} height={67} radius={14} color={DARK.accent} from={704} until={738} />
				{frame >= 738 ? <Rule x1={1759} y1={110} x2={1759} y2={297} color={DARK.accent} from={738} dur={6} /> : null}
				{/* Then one ring around the whole cited line, with 13-15 px of air: two rings cannot both breathe in that 18 px gap. */}
				<Ring x={1163} y={43} width={640} height={67} radius={16} color={DARK.accent} from={738} dur={6} />
				{/* Centred on the cited words, about 11-13 px each side and 14-16 px above and below. */}
				<Ring x={1576} y={297} width={271} height={67} radius={16} color={DARK.accent} from={744} dur={6} />
				<Ring x={58} y={364} width={286} height={67} radius={16} color={DARK.accent} from={750} dur={3} />
			</div>
			{between(711, 736) ? (
				<div style={{ position: 'absolute', inset: 0, opacity: 1 - handoff }}>
					<Rule x1={1183} y1={365} x2={1183} y2={600} color={DARK.accent} from={711} dur={7} />
				</div>
			) : null}

			{frame >= 747 ? <Slit text="Right back" x={54} baseline={677} size={220} color={DARK.ink} from={747} /> : null}

			{between(718, 733) ? (
				<div style={{ position: 'absolute', inset: 0, opacity: ramp(frame, 718, 3, clamp01) }}>
					<Pointer x={lerp(1600, 1424, glide)} y={lerp(1000, 664, glide)} press={ramp(frame, 728, 4)} />
				</div>
			) : null}
		</div>
	);
};
