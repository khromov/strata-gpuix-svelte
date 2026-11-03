import { Img, useCurrentFrame } from 'remotion';
import { LIGHT } from '../../../lib/theme';
import { Crop, Ring, Sheet, Slit, flip, lerp, photo, ramp, shot } from '../kit';

/**
 * Eight real photos around the query tile. `at` is when a cell starts opening outward from the
 * tile, and `inset` is its clip-path with `c` percent still hidden on the side away from the tile.
 * `dim` is its place in the stagger when the search returns; the cow never dims.
 */
const CELLS: Array<{ id: number; x: number; y: number; at: number; dim?: number; inset: (c: number) => string }> = [
	{ id: 292, x: 0, y: 360, at: 451, dim: 0, inset: (c) => `0 0 0 ${c}%` },
	{ id: 237, x: 1440, y: 360, at: 451, dim: 1, inset: (c) => `0 ${c}% 0 0` },
	{ id: 200, x: 0, y: 720, at: 452, inset: (c) => `0 0 0 ${c}%` },
	{ id: 211, x: 1440, y: 720, at: 452, dim: 2, inset: (c) => `0 ${c}% 0 0` },
	{ id: 231, x: 480, y: 0, at: 453, dim: 3, inset: (c) => `${c}% 0 0 0` },
	{ id: 250, x: 960, y: 0, at: 453, dim: 4, inset: (c) => `${c}% 0 0 0` },
	{ id: 183, x: 0, y: 0, at: 454, dim: 5, inset: (c) => `${c}% 0 0 ${c}%` },
	{ id: 244, x: 1440, y: 0, at: 454, dim: 6, inset: (c) => `${c}% ${c}% 0 0` }
];

/** The same search box as Search's, gliding in on its last capture and then typing a new query. */
const Field: React.FC<{ frame: number }> = ({ frame }) => {
	const glide = ramp(frame, 447, 8);
	const x = lerp(980, 528, glide);
	const y = lerp(64, 612, glide);
	const radius = '33px 0 0 33px';
	if (frame < 455) return <Crop src={shot('search_keyword', 4)} rect={[490, 8.5, lerp(942, 912, glide) / 3, 46]} s={3} x={x} y={y} radius={radius} />;
	if (frame < 475) return <Crop src={shot('search_picture_typing', flip(frame, 455, 475, 9))} rect={[442, 8.5, 304, 46]} s={3} x={528} y={612} radius={radius} />;
	return <Crop src={shot('search_picture', 4)} rect={[490, 8.5, 304, 46]} s={3} x={528} y={612} radius={radius} />;
};

/** "and by what is in a picture.": the search box glides in, and the cow is what it finds. */
export const Mosaic: React.FC = () => {
	const frame = useCurrentFrame();
	const result = ramp(frame, 475, 10);
	return (
		<>
			<Sheet color={LIGHT.accentDeep} from={447} dur={8}>
				{CELLS.map(({ id, x, y, at, dim, inset }) => {
					const dimmed = dim === undefined ? 0 : ramp(frame, 475 + dim, 8);
					return (
						<Img
							key={id}
							src={photo(id)}
							style={{
								position: 'absolute',
								left: x,
								top: y,
								width: 480,
								height: 360,
								clipPath: `inset(${inset((1 - ramp(frame, at, 6)) * 100)})`,
								opacity: lerp(1, 0.18, dimmed),
								filter: dimmed > 0 ? `saturate(${lerp(1, 0.3, dimmed)})` : undefined
							}}
						/>
					);
				})}
				<Slit text="and by what is" x={524} baseline={470} size={100} color={LIGHT.bg} from={451} />
				<Slit text="in a picture." x={524} baseline={580} size={100} color={LIGHT.bg} from={454} />
			</Sheet>
			<Field frame={frame} />
			{frame >= 475 ? <Crop src={shot('search_picture', 4)} rect={[268, 134, 304, 90]} s={3} x={528} y={776} radius="30px 0 0 30px" style={{ opacity: result, transform: `translateY(${(1 - result) * 28}px)` }} /> : null}
			{/* The spec's rects are the rings' outer edges; Ring takes the stroke's centre line. Cow.tsx carries this first one on while its cell grows. */}
			<Ring x={7} y={727} width={466} height={346} radius={7} color={LIGHT.bg} strokeWidth={6} from={490} until={504} />
			<Ring x={966} y={911} width={309} height={72} radius={18} color={LIGHT.plum} from={490} until={504} />
		</>
	);
};
