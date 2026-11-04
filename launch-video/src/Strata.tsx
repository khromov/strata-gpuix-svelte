import { useCurrentFrame } from 'remotion';

export interface Band {
	color: string;
	/** Height of this layer in pixels. */
	height: number;
	/** 0 is below the frame, 1 is resting in place. */
	rise?: number;
}

const WIDTH = 1920;
const HEIGHT = 1080;

/**
 * The product's namesake: sediment layers stacked from the bottom of the frame, the first band
 * at the bottom. Each top edge is a slow wave of its own, so the layers read as ground.
 */
export const Strata: React.FC<{ bands: Band[] }> = ({ bands }) => {
	const frame = useCurrentFrame();
	let top = HEIGHT;
	const layers = bands.map((band, i) => {
		const rise = band.rise ?? 1;
		top -= band.height * rise;
		const points: string[] = [`0,${HEIGHT}`];
		for (let x = 0; x <= WIDTH; x += 48) {
			const wave = Math.sin(x / (230 + i * 40) + i * 1.7 + frame / 70) * (9 + i * 2) + Math.sin(x / 91 + i * 2.3) * 3;
			points.push(`${x},${(top + wave).toFixed(1)}`);
		}
		points.push(`${WIDTH},${HEIGHT}`);
		return { color: band.color, points: points.join(' ') };
	});
	return (
		<svg width={WIDTH} height={HEIGHT} style={{ position: 'absolute', left: 0, top: 0 }}>
			{/* The topmost band is drawn first, so each lower layer sits in front of the one above it. */}
			{layers.reverse().map((layer, i) => (
				<polygon key={i} points={layer.points} fill={layer.color} />
			))}
		</svg>
	);
};
