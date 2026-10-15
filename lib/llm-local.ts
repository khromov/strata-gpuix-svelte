/**
 * Gemma 4 E4B on this machine, in a child process of its own (ml/llm-worker.ts). A
 * generation holds the GPU for seconds and the model maps ~5 GB, so it stays out of
 * the embedder's worker, which every search needs. The process starts on the first
 * request and exits after a quiet spell, so a model nobody uses costs nothing.
 */

import type { Subprocess } from 'bun';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { on_exit } from './lifecycle.ts';
import type { ChatOptions, Message } from './llm.ts';
import { log, warn } from './log.ts';
import { MlError, type ModelState, type WorkerError } from './ml-client.ts';

export const GEMMA_ID = 'onnx-community/gemma-4-E4B-it-ONNX';
export const GEMMA_NAME = 'Gemma 4 E4B';
/**
 * Where the files download from: each path in GEMMA_FILES under it, `onnx/` kept.
 * GPUIX_BRAIN_GEMMA_URL overrides it. A mirror of the Hugging Face repo at revision
 * 2b6d2e26a962f70a33da8f7cd81e1afdd8d9cfb2; it must answer `Range: bytes=0-0`.
 */
export const GEMMA_URL = 'https://sta-public.fra1.cdn.digitaloceanspaces.com/onnx-community/gemma-4-E4B-it-ONNX';
/**
 * Everything the worker reads: q4f16 weights for WebGPU. Strata never sends audio, but
 * transformers.js loads every session the model declares, so the audio encoder comes too.
 */
export const GEMMA_FILES = [
	'config.json',
	'generation_config.json',
	'preprocessor_config.json',
	'processor_config.json',
	'chat_template.jinja',
	'tokenizer.json',
	'tokenizer_config.json',
	'onnx/embed_tokens_q4f16.onnx',
	'onnx/embed_tokens_q4f16.onnx_data',
	'onnx/decoder_model_merged_q4f16.onnx',
	'onnx/decoder_model_merged_q4f16.onnx_data',
	'onnx/decoder_model_merged_q4f16.onnx_data_1',
	'onnx/vision_encoder_q4f16.onnx',
	'onnx/vision_encoder_q4f16.onnx_data',
	'onnx/audio_encoder_q4f16.onnx',
	'onnx/audio_encoder_q4f16.onnx_data'
];
export const GEMMA_BYTES = 5_198_343_574;

/**
 * Safeguards. A GPU job that never finishes cannot be cancelled from userland: its process
 * stays stuck exiting with the GPU at 100%, and on 2026-10-15 one took the whole Mac down.
 * So prompts stay small (the worker refuses longer ones before they reach the GPU), a
 * generation that turns to junk or runs too long is cut off, a worker that falls silent is
 * killed, and after any of that Gemma stays off until the app restarts.
 */
export const GEMMA_MAX_PROMPT_TOKENS = 3072;
/** Characters of text a prompt carries; English is ~4 a token, so well under the cap. */
export const GEMMA_PROMPT_CHARS = 6000;
export const GEMMA_GENERATION_BUDGET_MS = 3 * 60_000;
/** Silence this long from a worker with work means its JS thread is stuck, likely on the GPU. */
export const GEMMA_STALL_MS = 60_000;
/** Worker error codes that mean the GPU work went wrong, so Gemma is stopped and kept off. */
const STOP_CODES = new Set(['DEGENERATE', 'TIME_BUDGET']);

/** Gemma never writes its `<unusedN>` tokens; seeing one means the GPU computed junk. */
export const is_degenerate = (text: string) => /<unused\d+>/.test(text);

const alive = (pid: number) => {
	try {
		process.kill(pid, 0);
		return true;
	} catch (err) {
		return (err as NodeJS.ErrnoException).code === 'EPERM';
	}
};

/**
 * One Gemma on the GPU per machine: a lock file holding its worker's pid, so a second app
 * or a script cannot load another beside it. A holder that is gone leaves a stale lock to
 * take over; one that still exists (even stuck exiting on a hung GPU job) keeps it.
 */
