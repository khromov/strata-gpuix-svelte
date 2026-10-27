/**
 * The UI headlessly: mount Strata with a stubbed worker, capture a note through
 * GPUI's real hit testing, open it, go back with Escape, and delete it through
 * the confirm dialog.
 */

if (!process.versions.bun) {
	console.error('[smoke] needs Bun — `bun run test`');
	process.exit(1);
}

// The Linux prebuild of @gpuix/native ships without the headless renderer, so there is nothing to mount.
const { hasTestGpuixRenderer } = await import('@gpuix/native');
if (typeof hasTestGpuixRenderer === 'function' && !hasTestGpuixRenderer()) {
	console.log('[smoke] skipped: this @gpuix/native build has no headless renderer (Linux prebuild)');
	process.exit(0);
}

process.env.GPUIX_BRAIN_THEME = 'dark';

import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { dispatch, focused_element, window_size } from 'gpuix-svelte';
import {
	mount_headless,
	click_at,
	wait,
	wait_for,
	focus,
	unfocus,
	find,
	find_all,
	find_test_id,
	click_text,
	click_test_id,
	hover,
	press,
	painted,
	painted_highlights,
	all_text,
	screenshot,
	check,
	finish
} from 'gpuix-svelte/test';
import type { ClickOptions } from 'gpuix-svelte/test';
import { create_app } from '../lib/app.ts';
import { MlStub } from '../lib/ml-stub.ts';
import { push, route } from '../lib/router.svelte.ts';
import { DARK, LIGHT } from '../lib/theme.ts';
import { set_mode } from '../lib/theme.svelte.ts';
import { ui } from '../lib/ui.svelte.ts';

const RSS = `<rss version="2.0"><channel><title>Newsonaut</title><link>https://feed.test/</link>
<item><title>Mycelium and the wood wide web</title><link>https://feed.test/post-1</link><guid>post-1</guid>
<description>Fungal networks trade sugar for phosphorus.</description></item></channel></rss>`;

const app = await create_app({
	data_dir: mkdtempSync(join(tmpdir(), 'strata-smoke-')),
	ml: new MlStub(),
	seed: true,
	fetch: async (url) =>
		String(url).includes('rss.xml')
			? new Response(RSS, { headers: { 'content-type': 'application/rss+xml' } })
			: new Response('<html><body><article><p>The full post about mycelium.</p></article></body></html>', { headers: { 'content-type': 'text/html' } })
});
await app.feeds.add('https://feed.test/rss.xml');
await app.ingest.idle();

const App = (await import('../App.svelte')).default;
// 538 is the headless height cap; anything laid out below it cannot be hit.
const { native } = mount_headless(App, { props: { app }, width: 1100, height: 538 });

/** A click, then the timers and dynamic imports a route change runs through. */
async function tap(text: string, opts?: ClickOptions) {
	click_text(text, opts);
	await wait();
}

/** `wait_for` as a check: false once its timeout passes, rather than a throw. */
const eventually = (pred: () => unknown) => wait_for(pred).then(
	() => true,
	() => false
);

await wait();
await wait();
check('brand painted', painted().includes('Strata'));
// Off-screen rows of the virtual timeline are retained but not painted.
check('seeded note in the timeline', all_text().some((t) => t.includes('Compost notes')));
check('sidebar counts painted', painted().includes('Everything'));

// The palette reaches every <style> through set_css_vars, so a mode switch is one restyle.
const root_bg = () => find_test_id('root')!.style!.backgroundColor;
check('dark palette applied through css vars', root_bg(), DARK.bg);
set_mode('light');
await wait();
check('switching the mode restyles', root_bg(), LIGHT.bg);
set_mode('dark');
await wait();

const textarea = find((n) => n.type === 'textarea');
check('capture textarea exists', textarea != null);
dispatch({ elementId: textarea!.id, eventType: 'change', value: 'Buy compost for the raised beds' });
await wait();
await tap('Save');
await app.ingest.idle();
await wait();
check('new note appears in the timeline', painted().includes('Buy compost for the raised beds'));
const note = app.store.list_items({ limit: 1 })[0];
check('new note is in the store', note.body, 'Buy compost for the raised beds');

await tap('Buy compost for the raised beds');
await wait();
check('card click opens the item route', route.path, `/item/${note.id}`);
check('item page paints the body', painted().includes('Buy compost for the raised beds'));
check('window title follows the route', ui.title, 'Item');

// The back button is an icon alone, so what it does is a Tooltip away.
hover(find_test_id('back')!);
check('hovering the back button shows its tip', await eventually(() => painted().includes('Back (Esc)')));
hover({ x: 600, y: 300 });
check('and leaving it hides the tip', await eventually(() => !painted().includes('Back (Esc)')));

press('escape');
await wait();
check('escape goes back', route.path, '/');

