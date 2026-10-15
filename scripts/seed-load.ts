/**
 * Fills a separate brain with generated items for load testing: Wikipedia articles become
 * links and notes, picsum.photos photos become images, and voice memos are spoken by macOS
 * `say` with their transcript filled in. Every item goes through the real pipeline
 * (chunking, embedding, CLIP), so search, Related and Ask see what they would at that size.
 * Downloads are cached in `.data/seed-corpus`, so a second run needs no network.
 *
 * The real brain is never written: the load brain starts as a `VACUUM INTO` copy of it and
 * shares its downloaded models. Running again adds another batch; `--fresh` starts over.
 *
 *   bun run seed-load [count] [--dir .data/load] [--fresh]
 *   GPUIX_BRAIN_DIR=.data/load bun run start
 */

if (!process.versions.bun) {
	console.error('[seed-load] needs Bun');
	process.exit(1);
}

// The copied brain may subscribe to feeds; polling them here would only add noise.
process.env.GPUIX_BRAIN_FEEDS = '0';

import { existsSync, mkdirSync, rmSync, symlinkSync } from 'node:fs';
import { join, resolve } from 'node:path';

const args = process.argv.slice(2);
const flag = (name: string) => {
	const i = args.indexOf(name);
	return i === -1 ? null : (args[i + 1] ?? null);
};
const count = Number(args.find((a) => /^\d+$/.test(a))) || 5000;
const fresh = args.includes('--fresh');

const { Database } = await import('bun:sqlite');
const { default_root } = await import('../lib/paths.ts');
const real = default_root();
const dir = resolve(flag('--dir') ?? join(real, 'load'));
if (dir === resolve(real)) {
	console.error('[seed-load] refusing to write into the real brain; pass another --dir');
	process.exit(1);
}
const db_path = join(dir, 'substrate.sqlite');
// Beside the real brain rather than in the load one, so `--fresh`, another `--dir` or a
// deleted load brain all reuse what was downloaded.
const corpus = join(real, 'seed-corpus');
mkdirSync(join(corpus, 'picsum'), { recursive: true });
if (fresh) {
	for (const suffix of ['', '-wal', '-shm']) rmSync(`${db_path}${suffix}`, { force: true });
	rmSync(join(dir, 'cache'), { recursive: true, force: true });
}
if (!existsSync(db_path) && existsSync(join(real, 'substrate.sqlite'))) {
	// VACUUM INTO reads through the WAL, so the copy is consistent even while the app is open.
	new Database(join(real, 'substrate.sqlite'), { readonly: true }).run('VACUUM INTO ?', [db_path]);
	console.log(`[seed-load] copied ${real} into ${dir}`);
}
if (!existsSync(join(dir, 'models'))) symlinkSync(join(real, 'models'), join(dir, 'models'));

const { create_app } = await import('../lib/app.ts');
const { LocalStub } = await import('../lib/ml-stub.ts');
const { derive_title, segments_to_markdown } = await import('../lib/media.ts');
const { encode_mp3 } = await import('../lib/mp3.ts');
const { decode_wav } = await import('../lib/wav.ts');
const { normalize_url } = await import('../lib/scrape.ts');

