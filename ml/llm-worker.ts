/**
 * Gemma 4 E4B over transformers.js on WebGPU (Metal on macOS), one generation at a
 * time. The weights download into the models directory on the first request. After
 * IDLE_EXIT_MS without one the process exits, which hands back all ~6 GB at once.
 */

import { GEMMA_BYTES, GEMMA_ID, GEMMA_NAME, GEMMA_URL, gemma_downloaded, gemma_messages, type LlmJob, type LlmMessage, type LlmRequest, type LlmResults } from '../lib/llm-local.ts';
import type { ModelState } from '../lib/ml-client.ts';
import type { Failure } from '../lib/types.ts';

const send = (msg: LlmMessage) => process.send?.(msg);
const status = (state: ModelState, extra: { progress?: number | null; error?: string | null } = {}) => send({ type: 'status', state, ...extra });

const tf = await import('@huggingface/transformers');
const { env, AutoProcessor, Gemma4ForConditionalGeneration, TextStreamer, InterruptableStoppingCriteria, RawImage } = tf;

env.cacheDir = process.env.GPUIX_BRAIN_MODELS_DIR || new URL('../.data/models/', import.meta.url).pathname;
env.allowLocalModels = false;
env.allowRemoteModels = process.env.GPUIX_BRAIN_OFFLINE !== '1';
env.logLevel = 40;

// transformers.js fetches <remoteHost>/<remotePathTemplate>/<file>, dropping the slashes
// around each part; a bare host needs a middle part that resolves to nothing.
const source = new URL(process.env.GPUIX_BRAIN_GEMMA_URL || GEMMA_URL);
env.remoteHost = source.origin;
env.remotePathTemplate = source.pathname.replace(/^\/+|\/+$/g, '') || '.';

const IDLE_EXIT_MS = 10 * 60_000;

interface TfProgress {
	status: string;
	file?: string;
	loaded?: number;
}
// Typed loosely: transformers.js is an ambient `any` until `ml:install` (ml/ambient.d.ts).
interface Gemma {
	processor: any;
	model: any;
}

let gemma: Gemma | null = null;
let loading: Promise<Gemma> | null = null;
let last_used = Date.now();

async function load_gemma(): Promise<Gemma> {
	const fetching = !gemma_downloaded(env.cacheDir);
	if (fetching && !env.allowRemoteModels) {
		throw Object.assign(new Error(`${GEMMA_NAME} is not downloaded, and GPUIX_BRAIN_OFFLINE=1 forbids it`), { code: 'MODEL_LOAD' });
	}
	status(fetching ? 'downloading' : 'loading', { progress: fetching ? 0 : null });
	// Counted here against GEMMA_BYTES: transformers.js's own `progress_total` trusts each
	// response's Content-Length, which a CDN that gzips on the fly leaves out. Reads from
	// the cache report progress too, so this only runs when files were missing; past 100%
	// what is left is building the GPU sessions.
	const received = new Map<string, number>();
	let shown = -1;
	const progress_callback = (p: TfProgress) => {
		if (!fetching || p.status !== 'progress' || !p.file) return;
		received.set(p.file, p.loaded ?? 0);
		let bytes = 0;
		for (const n of received.values()) bytes += n;
		const pct = Math.min(100, Math.floor((bytes / GEMMA_BYTES) * 100));
		if (pct === shown) return;
		shown = pct;
		if (pct >= 100) status('loading');
		else status('downloading', { progress: pct });
	};
	const processor = await AutoProcessor.from_pretrained(GEMMA_ID, { progress_callback });
	const model = await Gemma4ForConditionalGeneration.from_pretrained(GEMMA_ID, { dtype: 'q4f16', device: 'webgpu', progress_callback });
	return { processor, model };
}

function ensure(): Promise<Gemma> {
	if (gemma) return Promise.resolve(gemma);
	loading ??= load_gemma().then(
		(loaded) => {
			gemma = loaded;
			loading = null;
			status('ready', { progress: 100 });
			return loaded;
		},
		(err: Failure) => {
			loading = null;
			const message = /webgpu/i.test(err.message) ? `${GEMMA_NAME} needs WebGPU: ${err.message}` : err.message;
			status('error', { error: message });
			throw Object.assign(err, {
				message,
				code: err.code ?? 'MODEL_LOAD',
				transient: /fetch|network|ECONN|timed out|socket/i.test(err.message)
			});
		}
	);
	return loading;
}

