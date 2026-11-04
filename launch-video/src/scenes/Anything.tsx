import { spring, useCurrentFrame } from 'remotion';
import { LIGHT } from '../../../lib/theme';
import { Crop, flip, lerp, ramp, shot, Sheet, Slit } from '../kit';
import { Strata } from '../Strata';

const SHADOW = '0 14px 36px rgba(42, 37, 31, 0.14)';
const FOOT = [{ color: LIGHT.ochre, height: 18 }];
/** The app's card corner in logical pixels. A smaller crop radius leaves page colour outside the real border. */
const CARD_RADIUS = 12;
/** The hook chips' spring. */
const POP = { damping: 13, stiffness: 170 };

interface TileProps {
	at: number;
	src: string;
	rect: [number, number, number, number];
	s: number;
	x: number;
	radius?: number;
}

const Tile: React.FC<TileProps> = ({ at, src, rect, s, x, radius = 30 }) => {
	const frame = useCurrentFrame();
	if (frame < at) return null;
	const pop = spring({ frame: frame - at, fps: 30, config: POP });
	return <Crop src={src} rect={rect} s={s} x={x} y={724} radius={radius} shadow={SHADOW} style={{ transform: `scale(${pop})`, opacity: Math.min(1, pop * 4) }} />;
};

/** The one spread with no screenshot: real items sit inside the sentence. */
export const Anything: React.FC = () => {
	const frame = useCurrentFrame();

	// Starts on the Pour page's own card, so 218 is the same picture as 217.
	const lift = ramp(frame, 218, 12);
	const note_s = lerp(3, 2.4, lift);
	const note_x = lerp(72, 928, lift);
	const note_y = lerp(800, 104, lift);
	const note_r = CARD_RADIUS * note_s;

	const link_open = ramp(frame, 233, 10);
	const link_capture = frame < 247 ? 1 : frame < 257 ? flip(frame, 247, 257, [3, 4, 5, 6]) : 14;
	const link_h = lerp(100.5, 120.5, ramp(frame, 247, 4));

	return (
		<>
			{/* The card has left the Pour page: without this its twin stays behind it until the sheet arrives. */}
			{frame > 218 ? <div style={{ position: 'absolute', left: 68, top: 796, right: 0, bottom: 0, backgroundColor: LIGHT.bg }} /> : null}
			<Sheet color={LIGHT.ochreSoft} from={218} dur={10}>
				<Strata bands={FOOT} />
				<Slit text="A thought," x={68} baseline={270} size={176} color={LIGHT.ink} from={224} />
				<Slit text="a link," x={66} baseline={590} size={176} color={LIGHT.ink} from={233} />
				<Slit text="anything." x={66} baseline={910} size={176} color={LIGHT.ink} from={247} />
				{link_open > 0 ? <Crop src={shot('link_saving', link_capture)} rect={[268, 268, 563 * link_open, link_h]} s={2.4} x={586} y={400} radius={`${CARD_RADIUS * 2.4}px 0 0 ${CARD_RADIUS * 2.4}px`} shadow={SHADOW} /> : null}
				<Tile at={251} src={shot('kind_images')} rect={[279, 128, 128, 128]} s={1.8125} x={848} radius={29} />
				{/* The icon's own corner is 10 logical px; at 30 the card's colour shows outside it. */}
				<Tile at={254} src={shot('timeline_light')} rect={[283, 283, 60, 60]} s={232 / 60} x={1104} radius={(232 / 60) * 10} />
				<Tile at={257} src={shot('kind_images')} rect={[505, 128, 128, 128]} s={1.8125} x={1360} radius={29} />
				<Tile at={260} src={shot('kind_images')} rect={[310, 318, 128, 128]} s={1.8125} x={1616} radius={29} />
			</Sheet>
			<Crop
				src={shot('note_saved', 3)}
				rect={[268, 268, (1920 - note_x) / note_s, 100.5]}
				s={note_s}
				x={note_x}
				y={note_y}
				radius={`${note_r}px 0 0 ${note_r}px`}
				shadow={`0 14px 36px rgba(42, 37, 31, ${0.14 * lift})`}
			/>
		</>
	);
};
