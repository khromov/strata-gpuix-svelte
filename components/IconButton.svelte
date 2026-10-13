<script lang="ts">
	import Tooltip from 'gpuix-svelte/components/Tooltip.svelte';
	import type { IconName } from '../lib/icons.ts';
	import Icon from './Icon.svelte';

	let {
		icon,
		tip = null,
		onclick = null,
		active = false,
		danger = false,
		disabled = false,
		size = 28,
		testid = null
	}: {
		icon: IconName;
		/** What the icon does, shown on hover; it has no label of its own. */
		tip?: string | null;
		onclick?: (() => void) | null;
		active?: boolean;
		danger?: boolean;
		disabled?: boolean;
		size?: number;
		testid?: string | null;
	} = $props();

	type Hover = { onmouseenter: () => void; onmouseleave: () => void };
</script>

<!-- A trigger with a click listener of its own takes Tooltip's hover handlers, as Tooltip asks of one. -->
{#snippet button(hover?: Hover)}
	<div
		class="ib"
		class:active
		class:danger
		class:disabled
		style="width: {size}px; height: {size}px"
		hitbox="self"
		onclick={() => {
			if (!disabled) onclick?.();
		}}
		{...hover}
		testId={testid}
	>
		<Icon name={icon} size={Math.round(size * 0.57)} tone={danger ? 'danger' : active ? 'accent' : 'muted'} />
	</div>
{/snippet}

{#if tip}
	<!-- Below, since every icon button sits in the top bar. -->
	<Tooltip content={tip} side="bottom" children={button} />
{:else}
	{@render button()}
{/if}

<style>
	.ib { display: flex; align-items: center; justify-content: center; border-radius: 6px; cursor: pointer; user-select: none; color: var(--inkMuted); }
	.ib.disabled { opacity: 0.4; cursor: default; }
	.ib:hover { background-color: var(--hoverStrong); color: var(--ink); }
	.ib.active { background-color: var(--accentSoft); color: var(--accent); }
	.ib.danger:hover { background-color: var(--dangerSoft); color: var(--danger); }
</style>
