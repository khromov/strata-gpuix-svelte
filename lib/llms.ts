/**
 * Which model does the writing: Gemma on this machine (the default), or the
 * OpenAI-compatible endpoint in Settings. Asked afresh on every use, so a switch in
 * Settings applies to the next question without a restart.
 */

import type { Cap } from './capabilities.ts';
import { create_llm, llm_tasks, type Llm } from './llm.ts';
import { GEMMA_NAME, type LocalLike } from './llm-local.ts';
import type { Settings } from './settings.ts';

export type Llms = ReturnType<typeof create_llms>;

const NO_ENDPOINT = 'no LLM configured — set a base URL and model in Settings';

export function create_llms({ settings, local }: { settings: Settings; local: LocalLike }) {
	const gemma = llm_tasks(GEMMA_NAME, (messages, opts) => local.chat(messages, opts));

	const llms = {
		/** Answers, summaries and titles. */
		text(): Llm | null {
			if (settings.provider() === 'local') return local.available ? gemma : null;
			const config = settings.llm_config();
			return config ? create_llm(config) : null;
		},

		/** Image descriptions: Gemma reads images itself; an endpoint needs its vision model set. */
		vision(): Llm | null {
			if (settings.provider() === 'local') return local.available ? gemma : null;
			const config = settings.vision_config();
			return config ? create_llm(config) : null;
		},

		caps(): { llm: Cap; vision: Cap } {
			if (settings.provider() === 'local') {
				const cap = local.available ? { ok: true } : { ok: false, reason: local.reason ?? `${GEMMA_NAME} is unavailable` };
				return { llm: cap, vision: cap };
			}
			const llm = settings.llm_config() ? { ok: true } : { ok: false, reason: NO_ENDPOINT };
			const vision = !llm.ok ? llm : settings.vision_config() ? { ok: true } : { ok: false, reason: 'no vision model set in Settings' };
			return { llm, vision };
		}
	};
	return llms;
}
