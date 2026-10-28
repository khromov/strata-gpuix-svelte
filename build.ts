/**
 * Strata → one directory per platform under dist/, archived for a GitHub release:
 *
 *   macOS     dist/Strata.app                 → dist/strata-<version>-macos-<arch>.zip
 *   Linux     dist/strata-linux-<arch>/       → dist/strata-<version>-linux-<arch>.tar.gz
 *   Windows   dist/strata-windows-<arch>/     → dist/strata-<version>-windows-<arch>.zip
 *
 * The executable is `Bun.build({ compile })` over standalone.ts, with the GPUI addon
 * embedded. transformers.js cannot be compiled into a Bun binary
 * (huggingface/transformers.js#1672: onnxruntime's dylib and sharp's addon are not
 * embedded), and it never has to be: the models run in a child process, so the worker
 * ships as source with its node_modules beside the executable (Contents/Resources in the
 * .app, resources/ elsewhere; lib/paths.ts looks in both), and the app runs it on its own
 * embedded Bun (BUN_BE_BUN=1).
 *
 * Builds are native: the addon that gets embedded is the one `bun install` fetched for this
 * machine, and so are onnxruntime's and sharp's prebuilds, so each target is built on its
 * own runner (.github/workflows/release.yml).
 */

import { spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { BunPlugin } from 'bun';

if (!process.versions.bun) {
	console.error('[build] needs Bun — `bun run build` runs `bun build.ts`');
	process.exit(1);
}

const platform = process.platform;
if (platform !== 'darwin' && platform !== 'linux' && platform !== 'win32') {
	console.error(`[build] Strata builds on macOS, Linux and Windows; nothing to build on ${platform}`);
	process.exit(1);
}

const root = fileURLToPath(new URL('./', import.meta.url));
const dist = join(root, 'dist');
const version: string = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
const os_name = { darwin: 'macos', linux: 'linux', win32: 'windows' }[platform];
const target = `${os_name}-${process.arch}`;
const exe = platform === 'win32' ? 'strata.exe' : 'strata';
const binary = join(dist, exe);
// Where the executable and its resources are staged, then archived as one top-level entry.
const bundle = platform === 'darwin' ? join(dist, 'Strata.app') : join(dist, `strata-${target}`);
const bin_dir = platform === 'darwin' ? join(bundle, 'Contents', 'MacOS') : bundle;
const resources = platform === 'darwin' ? join(bundle, 'Contents', 'Resources') : join(bundle, 'resources');
const archive = join(dist, `strata-${version}-${target}.${platform === 'linux' ? 'tar.gz' : 'zip'}`);
const identity = platform === 'darwin' ? process.env.CODESIGN_IDENTITY : undefined;
const notary = platform === 'darwin' ? process.env.NOTARY_PROFILE : undefined;

if (!existsSync(join(root, 'ml/node_modules/@huggingface/transformers/package.json'))) {
	console.error('[build] the ML dependencies are not installed; run `bun run ml:install` first');
	process.exit(1);
}

const PLIST = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>CFBundleExecutable</key>
	<string>strata</string>
	<key>CFBundleIconFile</key>
	<string>AppIcon</string>
	<key>CFBundleIdentifier</key>
	<string>dev.gpuix.svelte.strata</string>
	<key>CFBundleName</key>
	<string>Strata</string>
	<key>CFBundleDisplayName</key>
	<string>Strata</string>
	<key>CFBundleShortVersionString</key>
	<string>${version}</string>
	<key>CFBundleVersion</key>
	<string>${version}</string>
	<key>CFBundlePackageType</key>
	<string>APPL</string>
	<key>LSMinimumSystemVersion</key>
	<string>13.0</string>
	<key>NSHighResolutionCapable</key>
	<true/>
	<key>NSMicrophoneUsageDescription</key>
	<string>Strata records voice memos and transcribes them on this Mac.</string>
</dict>
</plist>
`;

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

// Imported after the guard: a static import would hoist `bun` above it.
const { load_module, load_svelte, resolve_native_cjs, resolve_svelte } = await import('gpuix-svelte/plugin');

let components = 0;
const svelte_plugin: BunPlugin = {
	name: 'gpuix-svelte',
	setup(build) {
		build.onResolve({ filter: /^@gpuix\/native$/ }, resolve_native_cjs);
		build.onResolve({ filter: /^svelte(\/|$)/ }, resolve_svelte(['custom-renderer', 'production']));
		build.onLoad({ filter: /\.svelte\.[jt]s$/ }, load_module);
		build.onLoad({ filter: /\.svelte$/ }, (args) => {
			components++;
			return load_svelte(args);
		});
	}
};

// mpg123-decoder's entry also pulls in a WebWorker class the bundler emits as undefined
// ("MPEGDecoderWebWorker is not defined" at startup), and its exports map blocks the deep
// import that would avoid it — so the decoder class is resolved directly here.
const mpg123_plugin: BunPlugin = {
	name: 'mpg123-direct',
	setup(build) {
		build.onResolve({ filter: /^mpg123-decoder$/ }, () => ({ path: 'mpg123-decoder', namespace: 'mpg123' }));
		build.onLoad({ filter: /.*/, namespace: 'mpg123' }, () => ({
			contents: `export { default as MPEGDecoder } from ${JSON.stringify(join(root, 'node_modules/mpg123-decoder/src/MPEGDecoder.js'))};`,
			loader: 'js'
		}));
	}
};

rmSync(binary, { force: true });
rmSync(bundle, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });
// Older archives for this target, whatever their version.
for (const name of readdirSync(dist)) if (/^strata-.+-(macos|linux|windows)-\w+\.(zip|tar\.gz)$/.test(name) && name.includes(`-${target}.`)) rmSync(join(dist, name), { force: true });

const result = await Bun.build({
	entrypoints: [join(root, 'standalone.ts')],
	target: 'bun',
	// Bun implies `development` unless NODE_ENV is production at build time, and
	// esm-env lists it first, so both are needed for Svelte's production runtime.
	conditions: ['custom-renderer', 'production'],
	define: { 'process.env.NODE_ENV': '"production"' },
	minify: true,
	plugins: [svelte_plugin, mpg123_plugin],
	throw: false,
	compile: {
		outfile: binary,
		autoloadBunfig: false,
		autoloadDotenv: false,
		// The metadata options need Windows' own APIs, so they are only set when building there.
		...(platform === 'win32'
			? {
					windows: {
						hideConsole: true,
						icon: await write_ico(join(root, 'icon.png'), join(dist, 'strata.ico')),
						title: 'Strata',
						version,
						description: 'Strata, a second brain: notes, links, images and voice memos'
					}
				}
			: {})
	}
});

if (!result.success) {
	for (const message of result.logs) console.error(message);
	process.exit(1);
}
if (components === 0) {
	console.error('[build] no .svelte file went through the plugin');
	process.exit(1);
}

const size = statSync(binary).size;
const floor = statSync(process.execPath).size + 12 * 1024 * 1024;
if (size < floor) {
	console.error(`[build] ${relative(root, binary)} is ${mb(size)} MB, under the ${mb(floor)} MB floor — the GPUI addon was not embedded`);
	process.exit(1);
}

mkdirSync(bin_dir, { recursive: true });
mkdirSync(join(resources, 'ml'), { recursive: true });
copyFileSync(binary, join(bin_dir, exe));
chmodSync(join(bin_dir, exe), 0o755);
if (platform === 'darwin') {
	writeFileSync(join(bundle, 'Contents', 'Info.plist'), PLIST);
	write_icns(join(root, 'icon.png'), join(resources, 'AppIcon.icns'));
}

// Each worker is bundled to one file (the lib/ modules it shares inlined) and keeps its
// real node_modules beside it: onnxruntime and sharp load from there as usual.
await bundle_worker('ml/worker.ts', 'worker.js');
await bundle_worker('ml/llm-worker.ts', 'llm-worker.js');
copyFileSync(join(root, 'ml/package.json'), join(resources, 'ml', 'package.json'));
console.log('[build] copying the ML dependencies (a few hundred MB)');
cpSync(join(root, 'ml/node_modules'), join(resources, 'ml', 'node_modules'), { recursive: true, dereference: true });
prune_foreign_runtimes(join(resources, 'ml', 'node_modules'));
prune_wasm_backend(join(resources, 'ml', 'node_modules'));

if (platform === 'darwin') {
	// AVFoundation over bun:ffi; Windows records through winmm with nothing to compile, and
	// Linux has no recorder yet.
	const { CLANG_ARGS } = await import('./lib/recorder.ts');
	mkdirSync(join(resources, 'native'), { recursive: true });
	run('clang', [...CLANG_ARGS, '-o', join(resources, 'native', 'recorder-shim.dylib'), join(root, 'native/recorder-shim.m')]);
}

console.log(`[build] ${relative(root, binary)} (${mb(size)} MB) + ${relative(root, bundle)} (${mb(dir_size(bundle))} MB)`);

if (platform === 'darwin') {
	if (!identity) {
		console.log('[build] CODESIGN_IDENTITY not set; leaving the output unsigned');
	} else {
		sign_bundle();
	}
	if (!notary) {
		console.log('[build] NOTARY_PROFILE not set; skipping notarization');
	} else if (!identity) {
		console.log('[build] NOTARY_PROFILE needs CODESIGN_IDENTITY; skipping notarization');
	} else {
		notarize(bundle);
	}
}

write_archive();
console.log(`[build] ${relative(root, archive)} (${mb(statSync(archive).size)} MB) is the one to ship`);

function mb(bytes: number) {
	return (bytes / 1048576).toFixed(1);
}

async function bundle_worker(entry: string, name: string) {
	const out = await Bun.build({
		entrypoints: [join(root, entry)],
		target: 'bun',
		external: ['@huggingface/transformers'],
		naming: name,
		throw: false
	});
	if (!out.success) {
		for (const message of out.logs) console.error(message);
		process.exit(1);
	}
	writeFileSync(join(resources, 'ml', name), await out.outputs[0].text());
}

// onnxruntime-node's tarball carries every platform's prebuilt runtime — win32 alone is
// 124 MB — and the app only ever dlopen's the host's.
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

// One top-level entry (the .app or the strata-<target> directory) in every archive.
// ditto keeps the bundle's attributes; Windows' bsdtar writes zip from the suffix, and it
// is addressed by path since a GNU tar from Git may come first on PATH.
function write_archive() {
	const name = relative(dist, bundle);
	if (platform === 'darwin') run('ditto', ['-c', '-k', '--keepParent', bundle, archive]);
	else if (platform === 'linux') run('tar', ['-czf', archive, '-C', dist, name]);
	else run(join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe'), ['-a', '-cf', archive, '-C', dist, name]);
}

// Nested Mach-O files (the addons and their dylibs under Resources) are signed
// first, inside out, as Apple's notarization requires; --deep is not enough.
function sign_bundle() {
	const entitlements = join(dist, 'entitlements.plist');
	writeFileSync(entitlements, ENTITLEMENTS);
	const nested = [];
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
	run('codesign', ['--force', '--options', 'runtime', '--timestamp', '--entitlements', entitlements, '--sign', identity!, join(bin_dir, exe)]);
	run('codesign', ['--force', '--options', 'runtime', '--timestamp', '--entitlements', entitlements, '--sign', identity!, bundle]);
	run('codesign', ['--verify', '--strict', bundle]);
	console.log(`[build] signed ${relative(root, bundle)} (${nested.length} nested binaries) as ${identity}`);
}

// The ticket is stapled into the bundle, so the shipping zip is written afterwards.
function notarize(target: string) {
	const zip = join(dist, 'notarize.zip');
	run('ditto', ['-c', '-k', '--keepParent', target, zip]);
	console.log('[build] notarizing (Apple usually takes a few minutes)');
	const output = run('xcrun', ['notarytool', 'submit', zip, '--keychain-profile', notary!, '--wait']);
	rmSync(zip, { force: true });
	if (!/status: Accepted/.test(output)) {
		console.error(`[build] notarization was not accepted; see \`xcrun notarytool log\` for the submission below\n${output}`);
		process.exit(1);
	}
	run('xcrun', ['stapler', 'staple', target]);
	run('spctl', ['--assess', '--type', 'execute', target]);
	console.log('[build] notarized and stapled');
}

