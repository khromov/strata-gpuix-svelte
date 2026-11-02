/**
 * In-app updates: gpuix-svelte/update as UI state. A built app reads the manifest the build baked
 * in once at startup, or when asked in Settings; installing swaps the .app and restarts it. Under
 * `bun run start` there is no manifest, so a check resolves to null without touching the network.
 */

import { app_info, check_for_update, finish_update, updated_from, type NotInstallable, type Update } from 'gpuix-svelte/update';
import type { App } from './app.ts';
import { warn } from './log.ts';
import { toast } from './ui.svelte.ts';

export type UpdatePhase = 'idle' | 'checking' | 'current' | 'available' | 'downloading' | 'installing';

export const updates = $state<{ phase: UpdatePhase; update: Update | null; progress: number | null; error: string | null }>({
	phase: 'idle',
	update: null,
	/** Percent of the download, null while its size is unknown. */
	progress: null,
	error: null
});

const WHY_NOT: Record<NotInstallable, string> = {
	development: "Running from source, so this copy can't replace itself.",
	'no-asset': 'This release has no build for this computer.',
	translocated: 'Move Strata to Applications and open it from there, and it can update itself.',
	'read-only': "Strata can't write to the folder it is in, so it can't replace itself.",
	unsupported: "This copy of Strata can't replace itself."
};

export const why_not = (update: Update) => (update.reason ? WHY_NOT[update.reason] : WHY_NOT.unsupported);

/** What the build embedded; null from a checkout. */
export const running_version = () => app_info()?.version ?? null;

export const update_busy = () => updates.phase === 'checking' || updates.phase === 'downloading' || updates.phase === 'installing';

// A check that never answers would hold the phase at `checking`, which disables the button that
// could retry it. Raced in check_updates rather than passed as check_for_update's `fetch`, since
// the Update it returns downloads the archive through that same `fetch`.
const CHECK_TIMEOUT_MS = 30_000;

let started = false;

/** Once per process, since a hot remount calls this again. */
export function start_updates(app: App) {
	if (started) return;
	started = true;
	const from = updated_from();
	if (from) toast(`Updated from ${from} to ${running_version()}`, 'success');
	if (process.env.GPUIX_BRAIN_OFFLINE === '1' || app.settings.get('updates.auto') === false) {
		// A check does this cleanup itself; without one, an interrupted update's files still have to go.
		try {
			finish_update();
		} catch (err) {
			warn(`cleaning up after an earlier update failed: ${(err as Error).message}`);
		}
		return;
	}
	void check_updates();
}

export async function check_updates({
	manual = false,
	check = check_for_update,
	timeout_ms = CHECK_TIMEOUT_MS
}: { manual?: boolean; check?: () => Promise<Update | null>; timeout_ms?: number } = {}) {
	if (update_busy()) return;
	updates.phase = 'checking';
	updates.error = null;
	let timer: ReturnType<typeof setTimeout> | undefined;
	const timed_out = new Promise<never>((_, reject) => {
		timer = setTimeout(() => reject(new Error('the update check timed out')), timeout_ms);
	});
	try {
		updates.update = await Promise.race([check(), timed_out]);
		updates.phase = updates.update ? 'available' : 'current';
	} catch (err) {
		updates.phase = updates.update ? 'available' : 'idle';
		// A new release's manifest is a 404 until its build finishes, and a laptop is often offline,
		// so nobody needs to hear about a check they did not ask for.
		if (manual) updates.error = (err as Error).message;
		else warn(`update check failed: ${(err as Error).message}`);
	} finally {
		clearTimeout(timer);
	}
}

export async function install_update() {
	const update = updates.update;
	if (!update || updates.phase !== 'available') return;
	updates.phase = 'downloading';
	updates.progress = null;
	updates.error = null;
	try {
		await update.download({
			onProgress: (received, total) => {
				updates.progress = total ? Math.round((received / total) * 100) : null;
			}
		});
		updates.phase = 'installing';
		// Extracting is synchronous and blocks the frame loop, so the label has to paint first.
		await new Promise((resolve) => setTimeout(resolve, 100));
		// On success this never returns: the new version starts and this process exits, through
		// the same exit handlers as closing the window, so the workers go with it.
		await update.install();
	} catch (err) {
		updates.phase = 'available';
		updates.error = (err as Error).message;
	}
}
