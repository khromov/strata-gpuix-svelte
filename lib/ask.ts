import { LlmError, shrinking, type Message } from './llm.ts';
import type { Llms } from './llms.ts';
import { warn } from './log.ts';
import { clip_snippet } from './rank.ts';
import type { ChunkHit, Search } from './search.ts';
import type { Kind } from './store.ts';

const SYSTEM = `You are Strata, a personal second brain. Answer the question using only the numbered sources from the user's own notes, links, images and recordings. Cite a source as [n] right after the fact it supports. If the sources do not contain the answer, say so plainly rather than guessing. Be concise; use markdown.`;

export interface Source {
	n: number;
	item_id: number;
	/** Null for an image found by what it shows rather than by text. */
	chunk_id: number | null;
	title: string;
	kind: Kind;
	snippet: string;
	date: string;
}

export interface AskOptions {
	k?: number;
	max_chars?: number;
	history?: Message[];
	signal?: AbortSignal;
	on_token?: (delta: string, full: string) => void;
}

export interface Answer {
	answer: string;
	sources: Source[];
	cited: number[];
}

/** An image matched by what it shows is described before it is quoted, a few per question. */
const DESCRIBE_PER_QUESTION = 3;
const UNDESCRIBED = 'An image that matches the question by what it shows. It has no description yet.';

export interface AskDeps {
	search: Search;
	llms: Llms;
	/** Describes an image and files the description on the item (`app.describe_image`). */
	describe?: (item_id: number) => Promise<string>;
}

export async function ask(
	{ search, llms, describe }: AskDeps,
	question: string,
	{ k = 8, max_chars = 12_000, history = [], signal, on_token }: AskOptions = {}
): Promise<Answer> {
	const llm = llms.text();
	if (!llm) throw new LlmError(llms.caps().llm.reason ?? 'no language model', { code: 'NOT_CONFIGURED' });

	const hits = await search.search_chunks(question, { k });
	const texts = new Map<ChunkHit, string>();
	let described = 0;
	const text_of = async (hit: ChunkHit): Promise<string> => {
		const known = texts.get(hit);
		if (known !== undefined) return known;
		let text = hit.chunk?.text ?? null;
		// An image nobody described (imported before a vision model was set up) has no text for
		// the model to read; describing it now also files that text for every later search.
		if (text === null && describe && llms.vision() && described < DESCRIBE_PER_QUESTION) {
			described++;
			text = await describe(hit.item.id).catch((err: Error) => {
				warn(`describing image ${hit.item.id} for Ask failed:`, err.message);
				return null;
			});
			signal?.throwIfAborted();
		}
		texts.set(hit, text || UNDESCRIBED);
		return text || UNDESCRIBED;
	};

	// Recent turns count against the budget too, newest first, up to a third of it.
	const prompt = async (budget: number) => {
		const recent: Message[] = [];
		let used = 0;
		for (const turn of history.slice(-6).reverse()) {
			const n = typeof turn.content === 'string' ? turn.content.length : 0;
			if (used + n > budget / 3) break;
			used += n;
			recent.unshift(turn);
		}
		const sources: Source[] = [];
		const quoted: string[] = [];
		for (const hit of hits) {
			const text = await text_of(hit);
			if (sources.length && used + text.length > budget) break;
			used += text.length;
			quoted.push(text);
			sources.push({
				n: sources.length + 1,
				item_id: hit.item.id,
				chunk_id: hit.chunk?.id ?? null,
				title: hit.item.title || 'Untitled',
				kind: hit.item.kind,
				snippet: clip_snippet(text, 160),
				date: new Date(hit.item.created_at).toISOString().slice(0, 10)
			});
		}
		const context = sources.length
			? `Sources:\n\n${sources.map((s, i) => `[${s.n}] ${s.title} (${s.kind}, ${s.date})\n${quoted[i]}`).join('\n\n')}`
			: 'Sources: nothing in the brain matched this question.';
		const messages: Message[] = [{ role: 'system', content: SYSTEM }, ...recent, { role: 'user', content: `${context}\n\nQuestion: ${question}` }];
		return { messages, sources };
	};

	return shrinking(Math.min(max_chars, llm.prompt_chars), async (budget) => {
		const { messages, sources } = await prompt(budget);
		const answer = await llm.chat(messages, { stream: true, signal, onDelta: on_token });
		return { answer, sources, cited: cited_sources(answer, sources.length) };
	});
}

/** `[2]` and `[1, 3]` alike: small models, Gemma among them, tend to cite in lists. */
export function cited_sources(answer: string, count: number): number[] {
	const ns = [...answer.matchAll(/\[(\d+(?:\s*,\s*\d+)*)\]/g)].flatMap((m) => m[1].split(',').map(Number));
	return [...new Set(ns.filter((n) => n >= 1 && n <= count))];
}
