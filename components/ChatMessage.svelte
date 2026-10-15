<script lang="ts">
	import type { GpuixEvent } from 'gpuix-svelte';
	import type { ChatMessage } from '../lib/chat.svelte.ts';
	import { data } from '../lib/data.svelte.ts';
	import { GEMMA_NAME } from '../lib/llm-local.ts';
	import { message_actions } from '../lib/menus.ts';
	import { open_menu } from '../lib/ui.svelte.ts';
	import Markdown from './Markdown.svelte';
	import ProgressBar from './ProgressBar.svelte';
	import SourceChip from './SourceChip.svelte';
	import Spinner from './Spinner.svelte';

	let { message }: { message: ChatMessage } = $props();

	const user = $derived(message.role === 'user');
	// The first question on this computer waits for the model to download, then to load.
	const gemma = $derived(data.provider === 'local' ? data.llm : null);
	const waiting = $derived.by(() => {
		if (gemma?.state === 'downloading') return `Downloading ${GEMMA_NAME}${gemma.progress != null ? ` · ${Math.round(gemma.progress)}%` : '…'}`;
		if (gemma?.state === 'loading') return `Loading ${GEMMA_NAME}…`;
		return 'Thinking…';
	});
	const show = (e: GpuixEvent) => open_menu(e, message_actions(message), user ? 'Your question' : 'Answer');
</script>

{#if user}
	<div class="row user">
		<div class="bubble user" onauxclick={show}>{message.content}</div>
	</div>
{:else}
	<div class="row">
		<div class="answer" onauxclick={show}>
			{#if message.content}
				<Markdown source={message.content} />
			{:else if message.streaming}
				<div class="thinking"><Spinner size={14} /><div>{waiting}</div></div>
				{#if gemma?.state === 'downloading'}<ProgressBar value={gemma.progress} />{/if}
			{/if}
			{#if message.error}
				<div class="error">{message.error}</div>
			{/if}
			{#if message.sources?.length}
				<div class="sources">
					{#each message.sources as source (source.n)}
						<SourceChip {source} cited={message.cited?.includes(source.n)} />
					{/each}
				</div>
			{/if}
		</div>
	</div>
{/if}

<style>
	.row { display: flex; flex-direction: row; }
	.row.user { justify-content: end; }
	.bubble { max-width: 70%; padding: 12px 16px; border-radius: 16px; font-size: 15px; line-height: 23px; }
	.bubble.user { background-color: var(--accentSoft); color: var(--ink); }
	.answer { display: flex; flex-direction: column; gap: 12px; max-width: 86%; padding: 14px 18px; border-radius: 16px; border-width: 1px; background-color: var(--surface); border-color: var(--border); }
	.thinking { display: flex; flex-direction: row; align-items: center; gap: 8px; font-size: 14px; line-height: 20px; color: var(--inkMuted); }
	.error { font-size: 13px; line-height: 18px; color: var(--danger); }
	.sources { display: flex; flex-direction: row; flex-wrap: wrap; gap: 8px; }
</style>
