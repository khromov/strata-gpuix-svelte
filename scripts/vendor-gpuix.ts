/**
 * Installs gpuix-svelte from a git ref instead of npm, for when Strata needs something that is on
 * gpuix-svelte's main but not in a release yet. Bun refuses gpuix-svelte as a git dependency: its
 * own svelte is a `file:` tarball, which Bun allows only in the root project. So this clones the
 * ref, packs it with gpuix-svelte's own `scripts/publish.ts pack` (the tarball `npm publish` would
 * upload), puts it in vendor/ as gpuix-svelte-<version>-<sha>.tgz, points package.json at it and
 * runs `bun install`. Needs git, Node (publish.ts runs under it) and npm.
 *
 *   bun run vendor-gpuix [ref]     # a branch, tag or commit; default main
 *
 * Back to npm: set "gpuix-svelte": "^x.y.z" in package.json, delete vendor/ and run `bun install`.
 */

import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const REPO = 'https://github.com/khromov/gpuix-svelte.git';

const ref = process.argv[2] ?? 'main';
const root = join(import.meta.dir, '..');
const vendor = join(root, 'vendor');
const manifest = join(root, 'package.json');

function run(cmd: string[], cwd: string) {
	console.log(`[vendor-gpuix] ${cmd.join(' ')}`);
	const { exitCode } = Bun.spawnSync(cmd, { cwd, stdout: 'inherit', stderr: 'inherit' });
	if (exitCode !== 0) throw new Error(`${cmd[0]} exited with ${exitCode}`);
}

function output(cmd: string[], cwd: string) {
	const { exitCode, stdout } = Bun.spawnSync(cmd, { cwd });
	if (exitCode !== 0) throw new Error(`${cmd.join(' ')} exited with ${exitCode}`);
	return stdout.toString().trim();
}

const work = mkdtempSync(join(tmpdir(), 'gpuix-svelte-'));
try {
	const src = join(work, 'src');
	const out = join(work, 'out');
	mkdirSync(src);
	run(['git', 'init', '--quiet'], src);
	run(['git', 'fetch', '--quiet', '--depth', '1', REPO, ref], src);
	run(['git', 'checkout', '--quiet', '--detach', 'FETCH_HEAD'], src);
	const sha = output(['git', 'rev-parse', '--short=7', 'HEAD'], src);

	run(['bun', 'install', '--frozen-lockfile'], src);
	run(['node', 'scripts/publish.ts', 'pack', out], src);

	const packed = readdirSync(out).filter((f) => f.endsWith('.tgz'));
	if (packed.length !== 1) throw new Error(`expected one tarball from pack, found ${packed.length}`);
	const name = packed[0]!.replace(/\.tgz$/, `-${sha}.tgz`);

	mkdirSync(vendor, { recursive: true });
	for (const old of readdirSync(vendor).filter((f) => f.startsWith('gpuix-svelte-') && f.endsWith('.tgz'))) {
		rmSync(join(vendor, old));
	}
	copyFileSync(join(out, packed[0]!), join(vendor, name));

	const json = JSON.parse(readFileSync(manifest, 'utf8'));
	json.dependencies['gpuix-svelte'] = `file:vendor/${name}`;
	writeFileSync(manifest, JSON.stringify(json, null, '\t') + '\n');

	run(['bun', 'install'], root);
	console.log(`[vendor-gpuix] gpuix-svelte is now vendor/${name} (${ref} at ${sha})`);
} finally {
	rmSync(work, { recursive: true, force: true });
}
