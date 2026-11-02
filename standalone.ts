// `render_hot` re-imports the component from disk on every save, and a binary
// has no source on disk, so the compiled entry mounts it through a static import.
import { render } from 'gpuix-svelte';
import { updated_from, wait_for_previous_instance } from 'gpuix-svelte/update';
import App from './App.svelte';
import { create_app } from './lib/app.ts';
import { startup_failed } from './lib/dialogs.ts';
import { WINDOW } from './lib/window.ts';

// After a self-update, the instance that installed this one is still running. This call tells it
// the new version started, which makes it exit, then waits for that. Called any later (render()
// would call it after create_app), the old instance would still hold the database while this one
// migrates it, and loading a large brain would count against the ten seconds it allows before it
// rolls the update back. The cost: a version that fails in create_app() has already reported, so
// it stays installed, and startup_failed is what the person sees instead of a rollback.
wait_for_previous_instance();

const app = await create_app().catch((err) => startup_failed(err, updated_from()));

// Written out rather than spread: the build reads `app` from this call's source, and refuses a spread.
render(App, {
	title: WINDOW.title,
	appName: WINDOW.appName,
	width: WINDOW.width,
	height: WINDOW.height,
	minWidth: WINDOW.minWidth,
	minHeight: WINDOW.minHeight,
	windowBackground: WINDOW.windowBackground,
	props: { app },
	app: {
		name: 'Strata',
		identifier: 'dev.gpuix.svelte.strata',
		icon: './icon.png',
		update: { manifest: 'https://github.com/khromov/strata-gpuix-svelte/releases/latest/download/update.json' }
	}
});
