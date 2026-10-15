import type { Bus } from './bus.ts';
import { normalize_base_url, type LlmConfig, type LlmProvider } from './llm.ts';
import { DEFAULT_SCHEDULE } from './feeds/schedules.ts';
import { READER_SIZE } from './theme.ts';
import type { Store } from './store.ts';

export interface SettingValues {
	'llm.provider': LlmProvider;
	'llm.baseUrl': string;
	'llm.apiKey': string;
	'llm.model': string;
	'llm.visionModel': string;
	'theme.mode': 'system' | 'light' | 'dark';
	'stt.language': string;
	'ml.autoload': boolean;
	'index.embedModel': string | null;
	'feeds.include': boolean;
	'feeds.schedule': string;
	'reader.textSize': number;
}

export type SettingKey = keyof SettingValues;

interface SettingSpec {
	default: string | number | boolean | null;
	env?: string;
	secret?: boolean;
	internal?: boolean;
}

export type Settings = ReturnType<typeof create_settings>;

export const SETTINGS: Record<SettingKey, SettingSpec> = {
	'llm.provider': { default: 'local', env: 'GPUIX_BRAIN_LLM_PROVIDER' },
	'llm.baseUrl': { default: '', env: 'GPUIX_BRAIN_LLM_URL' },
	'llm.apiKey': { default: '', env: 'GPUIX_BRAIN_LLM_KEY', secret: true },
	'llm.model': { default: '', env: 'GPUIX_BRAIN_LLM_MODEL' },
	'llm.visionModel': { default: '' },
	'theme.mode': { default: 'system' },
	'stt.language': { default: '' },
	'ml.autoload': { default: true },
	'index.embedModel': { default: null, internal: true },
	'feeds.include': { default: true },
	'feeds.schedule': { default: DEFAULT_SCHEDULE },
	'reader.textSize': { default: READER_SIZE }
};

const mask = (value: unknown) => (value ? `${'•'.repeat(Math.max(0, Math.min(12, String(value).length - 4)))}${String(value).slice(-4)}` : '');

export function create_settings(store: Store, bus: Bus) {
	const from_env = (key: SettingKey) => {
		const env = SETTINGS[key]?.env;
		return env ? process.env[env] || null : null;
	};

	const settings = {
		/** env override > stored > default */
		get<K extends SettingKey>(key: K): SettingValues[K] {
			const env = from_env(key);
			if (env !== null) return env as SettingValues[K];
			const stored = store.get_setting(key);
			return (stored === undefined ? SETTINGS[key]?.default : stored) as SettingValues[K];
		},

		set(key: SettingKey, value: unknown) {
			store.set_setting(key, value);
			bus.emit({ type: 'settings', key, value });
		},

		from_env: (key: SettingKey) => from_env(key) !== null,

		all({ reveal = false }: { reveal?: boolean } = {}): Record<SettingKey, unknown> {
			const out = {} as Record<SettingKey, unknown>;
			for (const key of Object.keys(SETTINGS) as SettingKey[]) {
				const value = settings.get(key);
				out[key] = SETTINGS[key].secret && !reveal ? mask(value) : value;
			}
			return out;
		},

		/** An endpoint set up before there was a choice (or by env) keeps answering until one is made. */
		provider(): LlmProvider {
			const chosen = from_env('llm.provider') ?? store.get_setting('llm.provider');
			if (chosen === 'local' || chosen === 'openai') return chosen;
			return settings.llm_config() ? 'openai' : 'local';
		},

		llm_config(): LlmConfig | null {
			const baseUrl = settings.get('llm.baseUrl');
			const model = settings.get('llm.model');
			if (!baseUrl || !model) return null;
			return { baseUrl: normalize_base_url(baseUrl), apiKey: settings.get('llm.apiKey') ?? '', model };
		},

		/** The endpoint's vision model, when one is set. */
		vision_config(): LlmConfig | null {
			const base = settings.llm_config();
			const model = settings.get('llm.visionModel');
			return base && model ? { ...base, model } : null;
		}
	};

	return settings;
}
