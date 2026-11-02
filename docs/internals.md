# How Strata is built

This is the engineering companion to the [README](../README.md). It covers where the code lives,
how the data and model processes fit together, what stands in for the things GPUI has no API for,
and the decisions behind a few of them. [AGENTS.md](../AGENTS.md) is the shorter guide for
contributors and coding agents.

## Where things live

```
  app.ts                 Bun guard → create_app() → render_hot(App.svelte, { props: { app } })
  standalone.ts          the compiled entry: static imports, render() instead of render_hot()
  build.ts               standalone.ts → dist/Strata.app (bun run build); --archive for a release
  vendor/                gpuix-svelte's main, packed, until 0.5.0 is on npm
  App.svelte             root layout, window-level shortcuts, the palette → set_css_vars, route table
  RouteView.svelte       resolves the route and lazy-loads the page component
  routes/                Everything, Kind, Search, Item, Ask, Feeds, Settings, NotFound; Item renders a
                         page one <markdown> block per virtual row (lib/blocks.ts), since a native
                         markdown element lays out its whole document every frame
  components/            Sidebar, ItemCard, CaptureBox, Field, …; Modal is a <Portal> rendered from
                         whoever needs a dialog, ContextMenu one mounted once by App; scrolling
                         is the package's Scroller
  lib/                   the data layer (plain TS) and the UI state (.svelte.ts runes modules);
                         menus.ts is what each right click offers, updates.svelte.ts the updater
  lib/feeds/             the poller (poll.ts, croner) over a source registry; rss.ts reads RSS 2.0,
                         RDF and Atom, and another kind is a module plus an entry in SOURCES
  ml/worker.ts           the child process that owns the models; ml/doctor.ts is the spike
  ml/llm-worker.ts       Gemma's own child process, started on demand (client: lib/llm-local.ts;
                         lib/llms.ts picks Gemma or the endpoint per request)
  native/recorder-shim.m AVAudioRecorder over bun:ffi, compiled by clang on first use (macOS);
                         lib/recorder-win.ts and lib/player-win.ts are the winmm equivalents,
                         over the shared FFI surface in lib/winmm.ts
  scripts/import-hn.ts   the Hacker News importer; frame-cost.ts prints GPUI draw times per route
                         (bun run frames), against a copy of the data; seed-load.ts fills a
                         load-test brain from Wikipedia, picsum.photos and `say`
  test/                  brain.ts (data + native, no models) and smoke.ts (headless UI)
  icon.svg / icon.png    the logo; the .app's icon is cut from the PNG
  .data/                 gitignored: strata.sqlite, cache/, models/, tmp/
```

## The data

**`strata.sqlite` is the whole brain.** Images, thumbnails and recordings are rows in a
`blobs` table, not files beside the database, so copying that one file moves everything,
which is also why `bun run frames` can point a window at a `VACUUM INTO` copy and still
paint. GPUI's `<img src>`, `afplay` and the worker all want a real path, so `lib/blobs.ts`
writes a blob into `cache/` the first time one is asked for. That directory is disposable:
delete it and it fills in again. Blob rows are immutable (replacing an item's media inserts a
new row), so a cache file named after a blob id can never be stale.

The UI process is the only SQLite writer and holds the vector indexes in memory (`lib/vectors.ts`
is the seam to swap for PGlite + pgvector should a corpus ever outgrow a brute-force scan). The
worker is stateless: it gets texts or cache paths over IPC and returns `Float32Array`s, since typed
arrays cross Bun IPC as-is. Every item goes `pending → processing → ready | error`; the steps
are derived from the row's state, so a restart resumes where it stopped instead of replaying an
hour of Whisper. Jobs another process left unfinished are requeued after ten minutes (or from
Settings at once).

## The models

Everything on-device goes through [transformers.js](https://huggingface.co/docs/transformers.js)
in a child Bun process (`ml/worker.ts`): `nomic-ai/nomic-embed-text-v1.5` for text embeddings
(768-d, 8k-token context), `onnx-community/whisper-base` for transcription, and
`Xenova/clip-vit-base-patch32` so a text query finds images by their content.

Search is hybrid: semantic (cosine over the chunk embeddings), keyword (SQLite FTS5 with `bm25()`)
and CLIP image hits, fused with reciprocal rank fusion. Search-hit highlighting uses GPUI's native
`highlight={{ ranges }}` prop, unlocked in gpuix-svelte's renderer for this app, with the ranges
from gpuix-svelte's `find_ranges` (native's own matcher, one call per query term).