async function read_image(url: string) {
	const comma = url.indexOf(',');
	const bytes = Buffer.from(url.slice(comma + 1), url.slice(0, comma).endsWith(';base64') ? 'base64' : 'utf8');
	return RawImage.fromBlob(new Blob([bytes]));
}

const stopper = new InterruptableStoppingCriteria();
let running_id: number | null = null;

const handlers = {
	async load(): Promise<LlmResults['load']> {
		const started = performance.now();
		await ensure();
		return { ms: Math.round(performance.now() - started) };
	},

	async chat(job: Extract<LlmJob, { type: 'chat' }>): Promise<LlmResults['chat']> {
		const { processor, model } = await ensure();
		const { messages, images } = gemma_messages(job.messages);
		const prompt = processor.apply_chat_template(messages, { enable_thinking: false, add_generation_prompt: true });
		const pictures = images.length ? await Promise.all(images.map(read_image)) : null;
		const inputs = await processor(prompt, pictures, null, { add_special_tokens: false });
		const streamer = new TextStreamer(processor.tokenizer, {
			skip_prompt: true,
			skip_special_tokens: true,
			callback_function: (text: string) => send({ type: 'token', id: job.id, text })
		});
		stopper.reset();
		const sample = job.temperature > 0;
		const out = await model.generate({
			...inputs,
			max_new_tokens: job.max_tokens,
			do_sample: sample,
			...(sample ? { temperature: job.temperature, top_k: 64, top_p: 0.95 } : {}),
			streamer,
			stopping_criteria: [stopper]
		});
		const [text] = processor.batch_decode(out.slice(null, [inputs.input_ids.dims.at(-1), null]), { skip_special_tokens: true });
		return { text: text.trim() };
	}
};

const queue: LlmJob[] = [];
let running = false;

async function drain() {
	if (running) return;
	running = true;
	while (queue.length) {
		const job = queue.shift()!;
		running_id = job.id;
		try {
			const result = job.type === 'chat' ? await handlers.chat(job) : await handlers.load();
			send({ id: job.id, ok: true, result });
		} catch (err) {
			send({
				id: job.id,
				ok: false,
				error: {
					message: (err as Failure)?.message ?? String(err),
					stack: (err as Failure)?.stack,
					code: (err as Failure)?.code ?? 'INFERENCE',
					transient: (err as Failure)?.transient ?? false
				}
			});
		}
		running_id = null;
		last_used = Date.now();
	}
	running = false;
}

process.on('message', (msg: LlmRequest) => {
	if (msg?.type === 'shutdown') process.exit(0);
	if (msg?.type === 'abort') {
		if (msg.id === running_id) return stopper.interrupt();
		const at = queue.findIndex((job) => job.id === msg.id);
		if (at !== -1) queue.splice(at, 1);
		return;
	}
	last_used = Date.now();
	// A question someone is waiting on goes ahead of describing a batch of imports.
	const interactive = msg.type === 'load' || msg.interactive;
	if (interactive) {
		const first_bulk = queue.findIndex((job) => job.type === 'chat' && !job.interactive);
		queue.splice(first_bulk === -1 ? queue.length : first_bulk, 0, msg);
	} else {
		queue.push(msg);
	}
	drain();
});
process.on('disconnect', () => process.exit(0));

// An orphan is reparented to pid 1, and 'disconnect' is not always delivered.
setInterval(() => {
	if (process.ppid === 1) process.exit(0);
	if (gemma || loading) send({ type: 'mem', rss: process.memoryUsage().rss });
	if (!running && !queue.length && !loading && Date.now() - last_used > IDLE_EXIT_MS) process.exit(0);
}, 10_000);
process.on('uncaughtException', (err) => {
	send({ type: 'fatal', error: { message: err.message, stack: err.stack } });
	process.exit(1);
});
process.on('unhandledRejection', (err) => {
	send({ type: 'fatal', error: { message: (err as Failure)?.message ?? String(err), stack: (err as Failure)?.stack } });
	process.exit(1);
});

send({ type: 'hello', pid: process.pid });
