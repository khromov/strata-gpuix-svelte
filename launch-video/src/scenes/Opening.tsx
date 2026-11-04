import type { CSSProperties } from 'react';
import { AbsoluteFill, Img, spring, useCurrentFrame } from 'remotion';
import { LIGHT } from '../../../lib/theme';
import { clamp01, flip, lerp, ramp, Sheet, shot, Slit } from '../kit';
import { Strata } from '../Strata';
import { FPS } from '../timeline';

const LANDING = { damping: 15, stiffness: 145, mass: 0.95 };

/**
 * in_strata and pour are one shot: a single image of the window, pushed in from the cover to one
 * column. The window is placed with a transform, not left/top/width, because Chrome snaps layout
 * boxes to whole pixels and the hold's 5 px of drift over 35 frames would visibly step.
 */
export const Opening: React.FC = () => {
	const frame = useCurrentFrame();
	const landed = spring({ frame: frame - 104, fps: FPS, config: LANDING });

	// The cover: window and name share one slow scale around the frame's centre.
	const grow = lerp(1, 1.008, clamp01((frame - 126) / 35));
	const coverS = 0.85 * grow;
	const coverX = 960 + (416 - 960) * grow;
	const coverY = 540 + (54 + 260 * (1 - landed) - 540) * grow;

	// The push: from wherever the cover ended to the column at s 3.
	const push = ramp(frame, 161, 14);
	const s = lerp(coverS, 3, push);
	const x = lerp(coverX, -732, push);
	const bump = frame >= 204 ? 6 * (1 - ramp(frame, 204, 6)) : 0;
	const y = lerp(coverY, -4, push) + bump;

	// In logical pixels: what the clip has hidden so far, the sidebar and the header.
	const clipX = 246 * push;
	const clipY = 78 * push;

	// To 203, not 204, so capture 54, the finished note, gets the last frame before the save.
	const src = frame >= 204 ? shot('note_saved', 3) : frame >= 165 ? shot('note_typing', flip(frame, 165, 203, 54)) : shot('timeline_light');

	const camera: CSSProperties = { position: 'absolute', left: 0, top: 0, width: 1280, height: 720, transform: `translate(${x}px, ${y}px) scale(${s})`, transformOrigin: '0 0' };
	const pane: CSSProperties = { position: 'absolute', left: clipX, top: clipY, width: 1280 - clipX, height: 720 - clipY, borderRadius: lerp(14, 0, push) / s };

	return (
		<AbsoluteFill style={{ backgroundColor: LIGHT.accentDeep }}>
			{/* The shadow is its own layer under the name: the window has to stay above the sheet, and cast from there it would darken the top of the type. */}
			<div style={camera}>
				<div style={{ ...pane, boxShadow: `0 ${24 / s}px ${60 / s}px rgba(0, 0, 0, ${0.28 * (1 - push)})` }} />
			</div>
			<AbsoluteFill style={{ transform: `scale(${grow})`, transformOrigin: '960px 540px' }}>
				<Slit text="In Strata." x={401} baseline={954} size={268} color={LIGHT.bg} from={118} lip={0.4} />
			</AbsoluteFill>
			{/* After the name, so the name rises from behind the sediment on its way up. */}
			<Strata bands={[{ color: LIGHT.ochre, height: 30, rise: landed }]} />
			<Sheet color={LIGHT.bg} from={161} dur={14}>
				<Slit text="Add anything." x={69} baseline={172} size={150} color={LIGHT.ink} from={175} />
			</Sheet>
			<div style={camera}>
				<div style={{ ...pane, overflow: 'hidden' }}>
					<Img src={src} style={{ position: 'absolute', left: -clipX, top: -clipY, width: 1280, height: 720, maxWidth: 'none' }} />
				</div>
			</div>
		</AbsoluteFill>
	);
};