The language model is Gemma 4 E4B (`onnx-community/gemma-4-E4B-it-ONNX`, q4f16) through
transformers.js on WebGPU, which is Metal on macOS, in a second child process (`ml/llm-worker.ts`,
client `LocalLlm` in `lib/llm-local.ts`). `lib/llms.ts` hands out Gemma or the OpenAI-compatible
endpoint per request; the prompts themselves (`llm_tasks` in `lib/llm.ts`) are shared. An endpoint
configured before the provider choice existed (or through `GPUIX_BRAIN_LLM_URL`) keeps being used
until you pick one in Settings.

### Memory

Three ONNX models are about 1 GB resident. What made a worker balloon past 6 GB on a 16 GB
machine was attention memory on very long chunks (a minified script is one "word") kept alive
by ONNX Runtime's arena. The safeguards: chunk size is capped by characters as well as words,
embedding batches are eight chunks, the arena is off, Whisper and CLIP unload after five idle
minutes, a worker whose parent died exits on its own, and Settings shows the worker's and the
app's resident size. Run one model-loading process at a time.

Gemma is the big one: about 6 GB resident while loaded (8 GB after a long prompt), in a process
that only exists between the first request and ten idle minutes later. Exiting is the unload,
since it is the one way to be sure WebGPU's buffers go back.

A GPU job that never finishes cannot be cancelled, and can freeze the whole machine, so Gemma
runs fenced in: prompts stay under 3072 tokens, a generation stops at the first junk token or
after three minutes, a worker that stops answering for a minute is killed, only one process may
run Gemma at a time (a `gemma.lock` file in the models directory), and after any of that it stays
off until Strata restarts.

## The macOS app