export function claim_gemma_lock(path: string, pid = process.pid): { ok: true } | { ok: false; holder: number } {
	for (let attempt = 0; attempt < 3; attempt++) {
		try {
			writeFileSync(path, String(pid), { flag: 'wx' });
			return { ok: true };
		} catch (err) {
			if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err;
		}
		let holder = 0;
		try {
			holder = Number(readFileSync(path, 'utf8')) || 0;
		} catch {
			continue;
		}
		if (holder === pid) return { ok: true };
		if (holder && alive(holder)) return { ok: false, holder };
		rmSync(path, { force: true });
	}
	return { ok: false, holder: 0 };
}

export function release_gemma_lock(path: string, pid = process.pid) {
	try {
		if (Number(readFileSync(path, 'utf8')) === pid) rmSync(path, { force: true });
	} catch {
		// Already gone.
	}
}

/** All of GEMMA_FILES in transformers.js's cache under `models_dir`. */
export const gemma_downloaded = (models_dir: string) => GEMMA_FILES.every((file) => existsSync(join(models_dir, GEMMA_ID, file)));

export interface LocalStatus {
	state: ModelState;
	progress: number | null;
	error: string | null;
	downloaded: boolean;
	rss: number | null;
}

/** What the app needs from the on-device model; LocalLlm and LocalStub both provide it. */
export interface LocalLike {
	status: LocalStatus;
	available: boolean;
	reason: string | null;
	on_status: (status: LocalStatus) => void;
	load(): Promise<void>;
	chat(messages: Message[], opts?: ChatOptions): Promise<string>;
	unload(): Promise<void>;
	stop_sync(): void;
}

export type GemmaContent = string | Array<{ type: 'image' } | { type: 'text'; text: string }>;
export interface GemmaMessage {
	role: Message['role'];
	content: GemmaContent;
}

/**
 * OpenAI-shaped messages → the processor's: each image part becomes a placeholder, in
 * order with `images` (data URLs), and goes before the words, which Gemma reads best.
 */
export function gemma_messages(messages: Message[]): { messages: GemmaMessage[]; images: string[] } {
	const images: string[] = [];
	const out = messages.map(({ role, content }): GemmaMessage => {
		if (typeof content === 'string') return { role, content };
		const pictures: Array<{ type: 'image' }> = [];
		const words: Array<{ type: 'text'; text: string }> = [];
		for (const part of content) {
			if (part.type === 'image_url') {
				images.push(part.image_url.url);
				pictures.push({ type: 'image' });
			} else {
				words.push({ type: 'text', text: part.text });
			}
		}
		return { role, content: [...pictures, ...words] };
	});
	return { messages: out, images };
}

export interface LlmPayloads {
	load: Record<string, never>;
	chat: { messages: Message[]; temperature: number; max_tokens: number; interactive: boolean };
}
export type LlmJob = { [T in keyof LlmPayloads]: { id: number; type: T } & LlmPayloads[T] }[keyof LlmPayloads];
/** Parent → worker. `abort` drops a queued job or stops the running generation. */
export type LlmRequest = LlmJob | { type: 'abort'; id: number } | { type: 'shutdown' };
export interface LlmResults {
	load: { ms: number };
	chat: { text: string };
}

/** Worker → parent; replies carry no `type`, so it is declared absent for narrowing. */
export type LlmMessage =
	| { type: 'hello'; pid: number }
	| { type: 'status'; state: ModelState; progress?: number | null; error?: string | null }
	| { type: 'mem'; rss: number }
	| { type: 'token'; id: number; text: string }
	| { type: 'fatal'; error: WorkerError }
	| { id: number; type?: undefined; ok: true; result: unknown }
	| { id: number; type?: undefined; ok: false; error: WorkerError };

interface Pending {
	resolve(value: unknown): void;
	reject(reason: unknown): void;
	on_token?(text: string): void;
}
type LlmProcess = Subprocess<'ignore', 'inherit', 'inherit'>;

export class LocalLlm implements LocalLike {
	#worker_path: string;
	#models_dir: string;
	#url: string;
	#proc: LlmProcess | null = null;
	#hello: { promise: Promise<void>; resolve: () => void; reject: (err: Error) => void } | null = null;
	#next_id = 1;
	#pending = new Map<number, Pending>();
	#stopping = false;
	#stall_ms: number;
	#last_heard = 0;
	#watchdog: ReturnType<typeof setInterval> | null = null;

