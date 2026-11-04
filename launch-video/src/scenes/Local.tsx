import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { DARK } from '../../../lib/theme';
import { Crop, ramp, Ring, shot, Slit } from '../kit';

export const Local: React.FC = () => {
	const frame = useCurrentFrame();
	return (
		<AbsoluteFill style={{ backgroundColor: DARK.bg }}>
			{/* A frame ahead of bar 12: a slit shows nothing on its own first frame, and this cut lands with the word already rising. */}
			<Slit text="Everything" x={42} baseline={325} size={360} color={DARK.ink} from={788} />
			<Slit text="runs" x={45} baseline={639} size={360} color={DARK.ink} from={804} />
			<Slit text="locally." x={45} baseline={953} size={360} color={DARK.accent} from={818} />
			<Crop src={shot('settings_0', 1)} rect={[300, 154, 150, 32]} s={3.6} x={872} y={487} radius={20} style={{ clipPath: `inset(0 ${540 * (1 - ramp(frame, 825, 8))}px 0 0)` }} />
			<Ring x={860} y={475} width={564} height={139} radius={30} color={DARK.accent} from={832} />
		</AbsoluteFill>
	);
};