`bun run build` runs `build.ts`: `build()` from `gpuix-svelte/build` compiles `standalone.ts` and
makes `dist/Strata.app` with its icon and plist, then `build.ts` adds what only Strata needs.
transformers.js cannot be compiled into a Bun binary (onnxruntime's dylib and sharp's addon are
not embedded, see [huggingface/transformers.js#1672](https://github.com/huggingface/transformers.js/issues/1672)),
and it never needs to be: the worker ships as source with its `node_modules` in
`Contents/Resources/ml`, and the app launches it on its **own embedded Bun** by setting
`BUN_BE_BUN=1`, which makes a compiled Bun executable behave as the plain `bun` CLI. The
recorder shim is compiled at build time into `Contents/Resources/native`. Data lives in
`~/Library/Application Support/Strata`. `CODESIGN_IDENTITY` and `NOTARY_PROFILE` sign
(nested addons first, then the executable, then the bundle) and notarize, as gpuix-svelte's
[shipping guide](https://github.com/khromov/gpuix-svelte/blob/main/docs/shipping.md) describes.
`build.ts` does that itself and keeps the identity from `build()`, which signs before Resources
exists and without the microphone entitlement. The bundle is ~270 MB, most of it the Bun runtime
and the onnxruntime and sharp prebuilds, and its zip ~100 MB.

## Releases and updates

`.github/workflows/release.yml` runs on every push to `main`. release-please keeps a PR open that
bumps `package.json` and the changelog from the conventional commits (`feat:`, `fix:`) since the
last release; merging it tags the release. Then macOS runs `bun build.ts --archive` and uploads
the zip, and a last job writes `update.json` with the release notes and uploads that. Until it
finishes the new release's manifest is a 404, which a startup check only logs.

The app asks for
`https://github.com/khromov/strata-gpuix-svelte/releases/latest/download/update.json`, which GitHub
redirects to the newest release's copy, so no API or token is involved. A newer version is offered
in the sidebar and in Settings → Updates (`lib/updates.svelte.ts`). `install()` checks the zip's
hash and size, extracts it beside the app, checks the bundle's identifier and version, swaps the
`.app` and starts the new one, which reports back before the old one exits; a new version that does
not report within ten seconds is rolled back. Extracting blocks the frame loop for a few seconds.
The new instance waits for the old one before `create_app()`, so they never share the database or a
worker. On Windows and Linux the updater swaps a single executable, which cannot carry the ML
worker and its `node_modules`, so releases are macOS only.

Everything below is optional, as repository secrets:

| Secret | What it does |
|---|---|
| `GPUIX_UPDATE_KEY` | Signs `update.json`; the PEM from `bunx --bun --no-install gpuix-svelte update keygen`. Keep a copy: losing it means shipped apps refuse every later update |
| `CODESIGN_IDENTITY`, `MACOS_CERTIFICATE`, `MACOS_CERTIFICATE_PASSWORD` | Sign the app: the identity, and that certificate as a base64 `.p12` with its password |
| `APPLE_ID`, `APPLE_PASSWORD`, `APPLE_TEAM_ID` | Notarize, with an app-specific password. Needs the signing secrets too |
| `RELEASE_PLEASE_TOKEN` | A PAT, so the release PR triggers `test.yml`; `GITHUB_TOKEN`'s events start no workflows |

To sign the manifest, also put the public key `keygen` prints in `standalone.ts`
(`update: { manifest, publicKey }`) and in a repository variable, `GPUIX_UPDATE_PUBLIC_KEY`, which
makes the release fail rather than ship a manifest the apps would refuse. Without a key the app
trusts whoever can publish to the repository's releases, over HTTPS. Without the macOS secrets the
app is unsigned, which does not affect updating but makes macOS block a first install until it is
allowed under System Settings → Privacy & Security.

### Setting up signing

This needs an Apple Developer Program membership, and only its account holder can create a
Developer ID certificate.

1. In Keychain Access, choose Certificate Assistant → Request a Certificate From a Certificate
   Authority and save it to disk. At
   https://developer.apple.com/account/resources/certificates/add choose Developer ID Application,
   upload the request, download the `.cer` and open it. `security find-identity -v -p codesigning`
   then prints `Developer ID Application: Your Name (TEAMID)`. A Mac without Xcode can lack the
   intermediate certificate, which shows as `0 valid identities` and `codesign` failing with
   `errSecInternalComponent`; open https://www.apple.com/certificateauthority/DeveloperIDG2CA.cer too.
2. Create an app-specific password at https://account.apple.com, under Sign-In and Security.
3. For local builds, run this, which prompts for that password:

   ```bash
   xcrun notarytool store-credentials notary --apple-id you@example.com --team-id TEAMID
   ```

   Then put the identity and profile in a `.env` beside `package.json`, which is gitignored:

   ```
   CODESIGN_IDENTITY="Developer ID Application: Your Name (TEAMID)"
   NOTARY_PROFILE=notary
   ```

   `bun run build` now signs and notarizes, and `spctl --assess --type execute dist/Strata.app`
   accepts the result. A 403 "required agreement is missing or has expired" means the account
   holder has to accept the current agreement at https://appstoreconnect.apple.com/agreements.
4. For releases, export the identity from Keychain Access → My Certificates as a password-protected
   `.p12`, then run these in your own terminal, so the values stay out of any log. Each `gh secret
   set` without piped input prompts for its value. Afterwards keep the `.p12` somewhere safe, such
   as a password manager, and delete it from disk.

   ```bash
   R=khromov/strata-gpuix-svelte
   base64 -i cert.p12 | gh secret set MACOS_CERTIFICATE -R $R
   gh secret set MACOS_CERTIFICATE_PASSWORD -R $R
   gh secret set CODESIGN_IDENTITY -R $R
   gh secret set APPLE_ID -R $R
   gh secret set APPLE_PASSWORD -R $R
   gh secret set APPLE_TEAM_ID -R $R
   ```

Once `MACOS_CERTIFICATE` is set, the release fails unless the app comes out signed and notarized, so
set all six together. To try them without publishing anything, run `gh workflow run release.yml`: it
builds, signs and notarizes, and keeps the zip as a workflow artifact for seven days.

To try the swap locally, build with `manifest: 'http://localhost:8765/update.json'` (plain `http:`
is allowed to `localhost` only) at one version, move that `.app` aside, build the next version with
`--archive`, and write the manifest from its fragment with `--base-url http://localhost:8765/`.
Serve `dist/` and run the old app with `GPUIX_BRAIN_DIR` set to a scratch directory.

## Things GPUI has no API for, and what stands in

| Need | Stand-in |
|---|---|
| microphone | two backends behind one interface (`lib/recorder.ts`), both writing 16 kHz mono WAV over `bun:ffi`. macOS: `native/recorder-shim.m`, AVAudioRecorder, compiled by clang on first use. Windows: `lib/recorder-win.ts`, winmm's waveIn with WAVE_MAPPER converting to that format for us, a flat C ABI, so there is nothing to compile. Permission belongs to the process that asks, which from a checkout is your terminal on macOS and `bun.exe` on Windows; the .app asks in its own name |
| file picker | `osascript … choose file` (macOS and Linux; on Windows you type a path) |
| clipboard | `pbpaste`/`pbcopy` on macOS and `Get-Clipboard`/`Set-Clipboard` on Windows for text, `Bun.Image.fromClipboard()` for images |
| audio playback | `afplay` on macOS, `paplay`/`ffplay`/`aplay` on Linux; on Windows the clip is decoded in-process and pushed to winmm's waveOut (`lib/player-win.ts`), since nothing ships with Windows that plays an MP3 from a command line without opening a window |
| system dark mode | `defaults read -g AppleInterfaceStyle` on macOS, `gsettings` on Linux, a `reg query` on Windows; polled every 3 s |
| decoding audio | a hand-written WAV parser (`lib/wav.ts`) and mpg123 as WebAssembly for MP3 (`lib/mp3.ts`). WAV and MP3 are the two formats Strata imports, and both are handled in-process, so there is no ffmpeg to install |
| readable text from a page | one synchronous `HTMLRewriter` pass (`lib/scrape.ts`) that scores candidate containers. lol-html keeps one `onEndTag` callback per element and the element handle is dead inside it; `scrape.ts` shows the way around |
| AVIF / HEIC on screen | GPUI's image crate cannot decode them; `Bun.Image` (ImageIO) stores a WebP display copy beside the original |
| shrinking a recording | LAME as WebAssembly (`wasm-media-encoders`, `lib/mp3.ts`): once the transcript exists, a memo the app recorded itself is re-encoded from 16 kHz PCM to 32 kbps MP3 in place, about eight times smaller, and mpg123 decodes it back if it is ever re-transcribed. An imported file is the user's master and is never rewritten |
| reading a feed | a small XML scanner (`lib/feeds/xml.ts`) rather than `HTMLRewriter`, which is an HTML parser: it voids `<link/>`, lowercases and reshapes the tree, so Atom's `<link href>` and `<content type="html">` do not survive it. The HTML *inside* an entry does go through `extract()` |
| right-click on macOS | GPUI routes ctrl+click to `click`, not `auxClick`, so only a surface with a primary handler can see it; `is_secondary(e)` in `lib/ui.svelte.ts` is that check written once |

## About client-side routers

Strata hand-rolls its router (`lib/router.svelte.ts`, ~60 lines: a `$state` route, a back
stack, `:param` matching, lazy `import()`). Eight popular Svelte routers were evaluated first;
only **svelte-spa-router 5** compiles under the custom renderer and can run here, and only with
a fake `window`/`history` on `globalThis` plus `--conditions svelte` on the run script, since its
`exports` map has nothing but a `svelte` key. The others fail at compile time on `in:` transitions
(`svelte5-router`, `@dvcol/svelte-simple-router`), on Svelte 4 syntax (`svelte-routing`), or need
a browser-sized shim (`sv-router`, `@mateothegreat/svelte5-router`). If you want svelte-spa-router,
this shim, imported before the router, is all it takes:

```js
const listeners = new Map();
let href = 'app:///#/';
globalThis.history = {
	state: null, scrollRestoration: 'auto',
	pushState(s, _t, url) { this.state = s; if (url) href = url; },
	replaceState(s, _t, url) { this.state = s; if (url) href = url; },
	back() {}
};
globalThis.window = {
	history: globalThis.history, scrollX: 0, scrollY: 0, scrollTo() {},
	location: {
		get href() { return href; },
		get hash() { const i = href.indexOf('#'); return i === -1 ? '' : href.slice(i); },
		set hash(v) { href = 'app:///' + (v.startsWith('#') ? v : '#' + v); globalThis.window.dispatchEvent(new Event('hashchange')); }
	},
	addEventListener(type, fn) { (listeners.get(type) ?? listeners.set(type, []).get(type)).push(fn); },
	removeEventListener(type, fn) { const a = listeners.get(type); if (a) a.splice(a.indexOf(fn), 1); },
	dispatchEvent(ev) { for (const fn of listeners.get(ev.type) ?? []) fn(ev); return true; }
};
```

Strata does not, because a desktop app wants a back stack rather than hash URLs, and a fake
`window` in a process whose whole point is "no DOM" is a trap for the next dependency that sniffs
for one.

## Tests

`bun run test` runs `test/brain.ts`, which covers the WAV codec,
the page extractor, the SSE parser, the chunker, the vector index, the store and pipeline with a
stub worker, the feed parser and poller against fixture documents, the Windows microphone consent
parser, and the real IPC client against a fake worker, including a forced crash. Then it runs
`test/smoke.ts`, which mounts the app headlessly and
captures, opens, and deletes a note through GPUI's real hit testing, and walks the updater's states
on a fake `Update`. Neither needs a model or the network.