// mulberry32: the mix of kinds, lengths and dates repeats for the same corpus.
let seed = 0x5eed;
const rand = () => {
	seed = (seed + 0x6d2b79f5) | 0;
	let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
	t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
	return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const int = (lo: number, hi: number) => lo + Math.floor(rand() * (hi - lo + 1));
const pick = <T>(list: T[]): T => list[Math.floor(rand() * list.length)];
const sentences = (text: string) => text.split(/(?<=[.!?])\s+/).filter((s) => s.length > 3);
// Two years of history, so the timeline has a long tail to scroll through.
const when = () => Date.now() - Math.floor(rand() * 2 * 365 * 24 * 3600_000);

async function each<T>(list: T[], concurrency: number, fn: (x: T, i: number) => Promise<void>) {
	let next = 0;
	await Promise.all(
		Array.from({ length: concurrency }, async () => {
			while (next < list.length) {
				const i = next++;
				await fn(list[i], i);
			}
		})
	);
}

const UA = 'substrate-seed-load/1.0 (https://khromov.github.io/gpuix-svelte/)';

interface Article {
	id: number;
	title: string;
	url: string;
	text: string;
}

/** Random articles' lead sections, twenty a request, cached across runs. */
async function wikipedia(n: number): Promise<Article[]> {
	const file = join(corpus, 'wikipedia.json');
	const have: Article[] = existsSync(file) ? await Bun.file(file).json() : [];
	const seen = new Set(have.map((a) => a.id));
	const params = 'action=query&format=json&formatversion=2&generator=random&grnnamespace=0&grnlimit=20&prop=extracts|info&inprop=url&exintro=1&explaintext=1&exlimit=20';
	while (have.length < n) {
		const res = await fetch(`https://en.wikipedia.org/w/api.php?${params}`, { headers: { 'user-agent': UA } });
		if (!res.ok) throw new Error(`Wikipedia answered ${res.status}`);
		const { query } = (await res.json()) as { query?: { pages: Array<{ pageid: number; title: string; fullurl: string; extract?: string }> } };
		for (const p of query?.pages ?? []) {
			const text = (p.extract ?? '').trim();
			if (text.length < 80 || seen.has(p.pageid)) continue;
			seen.add(p.pageid);
			have.push({ id: p.pageid, title: p.title, url: p.fullurl, text });
		}
		process.stdout.write(`\r[seed-load] wikipedia ${Math.min(have.length, n)}/${n}`);
		await Bun.write(file, JSON.stringify(have));
	}
	if (n) process.stdout.write('\n');
	return have;
}

interface Photo {
	id: string;
	author: string;
	url: string;
	file: string;
}

/** picsum.photos serves about a thousand Unsplash photos by id; a larger run reuses them. */
async function photos(n: number): Promise<Photo[]> {
	const list_file = join(corpus, 'picsum.json');
	let list: Array<{ id: string; author: string; url: string }> = existsSync(list_file) ? await Bun.file(list_file).json() : [];
	if (!list.length) {
		for (let page = 1; ; page++) {
			const batch = (await (await fetch(`https://picsum.photos/v2/list?page=${page}&limit=100`)).json()) as typeof list;
			if (!batch.length) break;
			list.push(...batch);
		}
		await Bun.write(list_file, JSON.stringify(list));
	}
	list = list.slice(0, n);
	let done = 0;
	const ok: Photo[] = [];
	await each(list, 8, async (p) => {
		const file = join(corpus, 'picsum', `${p.id}.jpg`);
		if (!existsSync(file)) {
			const res = await fetch(`https://picsum.photos/id/${p.id}/800/600.jpg`).catch(() => null);
			if (res?.ok) await Bun.write(file, await res.arrayBuffer());
		}
		if (existsSync(file)) ok.push({ ...p, file });
		process.stdout.write(`\r[seed-load] photos ${++done}/${list.length}`);
	});
	if (list.length) process.stdout.write('\n');
	return ok.sort((a, b) => Number(a.id) - Number(b.id));
}

const n_links = Math.round(count * 0.4);
const n_notes = Math.round(count * 0.35);
const n_images = Math.round(count * 0.17);
const n_audio = count - n_links - n_notes - n_images;
const can_speak = process.platform === 'darwin';

const articles = await wikipedia(n_links + (can_speak ? n_audio : 0));
const pictures = await photos(n_images);

// Describing 850 photos with Gemma would take the better part of an hour.
const app = await create_app({ data_dir: dir, local: new LocalStub({ available: false, reason: 'seed-load skips image descriptions' }) });
const { store, blobs, db } = app;
const before = store.counts().total;
const started = performance.now();
const ids: number[] = [];

db.transaction(() => {
	for (const a of articles.slice(0, n_links)) {
		const source_url = normalize_url(a.url);
		if (store.get_item_by_url(source_url)) continue;
		const created_at = when();
		const item = store.insert_item({
			kind: 'link',
			title: a.title,
			body: a.text,
			source_url,
			created_at,
			meta: { auto_title: false, site_name: 'Wikipedia', canonical_url: a.url, final_url: a.url, excerpt: sentences(a.text)[0], lang: 'en', fetched_at: created_at }
		});
		ids.push(item.id);
	}

	// Mostly short jottings, some written-up notes, and a tail of long ones that stress
	// chunking and the item view.
	const OPENERS = ['Idea:', 'TODO:', 'Look into', 'Remember:', 'Worth reading again:', 'From the podcast:', ''];
	for (let i = 0; i < n_notes; i++) {
		const roll = rand();
		let body: string;
		if (roll < 0.5) {
			body = rand() < 0.3
				? `Reading list\n\n${Array.from({ length: int(3, 7) }, () => `- [${rand() < 0.4 ? 'x' : ' '}] ${pick(articles).title}`).join('\n')}`
				: `${pick(OPENERS)} ${sentences(pick(articles).text).slice(0, int(1, 2)).join(' ')}`.trim();
		} else if (roll < 0.85) {
			const a = pick(articles);
			const rest = sentences(pick(articles).text).slice(0, int(2, 5));
			body = `# ${a.title}\n\n${a.text}\n\n## Related\n\n${rest.map((s) => `- ${s}`).join('\n')}`;
		} else {
			const parts = Array.from({ length: int(8, 25) }, () => pick(articles));
			body = `# Research notes: ${parts[0].title}\n\n${parts.map((a) => `## ${a.title}\n\n${a.text}`).join('\n\n')}`;
		}
		const item = store.insert_item({ kind: 'text', title: derive_title(body), body, created_at: when(), meta: { auto_title: true } });
		ids.push(item.id);
	}
})();
console.log(`[seed-load] ${ids.length} links and notes inserted`);

let added_images = 0;
await each(Array.from({ length: pictures.length ? n_images : 0 }, (_, i) => i), 4, async (i) => {
	const p = pictures[i % pictures.length];
	const slug = p.url.split('/').pop();
	const bytes = new Uint8Array(await Bun.file(p.file).arrayBuffer());
	const item = await app.add_image({ bytes, name: `unsplash-${slug}${i >= pictures.length ? `-${i}` : ''}.jpg`, ext: 'jpg' });
	db.run('UPDATE items SET created_at = ? WHERE id = ?', [when(), item.id]);
	process.stdout.write(`\r[seed-load] images ${++added_images}/${n_images}`);
});
if (added_images) process.stdout.write('\n');

// A memo's transcript is filled in, so the pipeline embeds it instead of running Whisper;
// the MP3 is `say` reading that transcript, with segment times spread by length.
let added_audio = 0;
const memos = can_speak ? articles.slice(n_links, n_links + n_audio) : [];
const SPOKEN = ['Quick note.', 'Okay, so', 'Reminder to self:', 'Thinking out loud here.', ''];
await each(memos, 6, async (a, i) => {
	const lines = [rand() < 0.3 ? pick(SPOKEN) : '', ...sentences(a.text).slice(0, int(1, 4))].filter(Boolean);
	const wav = join(app.dirs.tmp, `seed-memo-${i}.wav`);
	const say = Bun.spawn(['say', '-o', wav, '--data-format=LEI16@16000', lines.join(' ')]);
	if ((await say.exited) !== 0) return;
	const bytes = new Uint8Array(await Bun.file(wav).arrayBuffer());
	rmSync(wav, { force: true });
	const { samples, sampleRate } = decode_wav(bytes);
	const duration = samples.length / sampleRate;
	const total = lines.reduce((n, l) => n + l.length, 0);
	let at = 0;
	const segments = lines.map((text) => {
		const start = at;
		at += (text.length / total) * duration;
		return { start, end: at, text };
	});
	const body = segments_to_markdown(segments, lines.join(' '));
	const item = store.insert_item({
		kind: 'audio',
		title: derive_title(body),
		body,
		duration,
		created_at: when(),
		meta: { auto_title: true, original_name: `Recording ${i + 1}.wav`, recorded: true, segments, language: 'en', compacted: true }
	});
	store.update_item(item.id, { file_blob: blobs.put(item.id, 'original', await encode_mp3(bytes), 'mp3') });
	ids.push(item.id);
	process.stdout.write(`\r[seed-load] voice memos ${++added_audio}/${memos.length}`);
});
if (added_audio) process.stdout.write('\n');
if (!can_speak && n_audio) console.log(`[seed-load] no \`say\` on ${process.platform}; skipped ${n_audio} voice memos`);

for (const id of ids) app.ingest.enqueue(id);
const progress = setInterval(() => {
	const q = app.ingest.stats;
	console.log(`[seed-load] pipeline: ${q.done} done, ${q.pending} queued, ${q.failed} failed · ${app.vectors.size} text vectors, ${app.images.size} image vectors`);
}, 10_000);
await app.ingest.idle();
clearInterval(progress);
console.log(`[seed-load] pipeline idle after ${((performance.now() - started) / 1000).toFixed(0)}s`);

const QUERIES = ['dog', 'medieval castle', 'football club founded', 'river in poland', 'a photo of mountains', 'reminder', 'kind:image beach', 'kind:audio quick note', 'species of beetle', 'compost'];
console.log('\n[seed-load] search, best of three:');
for (const q of QUERIES) {
	let best = Infinity;
	let result: Awaited<ReturnType<typeof app.search>> | null = null;
	for (let i = 0; i < 3; i++) {
		const t = performance.now();
		result = await app.search(q, { limit: 30 });
		best = Math.min(best, performance.now() - t);
	}
	const top = result!.hits[0];
	console.log(`  ${best.toFixed(1).padStart(6)} ms  ${String(result!.hits.length).padStart(2)} hits  ${q.padEnd(24)} ${top ? `${top.item.kind}: ${top.item.title.slice(0, 50)}` : ''}`);
}

const counts = store.counts();
const mb = (Bun.file(db_path).size / 1e6).toFixed(0);
console.log(`\n[seed-load] ${counts.total - before} items added · ${counts.total} total · ${app.vectors.size} text vectors · ${app.images.size} image vectors · ${mb} MB database`);
console.log(`[seed-load] open it with: GPUIX_BRAIN_DIR=${dir} bun run start`);
app.close();
process.exit(0);