// iconutil only reads an .iconset directory holding the ten standard sizes,
// which sips cuts from the 1024px source; both ship with macOS.
function write_icns(png: string, out: string) {
	const iconset = join(dist, 'AppIcon.iconset');
	rmSync(iconset, { recursive: true, force: true });
	mkdirSync(iconset);
	for (const points of [16, 32, 128, 256, 512]) {
		run('sips', ['-z', `${points}`, `${points}`, png, '--out', join(iconset, `icon_${points}x${points}.png`)]);
		run('sips', ['-z', `${points * 2}`, `${points * 2}`, png, '--out', join(iconset, `icon_${points}x${points}@2x.png`)]);
	}
	run('iconutil', ['-c', 'icns', iconset, '-o', out]);
	rmSync(iconset, { recursive: true, force: true });
}

// A Windows .ico whose single entry is a 256px PNG (allowed since Vista), resized with
// Bun.Image so nothing has to be installed for it. Returns the path for `compile.windows.icon`.
async function write_ico(png: string, out: string) {
	const image = await Bun.file(png).image().resize(256, 256).png().toBuffer();
	const header = Buffer.alloc(22);
	header.writeUInt16LE(0, 0); // reserved
	header.writeUInt16LE(1, 2); // type: icon
	header.writeUInt16LE(1, 4); // one image
	header.writeUInt8(0, 6); // width, 0 meaning 256
	header.writeUInt8(0, 7); // height
	header.writeUInt8(0, 8); // no palette
	header.writeUInt8(0, 9); // reserved
	header.writeUInt16LE(1, 10); // colour planes
	header.writeUInt16LE(32, 12); // bits per pixel
	header.writeUInt32LE(image.length, 14);
	header.writeUInt32LE(header.length, 18); // offset of the image data
	writeFileSync(out, Buffer.concat([header, image]));
	return out;
}

function run(command: string, args: string[]) {
	const { status, stdout, stderr, error } = spawnSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
	if (status !== 0) {
		console.error(`[build] ${command} ${args.join(' ')} failed:\n${error?.message ?? ''}${stderr || stdout}`);
		process.exit(1);
	}
	return stdout;
}
