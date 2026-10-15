<script lang="ts">
	import Scroller from 'gpuix-svelte/components/Scroller.svelte';
	import Button from '../components/Button.svelte';
	import EmptyState from '../components/EmptyState.svelte';
	import Field from '../components/Field.svelte';
	import Icon from '../components/Icon.svelte';
	import Modal from '../components/Modal.svelte';
	import Spinner from '../components/Spinner.svelte';
	import Segmented from '../components/Segmented.svelte';
	import Toggle from '../components/Toggle.svelte';
	import type { GpuixEvent } from 'gpuix-svelte';
	import { SCHEDULES } from '../lib/feeds/schedules.ts';
	import { ago, data, get_app } from '../lib/data.svelte.ts';
	import { feed_actions } from '../lib/menus.ts';
	import { push } from '../lib/router.svelte.ts';
	import type { Feed } from '../lib/store.ts';
	import { open_menu, toast } from '../lib/ui.svelte.ts';

	const app = get_app();

	let url = $state('');
	let adding = $state(false);
	let busy = $state<number | null>(null);
	let removing = $state<Feed | null>(null);
	let expanded = $state<number | null>(null);

	async function add() {
		const value = url.trim();
		if (!value || adding) return;
		adding = true;
		try {
			const { feed, result } = await app.feeds.add(value);
			url = '';
			toast(`Subscribed to ${feed.title || feed.url} — ${result.added} item${result.added === 1 ? '' : 's'}`, 'success');
		} catch (err) {
			toast((err as Error).message, 'error');
		} finally {
			adding = false;
		}
	}

	async function refresh(feed: Feed) {
		busy = feed.id;
		try {
			const result = await app.feeds.refresh(feed.id);
			toast(result.added ? `${result.added} new from ${feed.title || feed.url}` : 'Nothing new', result.added ? 'success' : 'info');
		} catch (err) {
			toast((err as Error).message, 'error');
		} finally {
			busy = null;
		}
	}

	function remove(ok: boolean) {
		const feed = removing;
		removing = null;
		if (!ok || !feed) return;
		app.feeds.remove(feed.id, { keep_items: true });
		toast(`Unsubscribed from ${feed.title || feed.url} — its items stay in the library`);
	}

	const set = (feed: Feed, patch: Partial<Feed>) => app.feeds.update(feed.id, patch);

	function set_number(feed: Feed, key: 'retention_days' | 'retention_max', value: string) {
		const n = Number(value.trim());
		set(feed, { [key]: value.trim() && Number.isFinite(n) && n > 0 ? Math.round(n) : null });
	}

	const host = (feed: Feed) => {
		try {
			return new URL(feed.url).host;
		} catch {
			return feed.url;
		}
	};

	const when = (ts: number | null) => (ts ? ago(ts) : 'never');

	function when_next(schedule: string): string {
		const at = app.feeds.next_run(schedule);
		return at ? new Date(at).toLocaleString(undefined, { weekday: 'short', hour: '2-digit', minute: '2-digit' }) : 'never — check the expression';
	}
</script>

