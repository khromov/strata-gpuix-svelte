// `render_hot` re-imports the component from disk on every save, and a binary
// has no source on disk, so the compiled entry mounts it through a static import.
import { render } from 'gpuix-svelte';
import { wait_for_previous_instance } from 'gpuix-svelte/update';
import App from './App.svelte';
import { create_app } from './lib/app.ts';
import { WINDOW } from './lib/window.ts';

// After a self-update, the instance that installed this one is still exiting. render() would wait
// too, but only once create_app has opened the database and started the workers beside it, and
// the old instance rolls the update back if it hears nothing from here within ten seconds.
wait_for_previous_instance();

const app = await create_app();

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
