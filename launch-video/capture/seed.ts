/**
 * Builds the brain the video films, in launch-video/out/brain, through the real pipeline:
 * real pages scraped, memos spoken by macOS `say` and transcribed by Whisper, photos embedded
 * by CLIP, all on the CPU. The real brain is never read or written; only the downloaded models
 * are shared, through a symlink. Gemma is never loaded (see scripted-llm.ts).
 *
 *   bun launch-video/capture/seed.ts      from the project root
 */

if (!process.versions.bun) {
	console.error('[seed] needs Bun');
	process.exit(1);
}

process.env.GPUIX_BRAIN_FEEDS = '0';

import { existsSync, mkdirSync, rmSync, symlinkSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { create_app } from '../../lib/app.ts';
import { ScriptedLlm } from './scripted-llm.ts';

const root = resolve(import.meta.dir, '../..');
const dir = join(root, 'launch-video/out/brain');
const photos = join(root, '.data/seed-corpus/picsum');
const tmp = join(root, 'launch-video/out/brain-audio');

rmSync(dir, { recursive: true, force: true });
rmSync(tmp, { recursive: true, force: true });
mkdirSync(dir, { recursive: true });
mkdirSync(tmp, { recursive: true });
symlinkSync(join(root, '.data/models'), join(dir, 'models'));

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

// `ago` is how long before now each item was saved; the timeline sorts on it.
const NOTES = [
	{
		ago: 2 * DAY,
		title: 'Skye trip, to sort out',
		body: '- Book the van onto the ferry\n- Glenbrittle campsite takes no bookings in May, arrive before 4 pm\n- Midges start in late May, pack the head nets\n- Ask Morag about the road to Elgol'
	},
	{ ago: 5 * DAY, title: 'Pricing page feedback', body: 'Anna thinks three tiers is one too many. The annual toggle should default to on. Move the FAQ above the footer.' },
	{ ago: 9 * DAY, title: 'Sourdough, what actually worked', body: 'Feed the starter 1:5:5 the night before. 78% hydration, 2% salt. Bulk until it has grown by half, not doubled. Cold proof overnight, then the Dutch oven at 250°C.' },
	{ ago: 16 * DAY, title: 'Gift ideas for Dad', body: 'A leather strap for the old Pentax. The book about lighthouses. Not another mug.' },
	{ ago: 24 * DAY, title: 'Standing desk height', body: '73 cm sitting, 108 cm standing. Top of the monitor at eye level.' },
	{ ago: 31 * DAY, title: 'Compost notes', body: 'Turn the heap every two weeks. Worms love coffee grounds but not citrus peel.\n\n- browns: cardboard, dry leaves\n- greens: kitchen scraps, grass' },
	{ ago: 44 * DAY, title: 'Layers', body: 'Idea: a tiny app where everything I pour into it settles into layers I can dig back through. Call it Strata.' }
];

const LINKS = [
	{ ago: 1 * DAY + 3 * HOUR, url: 'https://en.wikipedia.org/wiki/Isle_of_Skye' },
	{ ago: 3 * DAY, url: 'https://en.wikipedia.org/wiki/Cuillin' },
	{ ago: 7 * DAY, url: 'https://en.wikipedia.org/wiki/Zettelkasten' },
	{ ago: 12 * DAY, url: 'https://en.wikipedia.org/wiki/Sourdough' },
	{ ago: 20 * DAY, url: 'https://en.wikipedia.org/wiki/Memex' },
	{ ago: 27 * DAY, url: 'https://en.wikipedia.org/wiki/Mycorrhizal_network' },
	{ ago: 38 * DAY, url: 'https://en.wikipedia.org/wiki/Stratum' }
];

// Photos from the local picsum corpus (Unsplash licence), titled the way a camera names them.
const IMAGES = [
	{ ago: 1 * DAY, photo: 200, name: 'IMG_4721.jpg' },
	{ ago: 4 * DAY, photo: 183, name: 'IMG_3980.jpg' },
	{ ago: 6 * DAY, photo: 231, name: 'DSC_0412.jpg' },
	{ ago: 11 * DAY, photo: 250, name: 'IMG_3612.jpg' },
	{ ago: 14 * DAY, photo: 244, name: 'IMG_3480.jpg' },
	{ ago: 19 * DAY, photo: 292, name: 'IMG_3307.jpg' },
	{ ago: 29 * DAY, photo: 237, name: 'IMG_2966.jpg' },
	{ ago: 36 * DAY, photo: 211, name: 'IMG_2751.jpg' }
];

const MEMOS = [
	{ ago: 5 * HOUR, title: 'New Recording 47', text: 'A note for the Scotland trip. The ferry fills up fast in the summer, so book a space at least three weeks ahead.' },
	{ ago: 8 * DAY, title: 'New Recording 46', text: 'An idea for the team retreat. Everyone brings one thing they stopped doing this year, and what it freed up.' },
	{ ago: 22 * DAY, title: 'New Recording 44', text: 'A book recommendation from Priya. She said the first hundred pages of The Overstory are the best short stories she has read in years.' }
];

const app = await create_app({ data_dir: dir, local: new ScriptedLlm(), seed: false });

const dates = new Map<number, number>();
const saved = (id: number, ago: number) => dates.set(id, Date.now() - ago);

for (const note of NOTES) saved(app.add_note({ title: note.title, body: note.body }).id, note.ago);

for (const image of IMAGES) {
	const bytes = new Uint8Array(await Bun.file(join(photos, `${image.photo}.jpg`)).arrayBuffer());
	const item = await app.add_image({ bytes, name: image.name, ext: 'jpg' });
	saved(item.id, image.ago);
}

for (const memo of MEMOS) {
	const wav = join(tmp, `${memo.title}.wav`);
	const say = Bun.spawn(['say', '-v', 'Samantha', '-o', wav, '--data-format=LEI16@16000', memo.text]);
	if ((await say.exited) !== 0) throw new Error(`say failed for ${memo.title}`);
	const item = await app.add_audio(wav, { title: memo.title });
	saved(item.id, memo.ago);
}

for (const link of LINKS) {
	const { item } = await app.add_link(link.url);
	saved(item.id, link.ago);
}

console.log('[seed] waiting for the pipeline…');
await app.ingest.idle();

// A public-domain feed, so the Feeds page and the sidebar have something real in them.
try {
	const { result } = await app.feeds.add('https://www.nasa.gov/feeds/iotd-feed/', { full_text: false, retention_max: 8 });
	console.log('[seed] feed:', JSON.stringify(result));
	await app.ingest.idle();
} catch (err) {
	console.warn('[seed] feed skipped:', (err as Error).message);
}

// Feed entries keep their published dates, which sort beneath what was saved by hand.
const set_date = app.db.prepare('UPDATE items SET created_at = ?, updated_at = ? WHERE id = ?');
for (const [id, at] of dates) set_date.run(at, at, id);
const oldest = Math.min(...dates.values());
const entries = app.db.query<{ id: number }, []>('SELECT id FROM items WHERE feed_id IS NOT NULL ORDER BY created_at DESC').all();
entries.forEach(({ id }, i) => set_date.run(oldest - (i + 1) * 2 * DAY, oldest - (i + 1) * 2 * DAY, id));

const rows = app.db
	.query<{ kind: string; title: string; status: string; body: string; error: string | null }, []>('SELECT kind, title, status, substr(body, 1, 170) AS body, error FROM items ORDER BY created_at DESC')
	.all();
for (const r of rows) console.log(`${r.status.padEnd(7)} ${r.kind.padEnd(6)} ${r.title.slice(0, 50).padEnd(50)} | ${r.error ?? r.body.replace(/\n/g, ' ')}`);
console.log('[seed] vectors', app.vectors.size, 'images', app.images.size);
console.log('[seed] worker status', JSON.stringify(app.ml.status));

app.close();
if (!existsSync(join(dir, 'strata.sqlite'))) throw new Error('no database written');
process.exit(0);
