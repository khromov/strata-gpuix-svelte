<script lang="ts">
	import Button from '../components/Button.svelte';
	import Field from '../components/Field.svelte';
	import ProgressBar from '../components/ProgressBar.svelte';
	import Scroller from 'gpuix-svelte/components/Scroller.svelte';
	import Segmented from '../components/Segmented.svelte';
	import Spinner from '../components/Spinner.svelte';
	import { data, display_title, format_bytes, get_app, item_by_id, status_text } from '../lib/data.svelte.ts';
	import { include_feeds, set_include_feeds } from '../lib/feed-filter.svelte.ts';
	import { create_llm } from '../lib/llm.ts';
	import { MODEL_IDS, type ModelName } from '../lib/ml-client.ts';
	import type { SettingKey } from '../lib/settings.ts';
	import { reveal } from '../lib/shell.ts';
	import { set_mode, theme, type ThemeMode } from '../lib/theme.svelte.ts';
	import type { IconName } from '../lib/icons.ts';
	import { toast } from '../lib/ui.svelte.ts';
	import Modal from '../components/Modal.svelte';
	import Toggle from '../components/Toggle.svelte';
	import { push } from '../lib/router.svelte.ts';
	import { SCHEDULES } from '../lib/feeds/schedules.ts';

	const app = get_app();
	const settings = app.settings;

	let llm = $state({
		baseUrl: settings.get('llm.baseUrl') ?? '',
		apiKey: settings.get('llm.apiKey') ?? '',
		model: settings.get('llm.model') ?? '',
		visionModel: settings.get('llm.visionModel') ?? ''
	});
	let language = $state(settings.get('stt.language') ?? '');
	let schedule = $state(settings.get('feeds.schedule'));
	let testing = $state(false);

	const save = (key: SettingKey, prop: keyof typeof llm, value: string) => {
		llm[prop] = value;
		settings.set(key, value.trim());
	};

	async function test_connection() {
		const config = settings.llm_config();
		if (!config) return toast('Fill in a base URL and a model first', 'error');
		testing = true;
		try {
			const result = await create_llm(config).test();
			toast(
				result.modelListed
					? `Connected — ${result.models.length} models, "${config.model}" is available`
					: `Connected (${result.models.length} models listed, "${config.model}" not among them — it may still work)`,
				result.modelListed ? 'success' : 'info'
			);
		} catch (err) {
			toast((err as Error).message, 'error');
		} finally {
			testing = false;
		}
	}

	let confirming = $state(false);

	function rebuild(ok: boolean) {
		confirming = false;
		if (!ok) return;
		app.reindex();
		toast('Reindexing in the background');
	}

	const in_flight = $derived(data.queue.active_ids.map((id) => item_by_id(id)).filter((item) => item !== null));
	const outstanding = $derived(data.queue.pending + data.queue.active);
	const session_total = $derived(outstanding + data.queue.done + data.queue.failed);
	const pipeline_pct = $derived(session_total > 0 ? ((data.queue.done + data.queue.failed) / session_total) * 100 : 100);

	function requeue() {
		const n = app.requeue();
		toast(n ? `Requeued ${n} item${n === 1 ? '' : 's'}` : 'Nothing to requeue');
	}

	function retry_failed() {
		const n = app.retry_failed();
		toast(n ? `Retrying ${n} failed item${n === 1 ? '' : 's'}` : 'No failed items');
	}

	const MODELS: Array<{ key: ModelName; label: string }> = [
		{ key: 'embed', label: 'Text embeddings' },
		{ key: 'whisper', label: 'Speech to text' },
		{ key: 'clip', label: 'Image understanding' }
	];
	const THEMES: Array<{ value: ThemeMode; icon: IconName; label: string }> = [
		{ value: 'light', icon: 'sun', label: 'Light' },
		{ value: 'dark', icon: 'moon', label: 'Dark' },
		{ value: 'system', icon: 'monitor', label: 'System' }
	];
	const STATE_LABEL: Record<string, string> = { unloaded: 'not loaded', downloading: 'downloading', loading: 'loading', ready: 'ready', error: 'error' };
</script>

