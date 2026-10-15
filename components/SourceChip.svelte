<script lang="ts">
	import type { GpuixEvent } from 'gpuix-svelte';
	import type { Source } from '../lib/ask.ts';
	import { source_actions } from '../lib/menus.ts';
	import { push } from '../lib/router.svelte.ts';
	import { KIND_ICON } from '../lib/icons.ts';
	import { is_secondary, open_menu } from '../lib/ui.svelte.ts';
	import Icon from './Icon.svelte';

	let { source, cited = false }: { source: Source; cited?: boolean } = $props();

	const show = (e: GpuixEvent) => open_menu(e, source_actions(source), source.title);
</script>

<div
	class="chip"
	class:cited
	hitbox="self"
	onclick={(e: GpuixEvent) => (is_secondary(e) ? show(e) : push(`/item/${source.item_id}`))}
	onauxclick={show}
>
	<div class="n">{source.n}</div>
	<Icon name={KIND_ICON[source.kind] ?? 'note'} size={13} tone={source.kind} />
	<div class="title">{source.title}</div>
</div>

<style>
	.chip { display: flex; flex-direction: row; align-items: center; gap: 7px; max-width: 280px; padding: 4px 10px 4px 5px; border-radius: 999px; border-width: 1px; font-size: 13px; line-height: 18px; cursor: pointer; user-select: none; border-color: var(--border); color: var(--inkMuted); }
	.chip:hover { background-color: var(--raised); border-color: var(--borderStrong); color: var(--ink); }
	.chip.cited { border-color: var(--accent); color: var(--ink); }
	.n { display: flex; align-items: center; justify-content: center; width: 20px; height: 20px; border-radius: 10px; font-size: 11px; font-weight: 600; background-color: var(--accentSoft); color: var(--accentDeep); }
	.title { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
</style>
