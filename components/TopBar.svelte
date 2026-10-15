<script lang="ts">
	import { back, can_back } from '../lib/router.svelte.ts';
	import { blur } from 'gpuix-svelte';
	import { ui } from '../lib/ui.svelte.ts';
	import IconButton from './IconButton.svelte';
	import SearchBar from './SearchBar.svelte';

</script>

<div class="bar">
	{#if can_back()}
		<IconButton
			icon="back"
			tip="Back (Esc)"
			size={34}
			onclick={() => {
				back();
				blur();
			}}
			testid="back"
		/>
	{/if}
	<div class="title">{ui.title}</div>
	<SearchBar />
</div>

<style>
	.bar { display: flex; flex-direction: row; align-items: center; gap: 14px; height: 64px; min-height: 64px; padding: 0 24px; border-bottom-width: 1px; user-select: none; border-color: var(--divider); }
	.title { width: 160px; min-width: 120px; font-size: 17px; line-height: 24px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: var(--ink); }
</style>