<div class="route">
	<Scroller pad="24px 28px 36px 28px" gap={24}>
		<div class="section">
			<div class="heading">Language model</div>
			<Field label="Base URL" value={llm.baseUrl} placeholder="http://localhost:11434" mono hint={settings.from_env('llm.baseUrl') ? 'set by GPUIX_BRAIN_LLM_URL' : ''} onchange={(v) => save('llm.baseUrl', 'baseUrl', v)} onsubmit={test_connection} />
			<Field label="API key" value={llm.apiKey} placeholder="optional for local servers" secret hint={settings.from_env('llm.apiKey') ? 'set by GPUIX_BRAIN_LLM_KEY' : ''} onchange={(v) => save('llm.apiKey', 'apiKey', v)} />
			<div class="row">
				<div class="cell"><Field label="Model" value={llm.model} placeholder="llama3.2, gpt-4o-mini, …" mono onchange={(v) => save('llm.model', 'model', v)} onsubmit={test_connection} /></div>
				<div class="cell"><Field label="Vision model" value={llm.visionModel} placeholder="optional — llava, gpt-4o, …" mono onchange={(v) => save('llm.visionModel', 'visionModel', v)} /></div>
			</div>
			<div class="actions">
				<Button label={testing ? 'Testing…' : 'Test connection'} icon="check" variant="primary" disabled={testing} onclick={test_connection} />
				{#if testing}<Spinner size={14} />{/if}
			</div>
		</div>

		<div class="section">
			<div class="heading">Appearance</div>
			<!-- A column stretches its children; this one keeps the control as wide as its options. -->
			<div class="setting">
				<Segmented options={THEMES} value={theme.mode} onchange={set_mode} />
			</div>
		</div>

		<div class="section">
			<div class="heading">On-device models</div>
			{#if data.ml.error}
				<div class="problem">{data.ml.error}</div>
			{/if}
			{#each MODELS as m (m.key)}
				{@const status = data.ml[m.key] ?? { state: 'unloaded' }}
				<div class="model">
					<div class="model-text">
						<div class="model-name">{m.label}</div>
						<div class="model-note">{MODEL_IDS[m.key]}</div>
						{#if status.state === 'downloading'}
							<ProgressBar value={status.progress ?? null} />
						{/if}
						{#if status.state === 'error'}
							<div class="problem">{status.error}</div>
						{/if}
					</div>
					<div class="model-state {status.state}">
						{#if status.state === 'loading' || status.state === 'downloading'}<Spinner size={12} />{/if}
						<div>{STATE_LABEL[status.state] ?? status.state}{status.state === 'downloading' && status.progress != null ? ` ${Math.round(status.progress)}%` : ''}</div>
					</div>
					{#if status.state === 'unloaded' || status.state === 'error'}
						<Button label="Load" small disabled={!app.ml.available} onclick={() => app.ml.load(m.key).catch((err) => toast(err.message, 'error'))} />
					{/if}
				</div>
			{/each}
			<div class="actions">
				<div class="status">Worker {data.ml.worker}{data.ml.memory ? ` · ${format_bytes(data.ml.memory.rss)}` : ''} · App {format_bytes(data.memory)}</div>
				<Button label="Restart worker" icon="refresh" small onclick={() => app.ml.restart?.().catch((err) => toast(err.message, 'error'))} />
			</div>
		</div>

		<div class="section">
			<div class="heading">Pipeline</div>
			<div class="hint">
				{#if outstanding > 0}
					{data.queue.active} in flight · {data.queue.pending} queued · {data.queue.done} done this session{data.queue.failed ? ` · ${data.queue.failed} failed` : ''}
				{:else if data.queue.done + data.queue.failed > 0}
					Idle — {data.queue.done} done this session{data.queue.failed ? `, ${data.queue.failed} failed` : ''}
				{:else}
					Idle
				{/if}
			</div>
			<ProgressBar value={outstanding > 0 ? pipeline_pct : 100} />
			{#each in_flight as item (item.id)}
				<div class="job">
					<Spinner size={12} />
					<div class="job-title">{display_title(item)}</div>
					<div class="job-step">{status_text(item)}</div>
				</div>
			{/each}
			{#if data.stuck > 0}
				<div class="problem">{data.stuck} item{data.stuck === 1 ? '' : 's'} stuck unfinished</div>
			{/if}
			<div class="actions">
				<Button label={data.stuck > 0 ? `Requeue ${data.stuck} unfinished` : 'Requeue unfinished'} icon="refresh" small disabled={data.stuck === 0} onclick={requeue} />
				<Button label={data.counts.error > 0 ? `Retry ${data.counts.error} failed` : 'Retry failed'} icon="refresh" small disabled={data.counts.error === 0} onclick={retry_failed} />
			</div>
		</div>

		<div class="section">
			<div class="heading">Feeds</div>
			<Toggle label="Include feeds" checked={include_feeds()} onchange={set_include_feeds} testid="settings-feeds" />
			<div class="setting">
				<div class="label">Default schedule</div>
				<Segmented options={SCHEDULES} value={schedule} onchange={(v) => { schedule = v; settings.set('feeds.schedule', v); }} />
			</div>
			<div class="actions">
				<Button label={data.feeds.length ? `Manage ${data.feeds.length} feed${data.feeds.length === 1 ? '' : 's'}` : 'Add a feed'} icon="rss" small onclick={() => push('/feeds')} />
				<div class="status">{data.counts.feeds} item{data.counts.feeds === 1 ? '' : 's'} from feeds</div>
			</div>
		</div>

		<div class="section">
			<div class="heading">Transcription</div>
			<Field label="Language" value={language} placeholder="auto-detect — or en, sv, de, …" onchange={(v) => { language = v; settings.set('stt.language', v.trim()); }} />
		</div>

		<div class="section">
			<div class="heading">Data</div>
			<div class="path">{app.dirs.root}</div>
			<div class="hint">{data.counts.total} items · {app.vectors.size} text vectors · {app.images.size} image vectors · {format_bytes(app.store.bytes_used())}</div>
			<div class="actions">
				<Button label="Reveal in Finder" icon="folder" small onclick={() => reveal(app.dirs.db)} />
				<Button label="Rebuild index" icon="refresh" small onclick={() => (confirming = true)} />
				{#if confirming}
					<Modal title="Rebuild the index?" body="Every item is chunked and embedded again. Nothing is deleted." confirmLabel="Rebuild" onclose={rebuild} />
				{/if}
			</div>
		</div>
	</Scroller>
</div>

<style>
	.route { display: flex; flex-direction: column; flex-grow: 1; min-height: 0; }
	.section { display: flex; flex-direction: column; gap: 16px; max-width: 760px; padding: 22px 24px; border-radius: 14px; border-width: 1px; background-color: var(--surface); border-color: var(--border); }
	.heading { font-size: 17px; line-height: 24px; font-weight: 600; }
	.hint { font-size: 13px; line-height: 18px; color: var(--inkMuted); }
	.path { font-family: Lilex; font-size: 13px; line-height: 18px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: var(--inkMuted); }
	.label { font-size: 13px; line-height: 18px; font-weight: 600; user-select: none; color: var(--inkMuted); }
	.row { display: flex; flex-direction: row; align-items: end; gap: 14px; }
	/* Equal halves of a row: a field's input would otherwise size to its placeholder and push past the edge. */
	.cell { display: flex; flex-direction: column; flex-grow: 1; flex-basis: 0; min-width: 0; }
	.actions { display: flex; flex-direction: row; align-items: center; gap: 10px; }
	.setting { display: flex; flex-direction: column; align-items: start; gap: 8px; }
	.status { flex-grow: 1; min-width: 0; font-size: 13px; line-height: 18px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: var(--inkMuted); }
	.problem { padding: 10px 12px; border-radius: 8px; font-size: 13px; line-height: 18px; background-color: var(--dangerSoft); color: var(--danger); }
	.model { display: flex; flex-direction: row; align-items: center; gap: 14px; padding: 14px 16px; border-radius: 10px; border-width: 1px; border-color: var(--border); }
	.model-text { display: flex; flex-direction: column; gap: 4px; flex-grow: 1; min-width: 0; }
	.model-name { font-size: 14px; line-height: 20px; font-weight: 600; }
	.model-note { font-family: Lilex; font-size: 12px; line-height: 16px; color: var(--inkFaint); }
	.model-state { display: flex; flex-direction: row; align-items: center; gap: 6px; font-size: 13px; line-height: 18px; font-weight: 500; white-space: nowrap; user-select: none; }
	.model-state.ready { color: var(--accent); }
	.model-state.error { color: var(--danger); }
	.model-state.unloaded { color: var(--inkFaint); }
	.job { display: flex; flex-direction: row; align-items: center; gap: 10px; padding: 8px 12px; border-radius: 8px; font-size: 13px; line-height: 18px; background-color: var(--well); }
	.job-title { flex-grow: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.job-step { white-space: nowrap; color: var(--inkMuted); }
</style>
