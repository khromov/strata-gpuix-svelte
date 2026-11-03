import { interpolateColors, useCurrentFrame } from 'remotion';
import { LIGHT } from '../../../lib/theme';
import { Crop, Rule, Sheet, Slit, Veil, flip, lerp, ramp, shot } from '../kit';
import { Mark, MARK_HIGH } from '../Mark';
import { Strata } from '../Strata';

/** The mark the app puts on a match, sampled from a capture. */
const HIGHLIGHT = '#e4ceaa';
const CARD_SHADOW = '0 8px 24px rgba(42, 37, 31, 0.1)';
const FIELD_RADIUS = '33px 0 0 33px';
const CARD_RADIUS = '30px 0 0 30px';

/**
 * Real lines of search_keyword/0004, each placed so its Elgol highlight sits on axis x 1152.5.
 * `veils` are the words around Elgol, in the crop's own pixels (Elgol: logical 544.5-575.5,
 * 778.5-812.5 and 805.5-837).
 */
const STRIPS: Array<{ y: number; x: number; rect: [number, number, number, number]; land: number; veils: Array<[number, number, number, number]> }> = [
	{ y: 280, x: 888, rect: [472, 194, 106, 24], land: 447, veils: [[0, 0, 215, 72]] },
	{ y: 470, x: 897.5, rect: [709, 306, 279, 24], land: 451, veils: [[0, 0, 206, 72], [312, 0, 525, 72]] },
	{ y: 660, x: 1098.5, rect: [803, 438, 201, 24], land: 455, veils: [[105, 0, 498, 72]] }
];
const STRIP_LEFT = 885;

/**
 * The search box's flipbook. Typing captures are on the Everything page, where the field starts
 * at logical 442; settled ones are on the Search page, where it starts at 490. Cropping from each
 * page's own start keeps the field and the query still across the swap.
 */
function field_capture(frame: number): { src: string; left: number } {
	if (frame < 397) return { src: shot('search_meaning_typing', flip(frame, 377, 397, 26)), left: 442 };
	if (frame < 432) return { src: shot('search_meaning', 4), left: 490 };
	if (frame < 441) return { src: shot('search_keyword_typing', flip(frame, 432, 441, 5)), left: 442 };
	return { src: shot('search_keyword', 4), left: 490 };
}

/** One clause per proof: "by keyword," rises when its proof starts, and the read line turns accent. */
const Words: React.FC<{ frame: number }> = ({ frame }) => {
	const meaning = interpolateColors(frame, [432, 438], [LIGHT.ink, LIGHT.accent]);
	const slide = ramp(frame, 432, 8);
	return (
		<>
			{frame >= 375 ? (
				<div
					style={{
						position: 'absolute',
						left: 205,
						top: lerp(216, 356, slide),
						width: lerp(518, 513, slide) * ramp(frame, 375, 8),
						height: 126,
						borderRadius: 10,
						backgroundColor: HIGHLIGHT
					}}
				/>
			) : null}
			<Slit text="Search" x={67} baseline={172} size={120} color={LIGHT.ink} from={366} />
			<Slit text="by meaning," x={63} baseline={312} size={120} color={meaning} from={368} />
			<Slit text="by keyword," x={63} baseline={452} size={120} color={LIGHT.ink} from={432} />
		</>
	);
};

/** "bread that rises overnight" finds "Sourdough": the title and the loaf stay sharp, the rest of the card is veiled. */
const MeaningProof: React.FC<{ frame: number }> = ({ frame }) => {
	if (frame < 404 || frame >= 438) return null;
	const shown = ramp(frame, 404, 10);
	const drop = ramp(frame, 432, 6);
	const src = shot('search_meaning', 4);
	return (
		<div style={{ position: 'absolute', inset: 0, opacity: 1 - drop, transform: `translateY(${drop * 40}px)` }}>
			<Crop src={src} rect={[268, 134, 314, 122]} s={3} x={980} y={254} radius={CARD_RADIUS} shadow={CARD_SHADOW} style={{ opacity: shown, transform: `translateY(${(1 - shown) * 28}px)` }}>
				<Veil src={src} rect={[268, 134, 314, 122]} s={3} box={[252, 120, 690, 213]} color={LIGHT.surface} />
			</Crop>
		</div>
	);
};

const KeywordProof: React.FC<{ frame: number }> = ({ frame }) => {
	if (frame < 436) return null;
	const src = shot('search_keyword', 4);
	return (
		<>
			<Rule x1={1152.5} y1={202} x2={1152.5} y2={756} color={LIGHT.accent} from={437} dur={18} strokeWidth={4} dots={false} />
			{STRIPS.map(({ y, x, rect, land, veils }) => (
				<div
					key={y}
					style={{
						position: 'absolute',
						left: STRIP_LEFT,
						top: y,
						width: 1920 - STRIP_LEFT,
						height: 96,
						backgroundColor: LIGHT.surface,
						transform: `translateX(${(1 - ramp(frame, land - 10, 10)) * (1920 - STRIP_LEFT)}px)`
					}}
				>
					<Crop src={src} rect={rect} s={3} x={x - STRIP_LEFT} y={12}>
						{veils.map((box) => (
							<Veil key={box[0]} src={src} rect={rect} s={3} box={box} color={LIGHT.surface} />
						))}
					</Crop>
				</div>
			))}
		</>
	);
};

/**
 * "Search by meaning, by keyword," one clause per proof; the trailing comma hands the third way,
 * the picture, to the mosaic. The field stops at 461, where Mosaic picks up the same crop and
 * glides it away.
 */
export const Search: React.FC = () => {
	const frame = useCurrentFrame();
	const risen = ramp(frame, 375, 8);
	const { src, left } = field_capture(frame);
	return (
		<Sheet color={LIGHT.accentSoft} from={361} dur={10}>
			<Strata
				bands={[
					{ color: LIGHT.accentDeep, height: 26 },
					{ color: LIGHT.accent, height: 24 }
				]}
			/>
			<Words frame={frame} />
			<MeaningProof frame={frame} />
			<KeywordProof frame={frame} />
			{frame < 461 ? <Crop src={src} rect={[left, 8.5, 314, 46]} s={3} x={980} y={64} radius={FIELD_RADIUS} style={{ opacity: risen, transform: `translateY(${(1 - risen) * 24}px)` }} /> : null}
			{/* The mark rides in on the page: the sheet's wave clips it until it has passed. */}
			<Mark baseline={MARK_HIGH} color={LIGHT.inkMuted} />
		</Sheet>
	);
};
