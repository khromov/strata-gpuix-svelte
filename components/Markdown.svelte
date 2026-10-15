<script lang="ts">
	import { open_url } from '../lib/shell.ts';
	import type { GpuixTheme } from 'gpuix-svelte';
	import { md_theme } from '../lib/theme.svelte.ts';

	let { source = '', theme = null }: { source?: string; theme?: GpuixTheme | null } = $props();
</script>

<markdown {source} theme={theme ?? md_theme()} onlinkclick={(e) => open_url(e.value)}></markdown>
