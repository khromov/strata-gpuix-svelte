/**
 * Where the ML worker and its node_modules live on Windows and Linux. A self-update there swaps one
 * executable, so they travel inside it as one embedded zip (build.ts). They can't run from in there:
 * Bun extracts a `.node` addon alone to a temp directory, without the libraries that have to sit
 * beside it (onnxruntime's, libvips). So the first launch of each build unpacks them into the data
 * directory. macOS has Contents/Resources instead and embeds an empty file.
 */

import AdmZip from 'adm-zip';
import { app_info } from 'gpuix-svelte/update';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, renameSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { log, warn } from './log.ts';
import { app_data_dir, resources_dir, use_resources } from './paths.ts';

const WORKER = join('ml', 'worker.js');

let problem: string | null = null;

/** Why the ML runtime could not be unpacked, for the app to say; it opens without ML either way. */
export const runtime_problem = () => problem;

function rm_quietly(path: string) {
	try {
		rmSync(path, { recursive: true, force: true });
	} catch {
		// A file still in use, which only Windows refuses; the next launch gets it.
	}
}

/** An antivirus can hold freshly written files for a moment on Windows, so the rename gets a few tries. */
function move_into_place(from: string, to: string) {
	const sleeper = new Int32Array(new SharedArrayBuffer(4));
	for (let attempt = 1; ; attempt++) {
		try {
			renameSync(from, to);
			return;
		} catch (err) {
			if (existsSync(join(to, WORKER))) return;
			if (attempt >= 10) throw err;
			Atomics.wait(sleeper, 0, 0, 300);
		}
	}
}

/**
 * Unpacks into `<root>/<key>`, which appears whole or not at all, so a launch killed midway starts
 * over rather than running half a runtime. Then deletes every other build's runtime.
 */
export function unpack_runtime(zip: Uint8Array, root: string, key: string): string {
	const target = join(root, key);
	if (!existsSync(join(target, WORKER))) {
		mkdirSync(root, { recursive: true });
		const staging = mkdtempSync(join(root, '.unpack-'));
		try {
			new AdmZip(Buffer.from(zip)).extractAllTo(staging, true, true);
			if (!existsSync(join(staging, WORKER))) throw new Error('the embedded runtime has no worker');
			move_into_place(staging, target);
		} catch (err) {
			// Another instance of this build can have finished first, and swept this directory away.
			if (!existsSync(join(target, WORKER))) throw err;
		} finally {
			rm_quietly(staging);
		}
	}
	for (const name of readdirSync(root)) if (name !== key) rm_quietly(join(root, name));
	return target;
}

/** `payload` is the embedded file's path. Keyed by size as well as version, so a rebuild of one version can't run the last one's worker. */
export async function prepare_runtime(payload: string) {
	if (resources_dir()) return;
	const file = Bun.file(payload);
	if (file.size === 0) return;
	const root = join(process.env.GPUIX_BRAIN_DIR || app_data_dir(), 'runtime');
	const key = `${app_info()?.version ?? 'unknown'}-${file.size}`;
	if (existsSync(join(root, key, WORKER))) {
		use_resources(join(root, key));
		return;
	}
	const started = Date.now();
	try {
		use_resources(unpack_runtime(new Uint8Array(await file.arrayBuffer()), root, key));
		log(`unpacked the ML runtime to ${root} in ${Date.now() - started} ms`);
	} catch (err) {
		problem = `could not unpack the on-device models' runtime: ${(err as Error).message}`;
		warn(problem);
	}
}

/**
 * `strata --verify-runtime`: starts the real ML worker, which loads transformers.js with onnxruntime
 * and sharp, and waits for its hello, with no model and no window. The release workflow runs it so
 * that a build whose worker can't start fails there, instead of reaching every installed copy.
 * Returns an exit code.
 */
export async function verify_runtime(timeout_ms = 120_000): Promise<number> {
	const dir = resources_dir();
	if (!dir) {
		console.error(`no ML runtime: ${problem ?? 'nothing was embedded'}`);
		return 1;
	}
	const ml = join(dir, 'ml');
	if (!existsSync(join(ml, 'llm-worker.js'))) {
		console.error(`no llm-worker.js in ${ml}`);
		return 1;
	}
	const { promise, resolve } = Promise.withResolvers<number>();
	const timer = setTimeout(() => {
		console.error(`the ML worker did not start within ${timeout_ms / 1000} s`);
		resolve(1);
	}, timeout_ms);
	const worker = Bun.spawn([process.execPath, join(ml, 'worker.js')], {
		cwd: ml,
		env: { ...process.env, BUN_BE_BUN: '1', GPUIX_BRAIN_MODELS_DIR: join(tmpdir(), 'strata-verify-no-models') },
		stdin: 'ignore',
		stdout: 'inherit',
		stderr: 'inherit',
		serialization: 'advanced',
		ipc: (msg: { type: string; versions?: { transformers?: string; bun?: string } }) => {
			if (msg.type !== 'hello') return;
			console.log(`the ML worker started: transformers.js ${msg.versions?.transformers}, Bun ${msg.versions?.bun}`);
			resolve(0);
		},
		onExit: (_proc, code) => {
			console.error(`the ML worker exited with ${code} before it started`);
			resolve(1);
		}
	});
	const result = await promise;
	clearTimeout(timer);
	worker.kill();
	return result;
}
