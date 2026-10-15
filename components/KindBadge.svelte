<script lang="ts">
	import type { Kind } from '../lib/store.ts';

	let { kind }: { kind: Kind } = $props();

	const LABEL: Record<Kind, string> = { text: 'note', link: 'link', image: 'image', audio: 'audio' };
</script>

<div class="badge {kind}">{LABEL[kind] ?? kind}</div>

<style>
	.badge { padding: 1px 8px; border-radius: 999px; font-size: 12px; line-height: 17px; font-weight: 600; user-select: none; }
	.badge.text { background-color: var(--ochreSoft); color: var(--ochreInk); }
	.badge.link { background-color: var(--infoSoft); color: var(--info); }
	.badge.image { background-color: var(--plumSoft); color: var(--plum); }
	.badge.audio { background-color: var(--tealSoft); color: var(--teal); }
</style>
