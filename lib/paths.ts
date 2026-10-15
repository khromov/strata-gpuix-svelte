import { existsSync, mkdirSync, renameSync } from 'node:fs';
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

/**
 * A compiled .app keeps the ML worker, its dependencies and the recorder shim in
 * Contents/Resources; from a checkout there is no such directory and this is null.
 */
export function resources_dir(): string | null {
	if (resources !== undefined) return resources;
	const forced = process.env.GPUIX_BRAIN_RESOURCES;
	const candidate = forced || join(dirname(process.execPath), '..', 'Resources');
	resources = existsSync(join(candidate, 'ml', 'worker.js')) ? candidate : null;
	return resources;
}

function app_data_dir() {
	if (process.platform === 'darwin') return moved(join(homedir(), 'Library', 'Application Support'), 'Substrate', 'Strata');
	if (process.platform === 'win32') return moved(process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming'), 'Substrate', 'Strata');
	return moved(process.env.XDG_DATA_HOME ?? join(homedir(), '.local', 'share'), 'substrate', 'strata');
}

/** `base/name`, after moving `base/old` there if only that exists: the app was called Substrate before the rename. */
function moved(base: string, old: string, name: string) {
	const dir = join(base, name);
	if (!existsSync(dir) && existsSync(join(base, old))) renameSync(join(base, old), dir);
	return dir;
}

/** Inside the checkout's example directory, or the OS's application data directory for a compiled app. */
export const default_root = () => (resources_dir() ? app_data_dir() : fileURLToPath(new URL('../.data', import.meta.url)));

/**
 * The database in a data directory. It was substrate.sqlite before the rename, and loam.sqlite
 * before that; one left under an old name moves here, with its WAL and shared-memory files.
 */
export function database_path(root: string): string {
	const db = join(root, 'strata.sqlite');
	const old = ['substrate.sqlite', 'loam.sqlite'].map((name) => join(root, name)).find((path) => existsSync(path));
	if (old && !existsSync(db)) {
		for (const suffix of ['', '-wal', '-shm']) {
			if (existsSync(`${old}${suffix}`)) renameSync(`${old}${suffix}`, `${db}${suffix}`);
		}
	}
	return db;
}

export function data_dirs(root: string = process.env.GPUIX_BRAIN_DIR || default_root()): DataDirs {
	const dirs: DataDirs = {
		root,
		db: database_path(root),
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
