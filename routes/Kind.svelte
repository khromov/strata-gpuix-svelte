<script lang="ts">
	import EmptyState from '../components/EmptyState.svelte';
	import ItemCard from '../components/ItemCard.svelte';
	import KindBadge from '../components/KindBadge.svelte';
	import Scroller from 'gpuix-svelte/components/Scroller.svelte';
	import type { GpuixEvent } from 'gpuix-svelte';
	import { blob_src, data, display_title, status_text } from '../lib/data.svelte.ts';
	import { capture_actions, item_actions } from '../lib/menus.ts';
	import { push } from '../lib/router.svelte.ts';
	import type { Item, Kind } from '../lib/store.ts';
	import { is_secondary, open_menu } from '../lib/ui.svelte.ts';

	let { kind }: { kind: Kind } = $props();

	const show = (e: GpuixEvent, item: Item) => open_menu(e, item_actions(item), display_title(item));

	const EMPTY: Record<Kind, string> = { text: 'No notes yet', link: 'No links yet', image: 'No images yet', audio: 'No recordings yet' };
	const items = $derived(data.items.filter((i) => i.kind === kind));
</script>

<div class="route" onauxclick={(e: GpuixEvent) => open_menu(e, capture_actions())}>
	<div class="head">
		<KindBadge {kind} />
		<div class="count">{items.length} item{items.length === 1 ? '' : 's'}</div>
	</div>
	<Scroller virtual={kind !== 'image'} estimate={110} pad="0 24px 24px 24px" gap={14}>
		{#if items.length === 0}
			<EmptyState title={EMPTY[kind]} />
		{:else if kind === 'image'}
			<div class="grid">
				{#each items as item (item.id)}
					<div
						class="tile"
						hitbox="self"
						onclick={(e: GpuixEvent) => (is_secondary(e) ? show(e, item) : push(`/item/${item.id}`))}
						onauxclick={(e: GpuixEvent) => show(e, item)}
					>
						{#if blob_src(item.thumb_blob)}
							<img src={blob_src(item.thumb_blob)} objectFit="cover" class="pic" />
						{:else}
							<div class="pic missing"></div>
						{/if}
						<div class="caption">{item.title || 'Untitled'}</div>
						{#if item.status !== 'ready'}<div class="state">{status_text(item)}</div>{/if}
					</div>
				{/each}
			</div>
		{:else}
			{#each items as item (item.id)}
				<div class="row"><ItemCard {item} onopen={() => push(`/item/${item.id}`)} /></div>
			{/each}
		{/if}
	</Scroller>
</div>

<style>
	.route { display: flex; flex-direction: column; flex-grow: 1; min-height: 0; }
	.head { display: flex; flex-direction: row; align-items: center; gap: 10px; padding: 20px 24px 14px 24px; font-size: 13px; line-height: 18px; user-select: none; color: var(--inkFaint); }
	.row { display: flex; flex-direction: column; width: 100%; padding-bottom: 10px; }
	.grid { display: flex; flex-direction: row; flex-wrap: wrap; gap: 14px; }
	.tile { display: flex; flex-direction: column; gap: 8px; width: 188px; padding: 10px; border-radius: 12px; border-width: 1px; cursor: pointer; user-select: none; background-color: var(--surface); border-color: var(--border); }
	.tile:hover { background-color: var(--raised); border-color: var(--borderStrong); }
	.pic { width: 166px; height: 128px; border-radius: 8px; }
	.pic.missing { background-color: var(--plumSoft); }
	.caption { font-size: 13px; line-height: 18px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.state { font-size: 12px; line-height: 16px; color: var(--inkFaint); }
</style>
