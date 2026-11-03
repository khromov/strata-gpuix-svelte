/**
 * Stands in for Gemma during capture, so no script ever loads the real model on the GPU.
 * Retrieval stays real: Ask's sources come from the real embedding search, and this reads
 * their numbers out of the prompt, so every citation points at the source that was found.
 * The words of the answer are scripted, which is the one part of the video that is not
 * model output. Images get no description, so finding one proves CLIP saw the picture.
 */

import type { ChatOptions, Message } from '../../lib/llm.ts';
import type { LocalLike, LocalStatus } from '../../lib/llm-local.ts';

export const QUESTION = 'Anything left to sort out for the van trip?';

const ANSWER = `Two things left, going by what you saved:

1. **Book the ferry.** It fills up fast in summer, so get a space at least three weeks ahead {{New Recording 47}}.
2. **Ask Morag about the road to Elgol.** It is still open on your list {{Skye trip, to sort out}}.

Already sorted: the rain jacket is in the van and the head nets are in the glovebox {{Rain jacket is in the van}}.`;

export class ScriptedLlm implements LocalLike {
	status: LocalStatus = { state: 'ready', progress: 100, error: null, downloaded: true, rss: null };
	available = true;
	reason: string | null = null;
	on_status: (status: LocalStatus) => void = () => {};
	/** Awaited after each streamed word, so a capture script can photograph the stream. */
	on_word: (() => Promise<void>) | null = null;

	async load() {}
	async unload() {}
	stop_sync() {}

	async chat(messages: Message[], { onDelta, signal }: ChatOptions = {}): Promise<string> {
		const last = messages.at(-1)?.content;
		if (typeof last !== 'string') return '';
		if (!/^Sources:\n\n\[1\]/.test(last)) return '';
		const text = ANSWER.replace(/\{\{(.+?)\}\}/g, (_, title: string) => {
			const found = last.match(new RegExp(`^\\[(\\d+)\\] ${title} \\(`, 'm'));
			if (!found) throw new Error(`the search did not retrieve "${title}", so the scripted answer cannot cite it:\n${last.slice(0, 1200)}`);
			return `[${found[1]}]`;
		});
		let full = '';
		for (const word of text.split(/(?<=\s)/)) {
			signal?.throwIfAborted();
			full += word;
			onDelta?.(word, full);
			await this.on_word?.();
		}
		return full;
	}
}