// GPUI sends a right click to auxClick, so the card's own onclick must not fire.
const card = native.getElementBounds(find_test_id(`item-${note.id}`)!.id)!;
const [cx, cy] = [card.x + 40, card.y + 20];
click_at(cx, cy, { button: 2 });
await wait();
// The event's window coordinates and the <Portal>'s are the same space, or the menu misses the cursor.
// getElementBounds reports the border box (since @gpuix/native 0.11.0; before, it sat 7 px inside
// it), so the panel's top-left corner is the cursor.
const box = native.getElementBounds(find_test_id('menu')!.id)!;
check('the menu opens at the cursor', box.x === cx && box.y === cy, true);
check('right-clicking a card opens its menu', painted().includes('Copy text'));
check('with the destructive action in it', painted().includes('Delete'));
check('and it does not open the item', route.path, '/');
press('escape');
await wait();

// auxClick is every non-primary button, so the middle one has to be turned away.
click_at(cx, cy, { button: 1 });
await wait();
check('a middle click opens nothing', find_test_id('menu'), null);
check('escape closes the menu', find_test_id('menu'), null);
check('without navigating away', route.path, '/');

const { width } = window_size;
click_at(width - 20, 200, { button: 2 });
await wait();
check('empty space offers the capture actions', painted().includes('Paste from clipboard'));
const edge = native.getElementBounds(find_test_id('menu')!.id)!;
check('and a menu at the right edge flips inward', edge.x + edge.width < width);
press('escape');
await wait();

const scratch = app.add_note({ body: 'Scratch note for the menu' });
await app.ingest.idle();
await wait();
await tap('Scratch note for the menu', { button: 2 });
click_test_id('menu-Delete');
await wait();
check('a destructive menu action asks first', ui.modals, 1);
click_test_id('modal-confirm');
await wait();
check('and then deletes', app.get_item(scratch.id), null);

await tap('Buy compost for the raised beds');
await wait();
await tap('Strata');
check('brand click goes home', route.path, '/');

await tap('Strata', { button: 2 });
check('the brand menu marks the theme in force', painted().includes('✓'));
press('escape');
await wait();

await tap('Notes', { button: 2 });
check('right-clicking a nav item offers a scoped search', painted().includes('Search only notes'));
check('and it did not navigate', route.path, '/');
press('down');
press('enter');
await wait();
check('the arrows and Enter work the menu', route.path, '/notes');
check('and running an action closes it', find_test_id('menu'), null);

// A long body is one <markdown> row per block under a virtual Scroller: every block stays in
// the tree, but only those near the viewport are built and painted.
const paragraphs = Array.from({ length: 150 }, (_, i) => `Paragraph ${i} of the long page.`);
const long_note = app.add_note({ title: 'Long page', body: paragraphs.join('\n\n') });
await app.ingest.idle();
push(`/item/${long_note.id}`);
await wait();
await wait();
check('long page keeps a markdown row per block', find_all((n) => n.type === 'markdown').length, 150);
check('and paints the first block', painted().includes('Paragraph 0 of the long page.'));
check('but not the last', painted().includes('Paragraph 149 of the long page.'), false);
// A+ and A− step the entry's text size, and the choice is a setting, so it outlives a restart.
const first_block = () => native.getElementBounds(find((n) => n.type === 'markdown')!.id)!.height;
const before = { size: app.settings.get('reader.textSize'), height: first_block() };
click_test_id('text-larger');
await wait();
check('A+ stores a larger text size', app.settings.get('reader.textSize') > before.size);
check('and the entry text grows', first_block() > before.height);
click_test_id('text-smaller');
await wait();
check('A− steps it back', app.settings.get('reader.textSize'), before.size);
const body_list = find_test_id('item-body')!;
let last_block = -1;
body_list.children!.forEach((row, i) => {
	if (row.children?.some((c) => c.type === 'markdown')) last_block = i;
});
native.scrollToItem(body_list.id, last_block);
await wait();
check('scrolling to the end paints the last block', painted().includes('Paragraph 149 of the long page.'));
await tap('Strata');

// Tab moves focus between the window's fields natively.
const search_input = find((n) => n.type === 'input');
focus(search_input!);
press('tab');
check('tab moves from the search box to the capture box', focused_element()?.nativeId, find((n) => n.type === 'textarea')?.id);
unfocus();

