<script lang="ts">
	import { data } from '../lib/data.svelte.ts';
	import { brand_actions } from '../lib/menus.ts';
	import { push, route } from '../lib/router.svelte.ts';
	import { is_secondary, open_menu } from '../lib/ui.svelte.ts';
	import { updates } from '../lib/updates.svelte.ts';
	import { blur, type GpuixEvent } from 'gpuix-svelte';
	import Button from './Button.svelte';
	import Icon from './Icon.svelte';
	import IconButton from './IconButton.svelte';
	import NavItem from './NavItem.svelte';
	import StatusPill from './StatusPill.svelte';


	function home() {
		if (route.path !== '/') push('/');
		blur();
	}

	function settings() {
		if (route.path !== '/settings') push('/settings');
		blur();
	}

	const show = (e: GpuixEvent) => open_menu(e, brand_actions(), 'Strata');
</script>

<div class="sidebar">
	<div class="brand" hitbox="self" onclick={(e: GpuixEvent) => (is_secondary(e) ? show(e) : home())} onauxclick={show} testId="brand">
		<div class="mark"><Icon name="leaf" size={19} tone="onAccent" /></div>
		<div class="word">Strata</div>
	</div>

	<div class="nav">
		<NavItem label="Everything" icon="inbox" path="/" count={data.counts.total} />
		<NavItem label="Notes" icon="note" path="/notes" kind="text" count={data.counts.by_kind.text} />
		<NavItem label="Links" icon="link" path="/links" kind="link" count={data.counts.by_kind.link} />
		<NavItem label="Images" icon="image" path="/images" kind="image" count={data.counts.by_kind.image} />
		<NavItem label="Audio" icon="audio" path="/audio" kind="audio" count={data.counts.by_kind.audio} />
	</div>

	<div class="section">Sources</div>
	<div class="nav">
		<NavItem label="Feeds" icon="rss" path="/feeds" count={data.counts.feeds} />
	</div>

	<div class="section">Think</div>
	<div class="nav">
		<NavItem label="Ask" icon="sparkles" path="/ask" />
	</div>

	<div class="spacer"></div>

	<div class="footer">
		{#if updates.update}
			<Button label="Update to {updates.update.version}" icon="download" small testid="sidebar-update" onclick={() => push('/settings')} />
		{/if}
		<div class="row">
			<div class="status"><StatusPill /></div>
			<IconButton icon="settings" tip="Settings" tip_side="top" size={34} active={route.path === '/settings'} testid="nav-settings" onclick={settings} />
		</div>
	</div>
</div>

<style>
	.sidebar { display: flex; flex-direction: column; gap: 6px; width: 244px; min-width: 244px; height: 100%; padding: 18px 14px 16px 14px; border-right-width: 1px; user-select: none; background-color: var(--sidebar); border-color: var(--divider); }
	.brand { display: flex; flex-direction: row; align-items: center; gap: 11px; margin-bottom: 8px; padding: 6px 8px; border-radius: 10px; cursor: pointer; }
	.brand:hover { background-color: var(--hover); }
	.mark { display: flex; align-items: center; justify-content: center; width: 32px; height: 32px; border-radius: 10px; background-color: var(--accent); color: var(--accentInk); }
	.word { font-size: 21px; line-height: 28px; font-weight: 700; }
	.nav { display: flex; flex-direction: column; gap: 3px; }
	.section { padding: 14px 12px 6px 12px; font-size: 12px; line-height: 16px; font-weight: 600; color: var(--inkFaint); }
	.spacer { flex-grow: 1; }
	.footer { display: flex; flex-direction: column; gap: 12px; }
	.row { display: flex; flex-direction: row; align-items: center; gap: 6px; }
	.status { display: flex; flex-direction: column; flex-grow: 1; flex-basis: 0; min-width: 0; }
</style>
