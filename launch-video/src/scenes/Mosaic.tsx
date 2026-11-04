import { Img, useCurrentFrame } from 'remotion';
import { LIGHT } from '../../../lib/theme';
import { Crop, Ring, Sheet, flip, inOutCubic, lerp, photo, ramp, shot } from '../kit';
import { Mark, MARK_HIGH } from '../Mark';

/**
 * Eight real photos around the query tile. `at` is when a cell starts opening outward from the
 * tile, and `inset` is its clip-path with `c` percent still hidden on the side away from the tile.
 * `dim` is its place in the stagger when the search returns; the cow never dims.
 */
const CELLS: Array<{ id: number; x: number; y: number; at: number; dim?: number; inset: (c: number) => string }> = [
	{ id: 292, x: 0, y: 360, at: 465, dim: 0, inset: (c) => `0 0 0 ${c}%` },
	{ id: 237, x: 1440, y: 360, at: 465, dim: 1, inset: (c) => `0 ${c}% 0 0` },
	{ id: 200, x: 0, y: 720, at: 466, inset: (c) => `0 0 0 ${c}%` },
	{ id: 211, x: 1440, y: 720, at: 466, dim: 2, inset: (c) => `0 ${c}% 0 0` },
	{ id: 231, x: 480, y: 0, at: 467, dim: 3, inset: (c) => `${c}% 0 0 0` },
	{ id: 250, x: 960, y: 0, at: 467, dim: 4, inset: (c) => `${c}% 0 0 0` },
	{ id: 183, x: 0, y: 0, at: 468, dim: 5, inset: (c) => `${c}% 0 0 ${c}%` },
	{ id: 244, x: 1440, y: 0, at: 468, dim: 6, inset: (c) => `${c}% ${c}% 0 0` }
];

/** The field and its result, centred in the 720 px query tile: (720 - 434) / 2 below its top at 360. */
const FIELD_Y = 503;
const RESULT_Y = 667;

/**
 * The same search box as Search's, gliding in on its last capture and then typing a new query.
 * It glides on the Sheet's own curve: on the fast-out default it reached "by keyword," at 463-465,
 * before the sheet had covered it, and struck through the comma.
 */
const Field: React.FC<{ frame: number }> = ({ frame }) => {
	const glide = ramp(frame, 461, 8, inOutCubic);
	const x = lerp(980, 528, glide);
	const y = lerp(64, FIELD_Y, glide);
	const radius = '33px 0 0 33px';
	if (frame < 469) return <Crop src={shot('search_keyword', 4)} rect={[490, 8.5, lerp(942, 912, glide) / 3, 46]} s={3} x={x} y={y} radius={radius} />;
	if (frame < 475) return <Crop src={shot('search_picture_typing', flip(frame, 469, 475, 9))} rect={[442, 8.5, 304, 46]} s={3} x={528} y={FIELD_Y} radius={radius} />;
	return <Crop src={shot('search_picture', 4)} rect={[490, 8.5, 304, 46]} s={3} x={528} y={FIELD_Y} radius={radius} />;
};

/** The third way to search, shown and not said: the box glides in, types "hairy cow", and the cow is what it finds. */
export const Mosaic: React.FC = () => {
	const frame = useCurrentFrame();
	const result = ramp(frame, 475, 10);
	return (
		<>
			<Sheet color={LIGHT.accentDeep} from={461} dur={8}>
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
				{/* The mark comes back once the photo under it has dimmed: cream ink on a bright hull would not read. */}
				<div style={{ position: 'absolute', inset: 0, opacity: ramp(frame, 482, 6) }}>
					<Mark baseline={MARK_HIGH} color={LIGHT.bg} />
				</div>
			</Sheet>
			<Field frame={frame} />
			{frame >= 475 ? <Crop src={shot('search_picture', 4)} rect={[268, 134, 304, 90]} s={3} x={528} y={RESULT_Y} radius="30px 0 0 30px" style={{ opacity: result, transform: `translateY(${(1 - result) * 28}px)` }} /> : null}
			{/* The spec's rect is the ring's outer edge; Ring takes the stroke's centre line. Cow.tsx carries it on while its cell grows. */}
			<Ring x={7} y={727} width={466} height={346} radius={7} color={LIGHT.bg} strokeWidth={6} from={490} until={504} />
		</>
	);
};
