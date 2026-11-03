import { Img, staticFile, useCurrentFrame } from 'remotion';
import { DARK, LIGHT } from '../../lib/theme';
import { ramp, Type } from './kit';
import { beat } from './timeline';

/**
 * The identity mark: the app icon and its name, bottom right, from the frame after the cover has
 * named the app. It never moves while it is visible. In the opening, Anything and Kinds it sits
 * just above their thin grounds; from Search on it sits higher, clear of the 50 px and 100 px
 * floors, with its baseline on "locally."'s. It steps between the two only under Search's rising
 * sheet, Mosaic and Cow draw their own copies, so it is off only while the mosaic's photos are still bright (464-481), and the end card's cover hides it at 850.
 */
const SIZE = 36;
/** The word's right edge: a 58 px margin. */
const RIGHT = 1862;
/** icon.svg's rounded square is 824 of its 1024 units, so 47 px shows a 37.8 px square. */
const ICON = 47;
const ICON_LEFT = 1709;
/** The slit the mark rises through: 2 px above the icon's box to 1 px below it. */
const SLIT = 50;

export const Mark: React.FC<{ baseline: number; color: string; enter?: number }> = ({ baseline, color, enter }) => {
	const frame = useCurrentFrame();
	// The icon's square centres on the word's cap height.
	const icon_top = baseline - 36;
	const top = icon_top - 2;
	const rise = enter === undefined ? 0 : (1 - ramp(frame, enter, 8)) * SLIT * 1.3;
	return (
		<div style={{ position: 'absolute', left: 0, top, width: 1920, height: SLIT, overflow: 'hidden' }}>
			<div style={{ position: 'absolute', left: 0, top: -top, width: 1920, height: 1080, transform: `translateY(${rise}px)` }}>
				<Img src={staticFile('icon.svg')} style={{ position: 'absolute', left: ICON_LEFT, top: icon_top, width: ICON, height: ICON }} />
				<Type text="Strata" right={RIGHT} baseline={baseline} size={SIZE} weight={600} ls={-0.01} color={color} />
			</div>
		</div>
	);
};

/** Low: the light grounds before Search. */
export const MARK_LOW = 1028;
/** High: Search's page and the dark act, on "locally."'s baseline. */
export const MARK_HIGH = 953;

/** The light act's layer: rises on beat 6 (190), after "Add anything." has landed. */
export const LightMark: React.FC = () => <Mark baseline={MARK_LOW} color={LIGHT.inkMuted} enter={beat(6)} />;
/** The dark act's layer: from the frame the wipe has cleared the corner. */
export const DarkMark: React.FC = () => <Mark baseline={MARK_HIGH} color={DARK.inkMuted} />;
