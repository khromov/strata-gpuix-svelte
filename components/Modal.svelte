<script lang="ts">
	import { on_window_key, type GpuixEvent } from 'gpuix-svelte';
	import Portal from 'gpuix-svelte/components/Portal.svelte';
	import { untrack } from 'svelte';
	import { ui } from '../lib/ui.svelte.ts';
	import Button from './Button.svelte';

	let {
		title,
		body = null,
		confirmLabel = 'OK',
		cancelLabel = 'Cancel',
		danger = false,
		onclose
	}: {
		title: string;
		body?: string | null;
		confirmLabel?: string;
		cancelLabel?: string;
		danger?: boolean;
		onclose: (ok: boolean) => void;
	} = $props();

	// Counted, so the app's own escape handler steps aside while a dialog is up.
	$effect(() => {
		untrack(() => ui.modals++);
		return () => untrack(() => ui.modals--);
	});
	$effect(() => on_window_key('keydown', (e: GpuixEvent) => e.key === 'escape' && onclose(false)));
</script>

<Portal>
	<div class="scrim" onclick={() => onclose(false)}>
		<div class="dialog" onclick={() => {}}>
			<div class="title">{title}</div>
			{#if body}<div class="body">{body}</div>{/if}
			<div class="actions">
				<Button label={cancelLabel} onclick={() => onclose(false)} />
				<Button label={confirmLabel} variant={danger ? 'danger' : 'primary'} onclick={() => onclose(true)} testid="modal-confirm" />
			</div>
		</div>
	</div>
</Portal>

<style>
	.scrim { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; user-select: none; background-color: var(--scrim); }
	.dialog { display: flex; flex-direction: column; gap: 14px; width: 440px; padding: 24px; border-radius: 14px; border-width: 1px; background-color: var(--control); border-color: var(--borderStrong); color: var(--ink); }
	.title { font-size: 18px; line-height: 24px; font-weight: 600; }
	.body { font-size: 14px; line-height: 21px; color: var(--inkMuted); }
	.actions { display: flex; flex-direction: row; justify-content: end; gap: 10px; padding-top: 6px; }
</style>
