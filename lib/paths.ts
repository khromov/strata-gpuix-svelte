import { existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface DataDirs {
	root: string;
	db: string;
	cache: string;
	models: string;
	tmp: string;
}

let resources: string | null | undefined;

/** Bun serves a compiled app's entry from a virtual filesystem: `/$bunfs/`, `B:\\~BUN\\` on Windows. */
export const is_compiled = () => /^\/\$bunfs\/|[\\/]~BUN[\\/]/.test(Bun.main);

/**
 * A compiled .app keeps the ML worker, its dependencies and the recorder shim in
 * Contents/Resources; on Windows and Linux lib/runtime.ts unpacks them and says where through
 * use_resources. From a checkout there is no such directory and this is null.
 */
export function resources_dir(): string | null {
	if (resources !== undefined) return resources;
	const forced = process.env.GPUIX_BRAIN_RESOURCES;
	const candidate = forced || join(dirname(process.execPath), '..', 'Resources');
	resources = existsSync(join(candidate, 'ml', 'worker.js')) ? candidate : null;
	return resources;
}

export function use_resources(dir: string) {
	resources = dir;
}

export function app_data_dir() {
	if (process.platform === 'darwin') return join(homedir(), 'Library', 'Application Support', 'Strata');
	if (process.platform === 'win32') return join(process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming'), 'Strata');
	return join(process.env.XDG_DATA_HOME ?? join(homedir(), '.local', 'share'), 'strata');
}

/** Inside the checkout, or the OS's application data directory for a compiled app. */
export const default_root = () => (is_compiled() ? app_data_dir() : fileURLToPath(new URL('../.data', import.meta.url)));

export function data_dirs(root: string = process.env.GPUIX_BRAIN_DIR || default_root()): DataDirs {
	const dirs: DataDirs = {
		root,
		db: join(root, 'strata.sqlite'),
		cache: join(root, 'cache'),
		models: join(root, 'models'),
		tmp: join(root, 'tmp')
	};
	for (const dir of [root, dirs.cache, dirs.models, dirs.tmp]) mkdirSync(dir, { recursive: true });
	return dirs;
}

/**
 * Blob rows are immutable — a replacement gets a new id — so this name stays valid for
 * the life of the bytes and a stale cache file cannot happen.
 */
export const cache_path = (dirs: DataDirs, blob_id: number, ext: string) =>
	join(dirs.cache, `${blob_id}.${String(ext).replace(/^\./, '').toLowerCase() || 'bin'}`);
