import { dlopen, ptr } from 'bun:ffi';
import { track } from './lifecycle.ts';
import { error } from './log.ts';
import { open_url } from './shell.ts';

export type FileKinds = 'image' | 'audio' | 'any';

interface ChooseOptions {
	kinds: FileKinds;
	multiple: boolean;
	prompt: string;
}

const UTIS: Partial<Record<FileKinds, string>> = {
	image: '{"public.image"}',
	audio: '{"com.microsoft.waveform-audio", "public.mp3"}'
};

const LINUX_FILTERS: Partial<Record<FileKinds, string>> = {
	image: 'Images | *.png *.jpg *.jpeg *.gif *.webp *.bmp *.heic *.tiff',
	audio: 'Audio | *.wav *.mp3'
};

export function picker_available(): { ok: boolean; reason?: string } {
	if (process.platform === 'darwin') return { ok: true };
	if (process.platform === 'linux' && (Bun.which('zenity') || Bun.which('kdialog'))) return { ok: true };
	return { ok: false, reason: `no file picker on ${process.platform} — type a path instead` };
}

/** Empty on cancel. */
export async function choose_files({ kinds = 'any', multiple = false, prompt = 'Add to Strata' }: Partial<ChooseOptions> = {}): Promise<string[]> {
	if (process.platform === 'darwin') return choose_mac({ kinds, multiple, prompt });
	if (process.platform === 'linux') return choose_linux({ kinds, multiple, prompt });
	throw new Error(picker_available().reason);
}

const escape_applescript = (s: string) => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

/** `as list` makes the single-selection alias and the multi-selection list read the same. */
async function choose_mac({ kinds, multiple, prompt }: ChooseOptions): Promise<string[]> {
	const types = UTIS[kinds] ? ` of type ${UTIS[kinds]}` : '';
	const selections = `${multiple ? 'with' : 'without'} multiple selections allowed`;
	const lines = [
		`set f to (choose file${types} with prompt "${escape_applescript(prompt)}" ${selections}) as list`,
		'set out to ""',
		'repeat with p in f',
		'set out to out & (POSIX path of p) & linefeed',
		'end repeat',
		'return out'
	];
	const { stdout, stderr, code } = await run(['osascript', ...lines.flatMap((line) => ['-e', line])]);
	if (code !== 0) {
		if (/-128/.test(stderr)) return [];
		throw new Error(stderr.trim() || `osascript exited ${code}`);
	}
	return stdout.split('\n').map((s) => s.trim()).filter(Boolean);
}

/** Empty on cancel. The bytes live in the database, so saving one out is an export. */
export async function choose_save_path(name: string, { prompt = 'Export from Strata' }: { prompt?: string } = {}): Promise<string> {
	if (process.platform === 'darwin') {
		const lines = [`return POSIX path of (choose file name with prompt "${escape_applescript(prompt)}" default name "${escape_applescript(name)}")`];
		const { stdout, stderr, code } = await run(['osascript', ...lines.flatMap((line) => ['-e', line])]);
		if (code !== 0) {
			if (/-128/.test(stderr)) return '';
			throw new Error(stderr.trim() || `osascript exited ${code}`);
		}
		return stdout.trim();
	}
	if (process.platform === 'linux') {
		let cmd: string[];
		if (Bun.which('zenity')) cmd = ['zenity', '--file-selection', '--save', '--confirm-overwrite', `--title=${prompt}`, `--filename=${name}`];
		else if (Bun.which('kdialog')) cmd = ['kdialog', '--getsavefilename', name, '--title', prompt];
		else throw new Error(picker_available().reason);
		const { stdout, code } = await run(cmd);
		return code === 0 ? stdout.trim() : '';
	}
	throw new Error(picker_available().reason);
}

async function choose_linux({ kinds, multiple, prompt }: ChooseOptions): Promise<string[]> {
	let cmd: string[];
	if (Bun.which('zenity')) {
		cmd = ['zenity', '--file-selection', `--title=${prompt}`];
		if (multiple) cmd.push('--multiple', '--separator=\n');
		if (LINUX_FILTERS[kinds]) cmd.push(`--file-filter=${LINUX_FILTERS[kinds]}`);
	} else if (Bun.which('kdialog')) {
		cmd = ['kdialog', '--getopenfilename', ...(multiple ? ['--multiple', '--separate-output'] : []), '.', '--title', prompt];
	} else {
		throw new Error(picker_available().reason);
	}
	const { stdout, code } = await run(cmd);
	if (code !== 0) return [];
	return stdout.split('\n').map((s) => s.trim()).filter(Boolean);
}

async function run(cmd: string[]) {
	const proc = track(Bun.spawn(cmd, { stdin: 'ignore', stdout: 'pipe', stderr: 'pipe' }));
	const [stdout, stderr, code] = await Promise.all([
		new Response(proc.stdout).text(),
		new Response(proc.stderr).text(),
		proc.exited
	]);
	return { stdout, stderr, code };
}

const RELEASES = 'https://github.com/khromov/strata-gpuix-svelte/releases';

/** A Windows app has no console, and a Linux one started from the desktop shows none. */
function show_error(title: string, message: string) {
	if (process.platform === 'win32') {
		const wide = (text: string) => Buffer.from(`${text}\0`, 'utf16le');
		const user32 = dlopen('user32.dll', { MessageBoxW: { args: ['ptr', 'ptr', 'ptr', 'u32'], returns: 'i32' } });
		const MB_ICONERROR = 0x10;
		user32.symbols.MessageBoxW(null, ptr(wide(message)), ptr(wide(title)), MB_ICONERROR);
		return;
	}
	if (Bun.which('zenity')) Bun.spawnSync(['zenity', '--error', '--no-markup', `--title=${title}`, `--text=${message}`]);
	else if (Bun.which('kdialog')) Bun.spawnSync(['kdialog', '--title', title, '--error', message]);
}

/**
 * create_app() failed in a built app, which has no window yet and no terminal, so without this it
 * would just disappear. After an update this is the one way out: the old version has already
 * exited, so nothing rolls this one back (see standalone.ts).
 */
export function startup_failed(err: unknown, updated_from: string | null): never {
	const reason = (err as Error)?.message ?? String(err);
	error('could not start:', err);
	const lead = updated_from ? `Strata was just updated from ${updated_from}, and this version could not start.` : 'Strata could not start.';
	const message = `${lead}\n\n${reason}\n\nYour notes are stored separately from the app. Other versions are on the releases page.`;
	if (process.platform === 'darwin') {
		// As an argument rather than in the script, so nothing in the error can break out of it.
		const lines = [
			'on run argv',
			'return button returned of (display alert "Strata could not start" message (item 1 of argv) as critical buttons {"Quit", "Open releases page"} default button "Quit")',
			'end run'
		];
		const { stdout } = Bun.spawnSync(['osascript', ...lines.flatMap((line) => ['-e', line]), message]);
		if (stdout.toString().trim() === 'Open releases page') open_url(RELEASES);
	} else {
		try {
			show_error('Strata could not start', `${message}\n\n${RELEASES}`);
		} catch (dialog_err) {
			error('could not show the startup error:', dialog_err);
		}
	}
	process.exit(1);
}
