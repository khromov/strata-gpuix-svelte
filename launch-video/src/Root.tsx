import { Composition } from 'remotion';
import { LaunchVideo } from './LaunchVideo';
import { END, FPS } from './timeline';

export const RemotionRoot: React.FC = () => {
	return (
		<>
			<Composition id="LaunchVideo" component={LaunchVideo} durationInFrames={END} fps={FPS} width={1920} height={1080} />
		</>
	);
};