<div class="route">
	<div class="head">
		<div class="url">
			<Field label="Add a feed" value={url} placeholder="https://example.com/feed.xml" mono onchange={(v) => (url = v)} onsubmit={add} />
		</div>
		<Button label={adding ? 'Subscribing…' : 'Subscribe'} icon="rss" variant="primary" disabled={adding || !url.trim()} onclick={add} testid="feed-add" />
		{#if adding}<Spinner size={14} />{/if}
	</div>

	<Scroller pad="0 24px 24px 24px" gap={14} testid="feeds">
		{#if data.feeds.length === 0}
			<EmptyState icon="rss" title="No feeds yet" />
		{:else}
			{#each data.feeds as feed (feed.id)}
				<div
					class="card"
					onauxclick={(e: GpuixEvent) => open_menu(e, feed_actions(feed, { on_options: () => (expanded = feed.id) }), feed.title || host(feed))}
					testId="feed-{feed.id}"
				>
					<div class="row">
						<Icon name="rss" size={18} tone={feed.enabled ? 'accent' : 'faint'} />
						<div class="titles">
							<div class="name">{feed.title || host(feed)}</div>
							<div class="sub">{host(feed)} · {data.feed_counts[feed.id] ?? 0} items · polled {when(feed.last_polled_at)}</div>
						</div>
						{#if busy === feed.id}<Spinner size={14} />{/if}
						<Button label="Refresh" icon="refresh" small disabled={busy === feed.id} onclick={() => refresh(feed)} />
						<Button label={expanded === feed.id ? 'Done' : 'Options'} small onclick={() => (expanded = expanded === feed.id ? null : feed.id)} />
					</div>

					{#if feed.last_error}
						<div class="problem">{feed.last_error}</div>
					{/if}

					{#if expanded === feed.id}
						<div class="options">
							<Toggle label="Enabled" checked={feed.enabled} onchange={(v) => set(feed, { enabled: v })} />
							<Toggle label="Fetch the full article" checked={feed.full_text} onchange={(v) => set(feed, { full_text: v })} />
							<div class="setting">
								<div class="label">Check for new entries</div>
								<Segmented options={SCHEDULES} value={feed.schedule} onchange={(v) => set(feed, { schedule: v })} />
								<div class="hint">Next check {when_next(feed.schedule)}</div>
							</div>
							<div class="row">
								<div class="cell">
									<Field label="Keep newest" value={feed.retention_max == null ? '' : String(feed.retention_max)} placeholder="all" onchange={(v) => set_number(feed, 'retention_max', v)} />
								</div>
								<div class="cell">
									<Field label="Keep for (days)" value={feed.retention_days == null ? '' : String(feed.retention_days)} placeholder="forever" onchange={(v) => set_number(feed, 'retention_days', v)} />
								</div>
							</div>
							<div class="row">
								<Button label="Search this feed" icon="inbox" small onclick={() => push(`/search?q=${encodeURIComponent(`feeds:on ${feed.title}`)}`)} />
								<div class="grow"></div>
								<Button label="Unsubscribe" icon="trash" variant="danger" small onclick={() => (removing = feed)} />
							</div>
						</div>
					{/if}
				</div>
			{/each}
		{/if}
	</Scroller>

	{#if removing}
		<Modal
			title="Unsubscribe from {removing.title || host(removing)}?"
			body="Polling stops. The {data.feed_counts[removing.id] ?? 0} items it already brought in stay in your library."
			confirmLabel="Unsubscribe"
			danger
			onclose={remove}
		/>
	{/if}
</div>

<style>
	.route { display: flex; flex-direction: column; flex-grow: 1; min-height: 0; }
	.head { display: flex; flex-direction: row; align-items: end; gap: 12px; padding: 20px 24px; }
	.url { display: flex; flex-direction: column; flex-grow: 1; max-width: 560px; min-width: 0; }
	.card { display: flex; flex-direction: column; gap: 12px; width: 100%; padding: 16px 18px; border-radius: 14px; border-width: 1px; background-color: var(--surface); border-color: var(--border); }
	.row { display: flex; flex-direction: row; align-items: center; gap: 12px; }
	.cell { display: flex; flex-direction: column; flex-grow: 1; flex-basis: 0; min-width: 0; }
	.titles { display: flex; flex-direction: column; gap: 3px; flex-grow: 1; min-width: 0; }
	.name { font-size: 15px; line-height: 22px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.sub { font-size: 12px; line-height: 16px; color: var(--inkFaint); }
	.setting { display: flex; flex-direction: column; align-items: start; gap: 8px; }
	.label { font-size: 13px; line-height: 18px; font-weight: 600; color: var(--inkMuted); }
	.hint { font-size: 12px; line-height: 16px; color: var(--inkFaint); }
	.options { display: flex; flex-direction: column; gap: 14px; padding-top: 12px; border-top-width: 1px; border-color: var(--divider); }
	.problem { padding: 10px 12px; border-radius: 8px; font-size: 13px; line-height: 18px; background-color: var(--dangerSoft); color: var(--danger); }
	.grow { flex-grow: 1; }
</style>
