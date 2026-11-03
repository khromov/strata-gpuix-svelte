import { Img, spring, useCurrentFrame } from 'remotion';
import { LIGHT } from '../../../lib/theme';
import { Chip, Ring, Slit, clamp01, lerp, photo, ramp } from '../kit';
import { Mark, MARK_HIGH } from '../Mark';

/** The cow's silhouette in the photo's own 800x600 pixels, traced by hand. */
const COW_POINTS = '0,284 20,300 34,312 38,296 46,276 60,266 80,262 105,260 135,263 165,268 195,274 225,280 255,285 285,290 315,292 335,289 345,287 360,283 380,279 398,281 412,290 424,305 432,325 438,345 441,370 441,600 0,600';
const COW_MASK = `url("data:image/svg+xml,${encodeURIComponent(
	`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 800 600' width='1920' height='1440'><filter id='b'><feGaussianBlur stdDeviation='1'/></filter><polygon filter='url(#b)' fill='white' points='${COW_POINTS}'/></svg>`
)}")`;

/**
 * The film's peak: the cow's mosaic cell grows to full bleed, and the cow's back stands in front
 * of the type. The hush from 518 is one slow scale of everything together.
 */
export const Cow: React.FC = () => {
	const frame = useCurrentFrame();
	const grow = ramp(frame, 504, 14);
	const width = lerp(480, 1920, grow);
	const top = lerp(720, -180, grow);
	const k = width / 480;
	const scale = lerp(1, 1.015, clamp01((frame - 518) / 43));
	const pop = spring({ frame: frame - 532, fps: 30, config: { damping: 13, stiffness: 170 } });
	return (
		<>
		<div style={{ position: 'absolute', inset: 0, transform: `scale(${scale})`, transformOrigin: '960px 540px' }}>
			<Img src={photo(200)} style={{ position: 'absolute', left: 0, top, width, height: width * 0.75, maxWidth: 'none' }} />
			{/* Mosaic's ring on this cell would vanish behind the photo at 504, so its fade finishes here, growing with the cell. */}
			{frame < 508 ? <Ring x={7 * k} y={top + 7 * k} width={466 * k} height={346 * k} radius={7} color={LIGHT.bg} strokeWidth={6} from={490} until={504} /> : null}
			<Slit text="No tags." x={64} baseline={150} size={104} color={LIGHT.ink} from={510} />
			{frame >= 518 ? (
				<>
					<Slit text="It saw the cow." x={58} baseline={480} size={264} color={LIGHT.ink} from={518} lip={6 / 264} />
					<Img
						src={photo(200)}
						style={{
							position: 'absolute',
							left: 0,
							top: -180,
							width: 1920,
							height: 1440,
							maxWidth: 'none',
							maskImage: COW_MASK,
							WebkitMaskImage: COW_MASK,
							maskSize: '1920px 1440px',
							WebkitMaskSize: '1920px 1440px',
							maskRepeat: 'no-repeat',
							WebkitMaskRepeat: 'no-repeat'
						}}
					/>
				</>
			) : null}
			{frame >= 532 ? <Chip text="IMG_4721.jpg" cx={1440} cy={985} tilt={-4} lit={1} pop={pop} /> : null}
		</div>
		{/* The mark on the photo, revealed by the growing cell's own edge and kept out of the hush's scale so it never drifts. */}
		<div style={{ position: 'absolute', left: 0, top, width, height: width * 0.75, overflow: 'hidden' }}>
			<div style={{ position: 'absolute', left: 0, top: -top, width: 1920, height: 1080 }}>
				<Mark baseline={MARK_HIGH} color={LIGHT.inkMuted} />
			</div>
		</div>
		</>
	);
};
