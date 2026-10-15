<script lang="ts">
	import { add_link_from_text, capture, paste_image, pick_audio, pick_images, start_recording, stop_recording, submit } from '../lib/capture.svelte.ts';
	import { data, format_duration } from '../lib/data.svelte.ts';
	import type { GpuixEvent, ShadowNode } from 'gpuix-svelte';
	import { capture_actions } from '../lib/menus.ts';
	import { open_menu, register } from '../lib/ui.svelte.ts';
	import Button from './Button.svelte';
	import Icon from './Icon.svelte';

	const caps = $derived(data.capabilities);
	const recording = $derived(capture.recording);
	let focused = $state(false);

	const show = (e: GpuixEvent) => open_menu(e, capture_actions(), 'Capture');
</script>

<div class="box" class:focused onauxclick={show}>
	<textarea
		{@attach (node: ShadowNode) => register('capture', node)}
		value={capture.text}
		minRows={2}
		maxRows={8}
		placeholder="Pour something in — a thought, a link, anything"
		class="text"
		onchange={(e) => (capture.text = e.value)}
		onsubmit={() => submit()}
		onfocus={() => (focused = true)}
		onblur={() => (focused = false)}
		onauxclick={show}
		testId="capture-input"
	></textarea>

	{#if recording}
		<div class="rec">
			<div class="dot"></div>
			<div class="rec-label">Recording {format_duration(recording.elapsed)}</div>
			<div class="meter"><div class="level" style="width: {Math.round(recording.level * 100)}%"></div></div>
			<Button label="Stop" icon="stop" variant="danger" small onclick={stop_recording} testid="stop-recording" />
		</div>
	{/if}

	<div class="actions">
		<Button label="Save" icon="plus" variant="primary" small onclick={submit} disabled={!capture.text.trim()} testid="capture-save" />
		<Button label="Add link" icon="link" small onclick={add_link_from_text} disabled={!capture.text.trim()} />
		<div class="sep"></div>
		<Button label="Add image…" icon="image" small onclick={pick_images} disabled={caps ? !caps.filePicker.ok : false} />
		<Button label="Paste image" icon="paste" small onclick={paste_image} disabled={caps ? !caps.clipboardImage.ok : false} />
		<div class="sep"></div>
		{#if !recording}
			<Button label={capture.busy ? 'Asking for the mic…' : 'Record'} icon="mic" small onclick={start_recording} disabled={capture.busy || (caps ? !caps.recorder.ok : false)} testid="record" />
		{/if}
		<Button label="Import audio…" icon="audio" small onclick={pick_audio} disabled={caps ? !caps.filePicker.ok : false} />
		<div class="grow"></div>
		{#if caps && !caps.recorder.ok}
			<div class="note"><Icon name="alert" size={13} tone="faint" /><div class="note-text">{caps.recorder.reason}</div></div>
		{/if}
	</div>
</div>

<style>
	.box { display: flex; flex-direction: column; gap: 12px; padding: 14px; border-radius: 14px; border-width: 1px; background-color: var(--surface); border-color: var(--border); }
	.box.focused { border-color: var(--accent); background-color: var(--focusSurface); }
	.text { font-size: 15px; line-height: 23px; padding: 4px 4px; color: var(--ink); }
	.actions { display: flex; flex-direction: row; align-items: center; gap: 8px; flex-wrap: wrap; user-select: none; }
	.sep { width: 1px; height: 22px; margin: 0 4px; background-color: var(--border); }
	.grow { flex-grow: 1; }
	.note { display: flex; flex-direction: row; align-items: center; gap: 6px; font-size: 12px; line-height: 16px; color: var(--inkFaint); }
	.note-text { max-width: 320px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.rec { display: flex; flex-direction: row; align-items: center; gap: 12px; padding: 10px 12px; border-radius: 10px; user-select: none; background-color: var(--dangerSoft); color: var(--danger); }
	.dot { width: 10px; height: 10px; border-radius: 5px; background-color: var(--danger); }
	.rec-label { font-size: 13px; line-height: 18px; font-weight: 600; font-family: Lilex; }
	.meter { position: relative; flex-grow: 1; height: 8px; border-radius: 4px; overflow: hidden; background-color: var(--dangerWash); }
	.level { position: absolute; top: 0; left: 0; height: 8px; border-radius: 4px; background-color: var(--danger); }
</style>