	status: LocalStatus;
	available = true;
	reason: string | null = null;
	on_status: (status: LocalStatus) => void;

	constructor({
		worker_path,
		models_dir,
		url = process.env.GPUIX_BRAIN_GEMMA_URL || GEMMA_URL,
		stall_ms = GEMMA_STALL_MS,
		on_status = () => {}
	}: {
		worker_path: string;
		models_dir: string;
		url?: string;
		stall_ms?: number;
		on_status?: (status: LocalStatus) => void;
	}) {
		this.#worker_path = worker_path;
		this.#models_dir = models_dir;
		this.#url = url;
		this.#stall_ms = stall_ms;
		this.on_status = on_status;
		this.status = { state: 'unloaded', progress: null, error: null, downloaded: gemma_downloaded(models_dir), rss: null };
		on_exit(() => this.stop_sync());
	}

	#emit() {
		this.on_status?.(this.status);
	}

	#start(): Promise<void> {
		if (this.#hello) return this.#hello.promise;
		let resolve!: () => void;
		let reject!: (err: Error) => void;
		const promise = new Promise<void>((res, rej) => {
			resolve = res;
			reject = rej;
		});
		this.#hello = { promise, resolve, reject };
		// BUN_BE_BUN makes a compiled app's binary behave as plain `bun`, as for the ML worker.
		this.#proc = Bun.spawn([process.execPath, this.#worker_path], {
			cwd: dirname(this.#worker_path),
			env: { ...process.env, BUN_BE_BUN: '1', GPUIX_BRAIN_MODELS_DIR: this.#models_dir, GPUIX_BRAIN_GEMMA_URL: this.#url },
			stdin: 'ignore',
			stdout: 'inherit',
			stderr: 'inherit',
			ipc: (msg: LlmMessage) => this.#receive(msg),
			serialization: 'advanced',
			onExit: (proc, code, signal) => this.#on_exit(proc, code, signal)
		});
		return promise;
	}

	#receive(msg: LlmMessage) {
		this.#last_heard = Date.now();
		if (msg.type === 'hello') {
			log(`${GEMMA_NAME} worker up (pid ${msg.pid})`);
			this.#hello?.resolve();
			return;
		}
		if (msg.type === 'status') {
			const downloaded = this.status.downloaded || msg.state === 'ready' || msg.state === 'loading';
			this.status = { ...this.status, state: msg.state, progress: msg.progress ?? null, error: msg.error ?? null, downloaded };
			this.#emit();
			return;
		}
		if (msg.type === 'mem') {
			this.status = { ...this.status, rss: msg.rss };
			this.#emit();
			return;
		}
		if (msg.type === 'fatal') {
			warn(`${GEMMA_NAME} worker fatal:`, msg.error?.message);
			return;
		}
		const job = this.#pending.get(msg.id);
		if (!job) return;
		if (msg.type === 'token') {
			job.on_token?.(msg.text);
			return;
		}
		if (!msg.ok && STOP_CODES.has(msg.error?.code ?? '')) return this.#stop_for_safety(msg.error.message);
		this.#pending.delete(msg.id);
		if (msg.ok) job.resolve(msg.result);
		else job.reject(new MlError(msg.error?.message ?? `${GEMMA_NAME} failed`, { code: msg.error?.code, transient: msg.error?.transient }));
	}

	#on_exit(proc: LlmProcess, code: number | null, signal: NodeJS.Signals | number | null) {
		if (proc !== this.#proc) return;
		this.#proc = null;
		// Exiting by itself (code 0) is the idle unload; anything else while not asked to stop is a crash.
		const crashed = !this.#stopping && code !== 0;
		const message = `${GEMMA_NAME} exited (${signal ?? `code ${code}`})`;
		this.#hello?.reject(new MlError(message, { code: 'WORKER_CRASHED', transient: true }));
		this.#hello = null;
		for (const job of this.#pending.values()) job.reject(new MlError(message, { code: 'WORKER_CRASHED', transient: true }));
		this.#pending.clear();
		if (crashed) warn(message);
		this.status = {
			state: crashed ? 'error' : 'unloaded',
			progress: null,
			error: crashed ? message : null,
			downloaded: gemma_downloaded(this.#models_dir),
			rss: null
		};
		this.#emit();
	}

	async #request<T extends keyof LlmPayloads>(
		type: T,
		payload: LlmPayloads[T],
		{ signal, on_token }: { signal?: AbortSignal; on_token?: (text: string) => void } = {}
	): Promise<LlmResults[T]> {
		if (!this.available) throw new MlError(this.reason ?? `${GEMMA_NAME} is unavailable`, { code: 'ML_UNAVAILABLE' });
		signal?.throwIfAborted();
		await this.#start();
		signal?.throwIfAborted();
		const id = this.#next_id++;
		return new Promise<LlmResults[T]>((resolve, reject) => {
			this.#pending.set(id, { resolve: resolve as (value: unknown) => void, reject, on_token });
			this.#watch();
			signal?.addEventListener(
				'abort',
				() => {
					if (!this.#pending.delete(id)) return;
					this.#send({ type: 'abort', id });
					reject(signal.reason);
				},
				{ once: true }
			);
			this.#send({ id, type, ...payload } as LlmJob, id);
		});
	}

	/** While anything is pending, the worker's heartbeat ('mem' every few seconds) must keep coming. */
	#watch() {
		if (this.#watchdog) return;
		this.#last_heard = Date.now();
		this.#watchdog = setInterval(
			() => {
				if (!this.#pending.size) {
					clearInterval(this.#watchdog!);
					this.#watchdog = null;
				} else if (Date.now() - this.#last_heard > this.#stall_ms) {
					this.#stop_for_safety(`${GEMMA_NAME} stopped responding for ${Math.round(this.#stall_ms / 1000)} s`);
				}
			},
			Math.min(5000, this.#stall_ms / 4)
		);
	}

	/**
	 * Kills the worker outright and keeps Gemma off: loading it onto the GPU again beside a
	 * stuck job is how a bad answer turns into a frozen machine.
	 */
	#stop_for_safety(reason: string) {
		if (!this.available) return;
		const message = `${reason}, so it was stopped and stays off until Strata restarts`;
		warn(message);
		this.available = false;
		this.reason = message;
		const proc = this.#proc;
		// Detached first, so a late onExit (or none, if the process is stuck exiting) changes nothing.
		this.#proc = null;
		this.#hello?.reject(new MlError(message, { code: 'LLM_STOPPED' }));
		this.#hello = null;
		proc?.kill('SIGKILL');
		for (const job of this.#pending.values()) job.reject(new MlError(message, { code: 'LLM_STOPPED' }));
		this.#pending.clear();
		if (this.#watchdog) clearInterval(this.#watchdog);
		this.#watchdog = null;
		this.status = { ...this.status, state: 'error', progress: null, error: message, rss: null };
		this.#emit();
	}

	#send(msg: LlmRequest, id?: number) {
		try {
			this.#proc?.send(msg);
		} catch (err) {
			if (id === undefined) return;
			const job = this.#pending.get(id);
			this.#pending.delete(id);
			job?.reject(new MlError((err as Error).message, { code: 'WORKER_CRASHED', transient: true, cause: err }));
		}
	}

	async load() {
		await this.#request('load', {});
	}

	async chat(messages: Message[], { signal, onDelta, temperature = 0.2, maxTokens = 1024, background = false }: ChatOptions = {}): Promise<string> {
		let full = '';
		const { text } = await this.#request(
			'chat',
			{ messages, temperature, max_tokens: maxTokens, interactive: !background },
			{
				signal,
				on_token: (delta) => {
					full += delta;
					onDelta?.(delta, full);
				}
			}
		);
		return text;
	}

	/** Ends the process, which is the one way to be sure the GPU memory goes back. */
	async unload() {
		const proc = this.#proc;
		if (!proc) return;
		this.#stopping = true;
		this.#send({ type: 'shutdown' });
		const timer = setTimeout(() => proc.kill(), 2000);
		await proc.exited;
		clearTimeout(timer);
		// `exited` can resolve before Bun calls onExit; whichever comes second finds #proc moved on.
		this.#on_exit(proc, proc.exitCode, proc.signalCode);
		this.#stopping = false;
	}

	stop_sync() {
		this.#stopping = true;
		this.#proc?.kill();
	}
}
