<script lang="ts">
	import type { IconName } from '../lib/icons.ts';
	import Button from './Button.svelte';
	import Icon from './Icon.svelte';

	let {
		icon = 'leaf',
		title,
		body = '',
		action = null
	}: { icon?: IconName; title: string; body?: string; action?: { label: string; icon?: IconName; onclick: () => void } | null } = $props();
</script>

<div class="empty">
	<div class="glyph"><Icon name={icon} size={30} tone="accent" /></div>
	<div class="title">{title}</div>
	{#if body}<div class="body">{body}</div>{/if}
	{#if action}<Button label={action.label} icon={action.icon} variant="primary" onclick={action.onclick} />{/if}
</div>

<style>
	.empty { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 14px; width: 100%; padding: 56px 24px; text-align: center; user-select: none; }
	.glyph { display: flex; align-items: center; justify-content: center; width: 64px; height: 64px; border-radius: 32px; background-color: var(--accentSoft); color: var(--accent); }
	.title { font-size: 18px; line-height: 24px; font-weight: 600; }
	.body { max-width: 400px; font-size: 14px; line-height: 21px; color: var(--inkMuted); }
</style>
