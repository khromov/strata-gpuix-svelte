/**
 * Strata → dist/Strata.app. gpuix-svelte's build() compiles standalone.ts and makes the .app with
 * its icon and plist; this adds what only Strata needs, before anything is signed.
 * transformers.js cannot be compiled into a Bun binary (huggingface/transformers.js#1672:
 * onnxruntime's dylib and sharp's addon are not embedded), and it never has to be: the models run
 * in a child process, so the worker ships as source with its node_modules in Contents/Resources,
 * and the app runs it on its own embedded Bun (BUN_BE_BUN=1).
 *
 * `--archive` also writes the zip to distribute and the fragment `gpuix-svelte update manifest`
 * merges, which .github/workflows/release.yml uploads. macOS only: the updater swaps a single
 * executable on Windows and Linux, and that cannot carry Resources.
 */

import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

if (!process.versions.bun) {
	console.error('[build] needs Bun — `bun run build` runs `bun build.ts`');
	process.exit(1);
}
if (process.platform !== 'darwin') {
	console.error(`[build] Strata's build makes a macOS .app (AVFoundation recorder, Metal); nothing to build on ${process.platform}`);
	process.exit(1);
}

const root = fileURLToPath(new URL('./', import.meta.url));
const dist = join(root, 'dist');
const archive = process.argv.includes('--archive');
const identity = process.env.CODESIGN_IDENTITY;
// A keychain profile on a developer's machine; an Apple ID on CI, where there is no keychain profile.
const notary = process.env.NOTARY_PROFILE
	? ['--keychain-profile', process.env.NOTARY_PROFILE]
	: process.env.APPLE_ID && process.env.APPLE_PASSWORD && process.env.APPLE_TEAM_ID
		? ['--apple-id', process.env.APPLE_ID, '--password', process.env.APPLE_PASSWORD, '--team-id', process.env.APPLE_TEAM_ID]
		: null;

// build() signs right after it makes the bundle: before Resources exists, without nested signing
// and with entitlements that have no microphone. So it never sees the identity, and notarize()
// below runs while beforeArchive still can, which leaves build() to zip the stapled bundle.
delete process.env.CODESIGN_IDENTITY;

if (!existsSync(join(root, 'ml/node_modules/@huggingface/transformers/package.json'))) {
	console.error('[build] the ML dependencies are not installed; run `bun run ml:install` first');
	process.exit(1);
}

const MICROPHONE_USAGE = 'Strata records voice memos and transcribes them on this Mac.';

// Under the hardened runtime Bun's JavaScriptCore JIT needs the executable-memory
// entitlements, and the GPUI addon, onnxruntime and sharp are dlopen'd without our
// team's signature, which library validation would otherwise refuse.
const ENTITLEMENTS = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>com.apple.security.cs.allow-jit</key>
	<true/>
	<key>com.apple.security.cs.allow-unsigned-executable-memory</key>
	<true/>
	<key>com.apple.security.cs.disable-executable-page-protection</key>
	<true/>
	<key>com.apple.security.cs.allow-dyld-environment-variables</key>
	<true/>
	<key>com.apple.security.cs.disable-library-validation</key>
	<true/>
	<key>com.apple.security.device.audio-input</key>
	<true/>
	<key>com.apple.security.network.client</key>
	<true/>
