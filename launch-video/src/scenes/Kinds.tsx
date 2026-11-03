import { useCurrentFrame } from 'remotion';
import { LIGHT } from '../../../lib/theme';
import { Crop, lerp, ramp, shot, Slit } from '../kit';

const LABEL = 123;
const REST = 88;
const SCALE = 1.8;
/** The app's card corner in logical pixels. */
const CARD_RADIUS = 12;

interface PaneProps {
	x: number;
	y: number;
	width: number;
	height: number;
	color: string;
	label: string;
	/** The frame its label rises. */
	from: number;
	/** The frame the next pane arrives, when this one eases to rest. */
	rest: number;
	seq: string;
	/** Where in the capture the panel's top-left corner sits. */
	lx: number;
	ly: number;
}

/** One kind: its field, its label and a panel of its real page, which a shrinking pane only crops. */
const Pane: React.FC<PaneProps> = ({ x, y, width, height, color, label, from, rest, seq, lx, ly }) => {
	const frame = useCurrentFrame();
	const settled = ramp(frame, rest, 10);
	const py = lerp(196, 150, settled);
	return (
		<div style={{ position: 'absolute', left: x, top: y, width, height, overflow: 'hidden', backgroundColor: color }}>
			<div style={{ position: 'absolute', left: 0, top: 0, transform: `scale(${lerp(1, REST / LABEL, settled)})`, transformOrigin: '34px 28px' }}>
				<Slit text={label} x={34} baseline={28 + LABEL * 0.875} size={LABEL} color={LIGHT.bg} from={from} />
			</div>
			<Crop src={shot(seq)} rect={[lx, ly, Math.max(0, width - 120) / SCALE, Math.max(0, height - py) / SCALE]} s={SCALE} x={120} y={py} radius="18px 0 0 0" style={{ backgroundColor: LIGHT.bg }} />
		</div>
	);
};

/** The animated 4-split: one new seam per beat, until the frame is an even 2x2. */
export const Kinds: React.FC = () => {
	const frame = useCurrentFrame();

	// The Links pane opens around the card that flew out of the sentence.
	const open = ramp(frame, 275, 10);
	const corner = lerp(CARD_RADIUS * 2.4, 0, open);
	const clip = `inset(${lerp(400, 0, open)}px 0 ${lerp(391, 0, open)}px ${lerp(570, 0, open)}px round ${corner}px 0 0 ${corner}px)`;
	const card_s = lerp(2.4, SCALE, open);
	const card_x = lerp(570, 141.6, open);
	const card_r = CARD_RADIUS * card_s;

	const images = ramp(frame, 290, 10);
	const memos = ramp(frame, 304, 10);
	const feeds = ramp(frame, 318, 10);
	const top_h = lerp(1080, 536, memos);

	return (
		<>
			<div style={{ position: 'absolute', inset: 0, backgroundColor: LIGHT.bg, clipPath: open < 1 ? clip : undefined }}>
				<Pane x={0} y={0} width={lerp(1920, 956, images)} height={top_h} color={LIGHT.info} label="Links." from={279} rest={290} seq="kind_links" lx={256} ly={105} />
				{frame >= 290 ? <Pane x={lerp(1920, 964, images)} y={0} width={lerp(0, 956, images)} height={top_h} color={LIGHT.plum} label="Images." from={294} rest={304} seq="kind_images" lx={256} ly={105} /> : null}
				{frame >= 304 ? <Pane x={0} y={lerp(1080, 544, memos)} width={lerp(1920, 956, feeds)} height={lerp(0, 536, memos)} color={LIGHT.teal} label="Voice memos." from={308} rest={318} seq="kind_audio" lx={256} ly={105} /> : null}
				{frame >= 318 ? <Pane x={lerp(1920, 964, feeds)} y={544} width={lerp(0, 956, feeds)} height={536} color={LIGHT.accentDeep} label="Feeds." from={322} rest={332} seq="kind_feeds_options" lx={256} ly={160} /> : null}
				{/* The card is on its way here: until it lands, its twin in the page would show as a second copy. */}
				{frame < 285 ? <div style={{ position: 'absolute', left: 140, top: 216, right: 0, height: 220, backgroundColor: LIGHT.bg }} /> : null}
			</div>
			{frame < 285 ? (
				<Crop
					src={shot('link_saving', 14)}
					// Widens as it flies so its right edge stays off frame. The two captures of this card are pixel-identical at full width.
					rect={[268, 268, (1920 - card_x) / card_s, 120.5]}
					s={card_s}
					x={card_x}
					y={lerp(400, 217.6, open)}
					radius={`${card_r}px 0 0 ${card_r}px`}
					// None at 275, where the same card's shadow in the Anything layer is still showing.
					shadow={open > 0 ? `0 14px 36px rgba(42, 37, 31, ${0.14 * (1 - open)})` : undefined}
				/>
			) : null}
		</>
	);
};
