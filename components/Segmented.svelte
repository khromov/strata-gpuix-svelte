<script lang="ts" generics="V extends string">
	import type { IconName } from '../lib/icons.ts';
	import Icon from './Icon.svelte';

	let {
		options = [],
		value,
		onchange,
		small = false
	}: { options?: Array<{ value: V; label?: string; icon?: IconName }>; value: V; onchange: (value: V) => void; small?: boolean } = $props();

</script>

<div class="seg" class:small>
	{#each options as option (option.value)}
		<div class="item" class:on={option.value === value} class:small hitbox="self" onclick={() => onchange?.(option.value)}>
			{#if option.icon}<Icon name={option.icon} size={small ? 15 : 16} tone={option.value === value ? 'ink' : 'muted'} />{/if}
			{#if option.label}<div class="text">{option.label}</div>{/if}
		</div>
	{/each}
</div>

<style>
	.seg { display: flex; flex-direction: row; gap: 2px; padding: 3px; border-radius: 10px; user-select: none; background-color: var(--sunken); }
	.item { display: flex; flex-direction: row; align-items: center; gap: 7px; padding: 7px 14px; border-radius: 7px; font-size: 13px; line-height: 18px; font-weight: 500; cursor: pointer; color: var(--inkMuted); }
	.item.small { padding: 5px 8px; }
	.item:hover { color: var(--ink); }
	.item.on { background-color: var(--control); color: var(--ink); }
</style>
