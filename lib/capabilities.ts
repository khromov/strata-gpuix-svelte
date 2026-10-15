import { clipboard_available } from './clipboard.ts';
import { picker_available } from './dialogs.ts';
import { player_available } from './player.ts';
import { init_recorder, recorder_available } from './recorder.ts';

export interface Cap {
	ok: boolean;
	reason?: string;
}

export interface Capabilities {
	platform: string;
	recorder: Cap;
	clipboardImage: Cap;
	clipboardText: Cap;
	filePicker: Cap;
	player: Cap;
	llm: Cap;
	vision: Cap;
}

const NO_LLM: Cap = { ok: false, reason: 'no language model' };

export async function capabilities({ llm = NO_LLM, vision = NO_LLM }: { llm?: Cap; vision?: Cap } = {}): Promise<Capabilities> {
	await init_recorder();
	const clipboard = clipboard_available();
	return {
		platform: process.platform,
		recorder: recorder_available(),
		clipboardImage: clipboard.image,
		clipboardText: clipboard.text,
		filePicker: picker_available(),
		player: player_available(),
		llm,
		vision
	};
}
