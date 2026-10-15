import { LlmError, type Message } from './llm.ts';
import type { Llms } from './llms.ts';
import { clip_snippet } from './rank.ts';
import type { Search } from './search.ts';
import type { Kind } from './store.ts';

const SYSTEM = `You are Substrate, a personal second brain. Answer the question using only the numbered sources from the user's own notes, links, images and recordings. Cite a source as [n] right after the fact it supports. If the sources do not contain the answer, say so plainly rather than guessing. Be concise; use markdown.`;

export interface Source {
	n: number;
	item_id: number;
	chunk_id: number;
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

export async function ask(
	{ search, llms }: { search: Search; llms: Llms },
	question: string,
	{ k = 8, max_chars = 12_000, history = [], signal, on_token }: AskOptions = {}
): Promise<Answer> {
	const llm = llms.text();
	if (!llm) throw new LlmError(llms.caps().llm.reason ?? 'no language model', { code: 'NOT_CONFIGURED' });

	const sources: Source[] = [];
	const texts: string[] = [];
	let used = 0;
	for (const hit of await search.search_chunks(question, { k })) {
		const text = hit.chunk.text;
		if (sources.length && used + text.length > max_chars) break;
		used += text.length;
		texts.push(text);
		sources.push({
			n: sources.length + 1,
			item_id: hit.item.id,
			chunk_id: hit.chunk.id,
			title: hit.item.title || 'Untitled',
			kind: hit.item.kind,
			snippet: clip_snippet(text, 160),
			date: new Date(hit.item.created_at).toISOString().slice(0, 10)
		});
	}

	const context = sources.length
		? `Sources:\n\n${sources.map((s, i) => `[${s.n}] ${s.title} (${s.kind}, ${s.date})\n${texts[i]}`).join('\n\n')}`
		: 'Sources: nothing in the brain matched this question.';
	const messages: Message[] = [
		{ role: 'system', content: SYSTEM },
		...history.slice(-6),
		{ role: 'user', content: `${context}\n\nQuestion: ${question}` }
	];

	const answer = await llm.chat(messages, { stream: true, signal, onDelta: on_token });
	return { answer, sources, cited: cited_sources(answer, sources.length) };
}

/** `[2]` and `[1, 3]` alike: small models, Gemma among them, tend to cite in lists. */
export function cited_sources(answer: string, count: number): number[] {
	const ns = [...answer.matchAll(/\[(\d+(?:\s*,\s*\d+)*)\]/g)].flatMap((m) => m[1].split(',').map(Number));
	return [...new Set(ns.filter((n) => n >= 1 && n <= count))];
}