// Typing `k` into the search box offers `kind:`; Tab takes it, and clicking a kind completes and searches.
focus(search_input!);
dispatch({ elementId: search_input!.id, eventType: 'change', value: 'k' });
await wait();
check('typing k suggests kind:', ui.suggest?.items.map((i) => i.label).join(','), 'kind:');
check('suggestion painted', painted().includes('filter by kind — note, link, image or audio'));
press('tab');
check('tab takes the completion, which suggests the kinds', ui.suggest?.items.map((i) => i.label).join(','), 'kind:note,kind:link,kind:image,kind:audio');
check('and leaves focus in the search box', focused_element()?.nativeId, search_input!.id);
await tap('kind:image');
await wait(250);
check('completion searches by kind', route.path === '/search' && route.query.q, 'kind:image');
check('kind listing paints the image', painted().includes('Strata icon'));
// The thumbnail is a row in the database until something asks for a path, so an <img>
// in the tree at all is the proof that the blob reached the cache.
check('the thumbnail blob materialised into an <img>', find_all((n) => n.type === 'img').length > 0);
check('and its cache file is on disk', existsSync(app.blobs.file(app.list({ kind: 'image' })[0].thumb_blob)!));
// Escape in the box clears it; the window handler sees `editing` and leaves the route
// alone. blur() is a no-op headlessly, so unfocus() stands in for the box letting go.
focus(search_input!);
press('escape');
await wait();
check('escape clears the search box', route.path, '/search');
unfocus();
press('escape');
await wait();
await wait();
check('escape from the window leaves search', route.path, '/');

await tap('Buy compost for the raised beds');
await wait();
await tap('Delete');
check('confirm dialog opens', ui.modals, 1);
check('dialog painted on top', painted().includes('Delete this item?'));
click_test_id('modal-confirm');
await wait();
check('confirm deletes the item', app.get_item(note.id), null);
check('delete navigates back', route.path, '/');
await wait();
check('deleted note gone from the timeline', all_text().some((t) => t.includes('Buy compost for the raised beds')), false);

push('/feeds');
await wait();
await wait();
const feed = app.feeds.list()[0];
check('the feeds route lists the subscription', painted().includes('Newsonaut'));
check('and says how much it brought in', painted().includes('1 items'));
await tap('Options');
check('the options panel opens', painted().includes('Fetch the full article'));
await tap('Fetch the full article');
check('a toggle writes through to the feed', app.feeds.get(feed.id)!.full_text, false);

await tap('Newsonaut', { button: 2 });
check('right-clicking a feed offers its own actions', painted().includes('Refresh now'));
check('unsubscribing among them', painted().includes('Unsubscribe'));
click_test_id('menu-Pause polling');
await wait();
check('and a menu action writes through', app.feeds.get(feed.id)!.enabled, false);

push('/');
await wait();
await wait();
check('the timeline carries a feeds switch', painted().includes('Include feeds'));
check('and shows the feed entry', painted().includes('Mycelium and the wood wide web'));
await tap('Include feeds');
check('unticking it hides feed items', painted().includes('Mycelium and the wood wide web'), false);
check('and the choice is stored', app.settings.get('feeds.include'), false);

push('/search?q=mycelium');
await wait();
await wait(250);
await wait();
check('search filters carry the same switch', painted().includes('Include feeds'));
check('feed items are out of the results', painted().includes('No matches'));
await tap('Include feeds');
await wait(250);
await wait();
check('ticking it brings them back', painted().includes('Mycelium and the wood wide web'));
// Read back from what native painted, so the ranges are checked against the text they landed on.
const marked = painted_highlights().map((h) => h.text.slice(h.start, h.end).toLowerCase());
check('the query is highlighted in the hit', marked.length > 0 && marked.every((m) => m === 'mycelium'));
check('and persists as a setting', app.settings.get('feeds.include'), true);

push('/');
await wait();
await wait();
check('the timeline follows the same switch', painted().includes('Mycelium and the wood wide web'));

await tap('Mycelium and the wood wide web');
await wait();
check('the item view says when its page was fetched', painted().includes('Fetched'));
check('and which feed it came from', painted().includes('Newsonaut'));

// Ask goes to the on-device model by default; the stub streams an answer citing [1].
push('/ask');
await wait();
await wait();
dispatch({ elementId: find_test_id('ask-input')!.id, eventType: 'change', value: 'How often should I turn the compost heap?' });
await wait();
click_test_id('ask-send');
check('an answer streams in from the on-device model', await eventually(() => painted().includes('Your notes cover this')));
check('with the note it drew on beneath it', painted().includes('Compost notes'));

push('/settings');
await wait();
await wait();
check('settings shows the on-device model by default', find_test_id('settings-gemma') != null);
await tap('OpenAI-compatible endpoint');
check('choosing the endpoint shows its fields', painted().includes('Base URL'));
check('and is stored', app.settings.provider(), 'openai');
await tap('On this computer');
check('switching back hides them', painted().includes('Base URL'), false);
check('settings carries the same switch', find_test_id('settings-feeds') != null);
// The tick is a filled box, so the palette's accent is what says the switch is on.
check('and it carries what search just set', find_test_id('settings-feeds')?.children?.[0]?.style?.backgroundColor, DARK.accent);

console.log('screenshot:', screenshot(join(tmpdir(), 'strata-smoke.png')));

app.close();
finish('smoke', 81);
