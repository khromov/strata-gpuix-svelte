import { interpolateColors, spring, useCurrentFrame } from 'remotion';
import { LIGHT } from '../../../lib/theme';
import { Crop, Ring, Rule, Sheet, Slit, flip, lerp, ramp, shot } from '../kit';
import { Strata } from '../Strata';

/** The mark the app puts on a match, sampled from a capture. */
const HIGHLIGHT = '#e4ceaa';
const CARD_SHADOW = '0 8px 24px rgba(42, 37, 31, 0.1)';
const FIELD_RADIUS = '33px 0 0 33px';
const CARD_RADIUS = '30px 0 0 30px';
const MEANING_TYPING = Array.from({ length: 9 }, (_, i) => 1 + i * 3);

/** Real lines of search_keyword/0004, each placed so its Elgol highlight sits on axis x 1152.5. */
const STRIPS: Array<{ y: number; x: number; rect: [number, number, number, number]; land: number }> = [
	{ y: 280, x: 888, rect: [472, 194, 106, 24], land: 418 },
	{ y: 470, x: 897.5, rect: [709, 306, 279, 24], land: 425 },
	{ y: 660, x: 1098.5, rect: [803, 438, 201, 24], land: 432 }
];
const STRIP_LEFT = 885;

/**
 * The search box's flipbook. Typing captures are on the Everything page, where the field starts
 * at logical 442; settled ones are on the Search page, where it starts at 490. Cropping from each
 * page's own start keeps the field and the query still across the swap.
 */
function field_capture(frame: number): { src: string; left: number } {
	if (frame < 375) return { src: shot('search_meaning_typing', flip(frame, 367, 375, MEANING_TYPING)), left: 442 };
	if (frame < 404) return { src: shot('search_meaning', 4), left: 490 };
	if (frame < 413) return { src: shot('search_keyword_typing', flip(frame, 404, 413, 5)), left: 442 };
	return { src: shot('search_keyword', 4), left: 490 };
}

const Words: React.FC<{ frame: number }> = ({ frame }) => {
	const meaning = interpolateColors(frame, [404, 410], [LIGHT.ink, LIGHT.accent]);
	const keyword = interpolateColors(frame, [404, 410], [LIGHT.accent, LIGHT.ink]);
	const picture = interpolateColors(frame, [432, 438], [LIGHT.accent, LIGHT.ink]);
	const slide = ramp(frame, 404, 8);
	return (
		<>
			{frame >= 375 ? (
				<div
					style={{
						position: 'absolute',
						left: 208,
						top: lerp(226, 366, slide),
						width: lerp(509, 505, slide) * ramp(frame, 375, 8),
						height: 110,
						borderRadius: 10,
						backgroundColor: HIGHLIGHT
					}}
				/>
			) : null}
			<Slit text="Search" x={67} baseline={172} size={120} color={LIGHT.ink} from={366} />
			<Slit text="by meaning," x={63} baseline={312} size={120} color={meaning} from={368} />
			<Slit text="by keyword," x={63} baseline={452} size={120} color={keyword} from={370} />
			<Slit text="and by what is" x={68} baseline={592} size={120} color={picture} from={372} />
			<Slit text="in a picture." x={64} baseline={712} size={120} color={picture} from={375} />
		</>
	);
};

const MeaningProof: React.FC<{ frame: number }> = ({ frame }) => {
	if (frame < 375 || frame >= 410) return null;
	const card = (from: number) => {
		const shown = ramp(frame, from, 10);
		return { opacity: shown, transform: `translateY(${(1 - shown) * 28}px)` };
	};
	const drop = ramp(frame, 404, 6);
	return (
		<div style={{ position: 'absolute', inset: 0, opacity: 1 - drop, transform: `translateY(${drop * 40}px)` }}>
			<Crop src={shot('search_meaning', 4)} rect={[268, 134, 314, 122]} s={3} x={980} y={254} radius={CARD_RADIUS} shadow={CARD_SHADOW} style={card(375)} />
			<Crop src={shot('search_meaning', 4)} rect={[268, 265.5, 314, 122]} s={3} x={980} y={650} radius={CARD_RADIUS} shadow={CARD_SHADOW} style={card(378)} />
			{/* The spec's rects are the rings' outer edges; Ring takes the stroke's centre line. */}
			<Ring x={1373} y={509} width={204} height={72} radius={20} color={LIGHT.accent} from={390} />
			<Ring x={1388} y={906} width={210} height={72} radius={20} color={LIGHT.accent} from={390} />
		</div>
	);
};

const KeywordProof: React.FC<{ frame: number }> = ({ frame }) => {
	if (frame < 408) return null;
	const pop = spring({ frame: frame - 432, fps: 30, config: { damping: 13, stiffness: 170 } });
	return (
		<>
			<Rule x1={1152.5} y1={202} x2={1152.5} y2={850} color={LIGHT.accent} from={410} dur={26} strokeWidth={4} dots={false} />
			{STRIPS.map(({ y, x, rect, land }) => (
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
					<Crop src={shot('search_keyword', 4)} rect={rect} s={3} x={x - STRIP_LEFT} y={12} />
				</div>
			))}
			{frame >= 432 ? <Crop src={shot('search_keyword', 4)} rect={[401, 353, 61, 20]} s={3} x={1061} y={850} radius={15} style={{ transform: `scale(${0.9 + 0.1 * pop})` }} /> : null}
		</>
	);
};

/**
 * "Search by meaning, by keyword, and by what is in a picture." beside its proof. The field stops
 * at 447, where Mosaic picks up the same crop and glides it away.
 */
export const Search: React.FC = () => {
	const frame = useCurrentFrame();
	const risen = ramp(frame, 368, 8);
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
			{frame < 447 ? <Crop src={src} rect={[left, 8.5, 314, 46]} s={3} x={980} y={64} radius={FIELD_RADIUS} style={{ opacity: risen, transform: `translateY(${(1 - risen) * 24}px)` }} /> : null}
		</Sheet>
	);
};
