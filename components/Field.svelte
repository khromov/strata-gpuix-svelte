<script lang="ts">
	import Button from './Button.svelte';

	let {
		label = '',
		value = '',
		placeholder = '',
		hint = '',
		secret = false,
		readOnly = false,
		mono = false,
		onchange = null,
		onsubmit = null
	}: {
		label?: string;
		value?: string;
		placeholder?: string;
		hint?: string;
		secret?: boolean;
		readOnly?: boolean;
		mono?: boolean;
		onchange?: ((value: string) => void) | null;
		onsubmit?: ((value: string) => void) | null;
	} = $props();

	let reveal = $state(false);
	let focused = $state(false);
	const masked = $derived(value ? '•'.repeat(Math.min(24, value.length)) : '');
</script>

<div class="field">
	{#if label}<div class="label">{label}</div>{/if}
	<div class="row">
		{#if secret && !reveal}
			<div class="masked">{masked || placeholder}</div>
			<Button label="Reveal" small onclick={() => (reveal = true)} />
		{:else}
			<input
				{value}
				{placeholder}
				{readOnly}
				class="input"
				class:focused
				class:mono
				onchange={(e) => onchange?.(e.value)}
				onsubmit={(e) => onsubmit?.(e.value)}
				onfocus={() => (focused = true)}
				onblur={() => (focused = false)}
			/>
		{/if}
	</div>
	{#if hint}<div class="hint">{hint}</div>{/if}
</div>

<style>
	.field { display: flex; flex-direction: column; gap: 7px; min-width: 0; }
	.label { font-size: 13px; line-height: 18px; font-weight: 600; user-select: none; color: var(--inkMuted); }
	.row { display: flex; flex-direction: row; align-items: center; gap: 8px; }
	.input { flex-grow: 1; min-width: 0; padding: 10px 12px; border-radius: 8px; border-width: 1px; font-size: 14px; line-height: 20px; background-color: var(--field); border-color: var(--borderStrong); color: var(--ink); }
	.input.mono { font-family: Lilex; font-size: 13px; }
	.input.focused { border-color: var(--accent); }
	.masked { flex-grow: 1; min-width: 0; padding: 10px 12px; border-radius: 8px; border-width: 1px; font-size: 14px; line-height: 20px; background-color: var(--sunken); border-color: var(--border); color: var(--inkMuted); }
	.hint { font-size: 12px; line-height: 16px; color: var(--inkFaint); }
</style>
