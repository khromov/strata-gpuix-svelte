import { AbsoluteFill, Audio, staticFile, useCurrentFrame } from 'remotion';
import { LIGHT } from '../../lib/theme';
import { useFonts } from './fonts';
import { Anything } from './scenes/Anything';
import { Cow } from './scenes/Cow';
import { DarkAct } from './scenes/DarkAct';
import { EndCard } from './scenes/EndCard';
import { Hook } from './scenes/Hook';
import { Kinds } from './scenes/Kinds';
import { Local } from './scenes/Local';
import { DarkMark, LightMark } from './Mark';
import { Mosaic } from './scenes/Mosaic';
import { Opening } from './scenes/Opening';
import { Search } from './scenes/Search';

/**
 * Strata's promo. Every app screen is a real capture (capture/capture.ts) played back as
 * flipbooks and crops; each scene file lays those out with its own composition. The list below
 * is the stacking order, later on top, and each layer exists only while it can be seen, so a
 * scene's hand-off to the next can overlap it. Frame numbers are absolute: see timeline.ts.
 *
 * public/shots, public/music and public/photos are gitignored. Regenerate them with:
 *   bun launch-video/capture/seed.ts && bunx gpuix-svelte --bun launch-video/capture/capture.ts
 *   ffmpeg -ss 65.763 -t 31.467 -i <track> -af "afade=t=in:st=0:d=0.35,afade=t=out:st=30.17:d=1.3" -c:a aac -b:a 256k public/music/track.m4a
 *   cp ../.data/seed-corpus/picsum/{183,231,250,244,292,237,200,211}.jpg public/photos/
 */
const LAYERS: Array<{ from: number; to: number; Scene: React.FC }> = [
	{ from: 104, to: 228, Scene: Opening },
	{ from: 218, to: 285, Scene: Anything },
	{ from: 275, to: 371, Scene: Kinds },
	// The mark, low: above the opening, Anything and Kinds. Search's rising sheet covers it at 364.
	{ from: 190, to: 371, Scene: LightMark },
	{ from: 361, to: 469, Scene: Search },
	{ from: 461, to: 518, Scene: Mosaic },
	{ from: 504, to: 570, Scene: Cow },
	{ from: 561, to: 789, Scene: DarkAct },
	{ from: 789, to: 858, Scene: Local },
	// The mark, high: from the frame the wipe has cleared the corner (x 1921 at 569), under the end card's rising cover.
	{ from: 569, to: 858, Scene: DarkMark },
	{ from: 847, to: 944, Scene: EndCard },
	{ from: 0, to: 112, Scene: Hook }
];

export const LaunchVideo: React.FC = () => {
	useFonts();
	const frame = useCurrentFrame();
	return (
		<AbsoluteFill style={{ fontFamily: 'IBM Plex Sans', backgroundColor: LIGHT.bg }}>
			{LAYERS.filter((layer) => frame >= layer.from && frame < layer.to).map(({ from, Scene }) => (
				<AbsoluteFill key={from}>
					<Scene />
				</AbsoluteFill>
			))}
			<Audio src={staticFile('music/track.m4a')} />
		</AbsoluteFill>
	);
};