</dict>
</plist>
`;

// Imported after the guards: a static import would hoist `bun` above them.
const { build } = await import('gpuix-svelte/build');
const { CLANG_ARGS } = await import('./lib/recorder.ts');

const result = await build({ entry: join(root, 'standalone.ts'), outdir: dist, archive, beforeArchive: ({ output }) => complete(output) });
if (!archive) await complete(result.output);

async function complete(bundle: string) {
	const plist = join(bundle, 'Contents', 'Info.plist');
	writeFileSync(plist, readFileSync(plist, 'utf8').replace('</dict>', `\t<key>NSMicrophoneUsageDescription</key>\n\t<string>${MICROPHONE_USAGE}</string>\n</dict>`));

	const resources = join(bundle, 'Contents', 'Resources');
	mkdirSync(join(resources, 'ml'), { recursive: true });
	mkdirSync(join(resources, 'native'), { recursive: true });

	// Each worker is bundled to one file (the lib/ modules it shares inlined) and keeps its
	// real node_modules beside it: onnxruntime and sharp load from there as usual.
	await bundle_worker('worker', resources);
	await bundle_worker('llm-worker', resources);
	copy_file('ml/package.json', join(resources, 'ml', 'package.json'));
	console.log('[build] copying the ML dependencies (a few hundred MB)');
	// Dereferenced: the update archive refuses symlinks, and node_modules/.bin has some.
	cpSync(join(root, 'ml/node_modules'), join(resources, 'ml', 'node_modules'), { recursive: true, dereference: true });
	prune_foreign_runtimes(join(resources, 'ml', 'node_modules'));
	prune_wasm_backend(join(resources, 'ml', 'node_modules'));

	run('clang', [...CLANG_ARGS, '-o', join(resources, 'native', 'recorder-shim.dylib'), join(root, 'native/recorder-shim.m')]);

	console.log(`[build] ${relative(root, bundle)} (${mb(dir_size(bundle))} MB)`);

	if (!identity) {
		console.log('[build] CODESIGN_IDENTITY not set; leaving the output unsigned');
	} else {
		sign_bundle(bundle, resources);
	}

	if (!notary) {
		console.log('[build] neither NOTARY_PROFILE nor APPLE_ID + APPLE_PASSWORD + APPLE_TEAM_ID set; skipping notarization');
	} else if (!identity) {
		console.log('[build] notarization needs CODESIGN_IDENTITY; skipping it');
	} else {
		notarize(bundle);
	}
}

async function bundle_worker(name: string, resources: string) {
	const worker = await Bun.build({
		entrypoints: [join(root, `ml/${name}.ts`)],
		target: 'bun',
		external: ['@huggingface/transformers'],
		naming: `${name}.js`,
		throw: false
	});
	if (!worker.success) {
		for (const message of worker.logs) console.error(message);
		process.exit(1);
	}
	writeFileSync(join(resources, 'ml', `${name}.js`), await worker.outputs[0].text());
}

function copy_file(from: string, to: string) {
	writeFileSync(to, readFileSync(join(root, from)));
}

function mb(bytes: number) {
	return (bytes / 1048576).toFixed(1);
}

// onnxruntime-node's tarball carries every platform's prebuilt runtime — win32 alone is
// 124 MB — and the .app only ever dlopen's the host's.
function prune_foreign_runtimes(modules: string) {
	const bin = join(modules, 'onnxruntime-node/bin/napi-v6');
	if (!existsSync(bin)) return;
	const drop = [];
	for (const platform of readdirSync(bin)) {
		const dir = join(bin, platform);
		if (!statSync(dir).isDirectory()) continue;
		if (platform !== process.platform) drop.push(dir);
		else for (const arch of readdirSync(dir)) if (arch !== process.arch && statSync(join(dir, arch)).isDirectory()) drop.push(join(dir, arch));
	}
	let freed = 0;
	for (const dir of drop) {
		freed += dir_size(dir);
		rmSync(dir, { recursive: true, force: true });
	}
	if (drop.length) console.log(`[build] dropped ${drop.length} foreign onnxruntime build(s), ${mb(freed)} MB`);
}

// onnxruntime-web is in the bundle only because transformers.js imports it next to the node
// binding; its own wasm builds and sourcemaps are never read, since transformers' node build
// refuses `device: 'wasm'` outright ("should be one of: coreml, webgpu, cpu").
function prune_wasm_backend(modules: string) {
	const dist = join(modules, 'onnxruntime-web/dist');
	if (!existsSync(dist)) return;
	const drop = readdirSync(dist).filter((name) => /\.(wasm|map)$/.test(name));
	let freed = 0;
	for (const name of drop) {
		freed += statSync(join(dist, name)).size;
		rmSync(join(dist, name), { force: true });
	}
	if (drop.length) console.log(`[build] dropped ${drop.length} onnxruntime-web wasm/map file(s), ${mb(freed)} MB`);
}

function dir_size(path: string) {
	let total = 0;
	(function walk(p: string) {
		const st = statSync(p);
		if (st.isDirectory()) for (const name of readdirSync(p)) walk(join(p, name));
		else total += st.size;
	})(path);
	return total;
}

// Nested Mach-O files (the addons and their dylibs under Resources) are signed
// first, inside out, as Apple's notarization requires; --deep is not enough.
function sign_bundle(bundle: string, resources: string) {
	const entitlements = join(dist, 'entitlements.plist');
	writeFileSync(entitlements, ENTITLEMENTS);
	const nested: string[] = [];
	(function walk(p: string) {
		for (const name of readdirSync(p)) {
			const full = join(p, name);
			if (statSync(full).isDirectory()) walk(full);
			else if (/\.(node|dylib)$/.test(name)) nested.push(full);
		}
	})(resources);
	for (const target of nested) {
		run('codesign', ['--force', '--options', 'runtime', '--timestamp', '--sign', identity!, target]);
	}
	run('codesign', ['--force', '--options', 'runtime', '--timestamp', '--entitlements', entitlements, '--sign', identity!, join(bundle, 'Contents', 'MacOS', 'strata')]);
	run('codesign', ['--force', '--options', 'runtime', '--timestamp', '--entitlements', entitlements, '--sign', identity!, bundle]);
	run('codesign', ['--verify', '--strict', bundle]);
	console.log(`[build] signed ${relative(root, bundle)} (${nested.length} nested binaries) as ${identity}`);
}

function notarize(target: string) {
	const zip = join(dist, 'Strata.zip');
	run('ditto', ['-c', '-k', '--keepParent', target, zip]);
	console.log('[build] notarizing (Apple usually takes a few minutes)');
	const output = run('xcrun', ['notarytool', 'submit', zip, ...notary!, '--wait']);
	if (!/status: Accepted/.test(output)) {
		console.error(`[build] notarization was not accepted; see \`xcrun notarytool log\` for the submission below\n${output}`);
		process.exit(1);
	}
	run('xcrun', ['stapler', 'staple', target]);
	run('spctl', ['--assess', '--type', 'execute', target]);
	// With --archive, build() zips the stapled bundle next, and that is the one to ship.
	rmSync(zip, { force: true });
	if (!archive) {
		run('ditto', ['-c', '-k', '--keepParent', target, zip]);
		console.log(`[build] notarized and stapled; ${relative(root, zip)} is the one to ship`);
	}
}

function run(command: string, args: string[]) {
	const { status, stdout, stderr } = spawnSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
	if (status !== 0) {
		// notarytool's --password must not end up in a log through the error.
		const shown = args.map((arg, i) => (args[i - 1] === '--password' ? '***' : arg));
		console.error(`[build] ${command} ${shown.join(' ')} failed:\n${stderr || stdout}`);
		process.exit(1);
	}
	return stdout;
}
