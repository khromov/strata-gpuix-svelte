# AGENTS.md

Substrate is a "second brain" desktop app: notes, links, images and voice memos, hybrid search
and RAG chat. It is a gpuix-svelte app: Svelte 5 components rendered into a native desktop window
by GPUI, the GPU-accelerated UI framework behind the Zed editor. It moved here from gpuix-svelte's
`examples/second-brain` (that repository's history has everything before the move), on top of a
`bun create gpuix-svelte` scaffold. README.md covers what the app does and how it is laid out.

## Documentation

GPUI's elements, styling and events follow their own rules, so read the docs before writing UI code.
Fetch https://khromov.github.io/gpuix-svelte/llms.txt, then the pages it links for the task at hand.

## Commands

```bash
bun install          # gpuix-svelte brings its own Svelte build
bun run ml:install   # once: the ML deps (transformers.js → onnxruntime-node, sharp; ~380 MB of
                     # prebuilds) live in the nested ml/ package so the root stays lean
bun run start        # opens the window; saving a .svelte file hot-reloads it
bun run test         # test/brain.ts, then test/smoke.ts; no models, no network
bun run typecheck    # tsc, then svelte-check against GPUI's element types
bun run ml:doctor    # loads all three models under Bun and runs one inference each; the first
                     # run downloads ~380 MB into .data/models
bun run build        # dist/substrate + dist/Substrate.app (macOS only)
bun run import-hn    # pours the Hacker News front page into the real brain (scrape smoke test)
bun run seed-load    # [count] [--fresh]: a copy of the brain plus 5000 generated items in
                     # .data/load; open it with GPUIX_BRAIN_DIR=.data/load. Downloads stay
                     # in .data/seed-corpus, so later runs are offline
bun run frames       # draw-time stats per route, against a copy of the data (see below)
```

After a change, run `bun run typecheck` and `bun run test`. To see what the window draws, run
`GPUIX_SCREENSHOT=/tmp/x.png GPUIX_BRAIN_STUB=1 bun run start`: it writes a PNG after every mount
and hot reload; open it with an image viewer (or your Read tool). `GPUIX_FPS=1` adds GPUI's
draw-time overlay top right: CUR / 1% / 10% / MAX ms and a frame count (`=minimal` shows the last
draw only). That is draw time, not fps: 8.3 ms is 120 Hz.

**Bun only.** `bun:sqlite`, `Bun.spawn` IPC, `Bun.Image`, `HTMLRewriter` and `bun:ffi` have no Node
twins, so every script that renders passes `--bun` to the gpuix-svelte bin. **Never `bun --hot`**:
`render_hot` does its own in-process reload, and `--hot` re-evaluates Svelte's runtime so the old
component belongs to a module instance the new one can't see.

Env vars, all optional (`GPUIX_BRAIN_*`): `DIR` (data directory, default `.data`), `STUB=1` (seeded
fake data and a stub worker — screenshots), `START=/settings`, `THEME=light|dark`, `ML=off`,
`OFFLINE=1`, `RECORDER=0` (no microphone backend), `FEEDS=0`, `LLM_PROVIDER=local|openai`,
`LLM_URL`/`LLM_KEY`/`LLM_MODEL`, `GEMMA_URL`, `RESOURCES`, `DEBUG=1`. README.md has the table.

## How it fits together

- Models run in a child process (`ml/worker.ts`), which takes one job at a time and does not exist
  without the ML deps; the app opens and keyword search works without them.
- The language model is Gemma 4 E4B on WebGPU by default, in a second child process
  (`ml/llm-worker.ts`, client `LocalLlm` in `lib/llm-local.ts`) that starts on the first request,
  downloads ~5.2 GB into the models directory the first time, and exits after ten idle minutes.
  `lib/llms.ts` hands out Gemma or the OpenAI-compatible endpoint per request (`settings.provider()`);
  the prompts themselves (`llm_tasks` in `lib/llm.ts`) are shared. Beside an `MlStub`, the app gets a
  `LocalStub` that streams a canned answer, so tests and `STUB=1` never load Gemma.
- `substrate.sqlite` is the master record: media are blob rows, and `<data-dir>/cache` is a
  disposable extraction of them (`lib/blobs.ts`).
- RSS/Atom feeds are polled on a per-feed cron (croner, in-process), in or out of the
  timeline/search/Ask/Related behind one `feeds.include` switch.
- Right-click menus on every surface: `components/ContextMenu.svelte` draws them, `lib/menus.ts`
  says what is in them. GPUI routes macOS's ctrl+click to `click`, not `auxClick`, so
  `is_secondary(e)` in `lib/ui.svelte.ts` is that check written once.
- Tab reaches `keydown` as an ordinary key, so `App.svelte` walks the window's fields with
  `focus_next()` / `focus_previous()`. The focused field's own `onkeydown` runs first, and one that
  spends Tab itself (the search box taking a completion) calls `spend_tab()` so the window skips it.
  As of native 0.10, `focus_previous()` does not move off an `<input>` or `<textarea>`.
- Recording and playback work on macOS (AVFoundation via the clang-built `native/recorder-shim.m`)
  and on Windows (winmm's waveIn/waveOut straight over `bun:ffi`, no shim to compile —
  `lib/winmm.ts`, `lib/recorder-win.ts`, `lib/player-win.ts`).
- Dialogs, toasts and search completions render through `Portal` from whichever component needs
  them (`components/Modal.svelte`; there is no `ui.confirm()` promise store). The timeline and kind
  lists use `<Scroller virtual>`.
- `<markdown>` is rebuilt and laid out in full on every frame, and its cost follows block count, so
  `routes/Item.svelte` renders one block per virtual row (`lib/blocks.ts`: one row per top-level
  token of `marked`'s lexer).
- The palette is `LIGHT`/`DARK` in `lib/theme.ts`, handed to `set_css_vars` from an `$effect` in
  `App.svelte`; a theme switch is one call. `components/Icon.svelte` sets its tones explicitly,
  since a parent's `:hover` colour never reaches an `<svg>`.
- Shared state lives in `.svelte.ts` modules (route, theme, UI state). They are deliberately one
  instance per process, so they survive a hot remount, and editing one needs a restart.

## Tests

Plain scripts over `gpuix-svelte/test`, exiting 1 on any failure. `check(label, actual, expected)`
counts, and `finish(name, n)` fails unless exactly `n` checks ran, so adding or removing a check
means bumping that number; `test/brain.ts` computes its own, since its recorder checks only run on
macOS and Windows. `brain.ts` covers the WAV codec (including the streamed header the Windows
recorder writes), the page extractor, SSE parser, chunker, vector index, store and pipeline with a
stub worker, the feed parser and poller over fixture documents, the Windows mic consent parser,
and the real IPC client against a fake worker (`test/fake-worker.ts`), including a crash; the same
for `LocalLlm` against `test/fake-llm-worker.ts` (streaming, abort, crash, idle exit), plus the
provider choice and Ask through the stub.
`test/smoke.ts` mounts the app headlessly and captures, opens, deletes through GPUI's real hit
testing; a long page paints only the rows in view. Prefer the click/press/hover helpers over
calling `dispatch()` directly, which bypasses hit testing; `wait_for(pred)` waits on timers (a
tooltip's delay), and `painted_highlights()` reads back what `highlight` painted.

The headless renderer (Metal) crashes under a sandboxed shell ("Swift Fatal error: Array index out
of range", hiservices XPC errors); run tests and the app with the sandbox off.

## Measuring frame cost

Scroll lag here is native per-frame layout, not JS, so measure before reasoning. `bun run frames
[--keep] [route ...]` (`scripts/frame-cost.ts`) boots Substrate against a `VACUUM INTO` copy of
the data, visits each route (default: `/`, `/settings` and the item with the longest body), and
prints a table of GPUI's own draw times: idle frames over 2 s, then p90/p99/max and fps while 90
wheel events scroll the content column. `--keep` leaves the window open with the overlay on, for
scrolling by hand. It is a thin script over gpuix-svelte's `debugFrameOverlay` render option,
`reset_debug_overlay_stats()` and `debug_overlay_stats()`, plus native's
`simulateScrollWheel(x, y, dx, dy)`, which `GpuixRenderer` and `TestGpuixRenderer` both expose.
Baselines on 2026-10-12 (native 0.10.0, 1180×780, scroll p90): the timeline ~2.2 ms a frame,
settings ~6.1 ms, the longest item ~1.9 ms. On 2026-09-03 (native 0.7.0) they were ~4.6, ~7–9 and
~5 ms (the item route was ~18 ms with a 226-block page before its Scroller went virtual), and
`/settings` blocked ~90 ms per simulated wheel event although its draw was ~9 ms.

## Memory

The development machine has 16 GB of RAM and each `ml/worker.ts` loads ~1 GB of ONNX models, each
`ml/llm-worker.ts` 6–8 GB: check `ps -axo pid,rss,command | grep worker` after background runs and
kill orphans, and prefer `GPUIX_BRAIN_STUB=1` or `MlStub` for screenshots and tests. Keep the safeguards: chunk length
capped by characters, embedding batches of 8, `enableCpuMemArena: false`, idle unload of
Whisper/CLIP, and the worker's orphan watchdog.

## Building

`bun run build` runs `build.ts`: `Bun.build({ compile })` over `standalone.ts` gives
`dist/substrate`, and `dist/Substrate.app` is assembled around it. macOS only, and it needs
`ml:install` first. transformers.js can't be compiled into a Bun binary
(huggingface/transformers.js#1672), so the worker ships as source with its `node_modules` in
`Contents/Resources` and the app runs it on its own embedded Bun (`BUN_BE_BUN=1`). onnxruntime-node
ships every platform's prebuilt runtime, so the copy is pruned to the host's. The compiled app keeps
its data in `~/Library/Application Support/Substrate`. `CODESIGN_IDENTITY` signs with the hardened
runtime and `NOTARY_PROFILE` then notarizes and staples (`xcrun notarytool store-credentials
<profile>` once). `standalone.ts` mounts `App.svelte` with `render` and a static import, since a
binary has no source to hot-reload; keep its window options in step with `app.ts` (both read
`lib/window.ts`).

## Writing components

- Elements are GPUI's: `div`, `text`, `img`, `svg`, `input`, `textarea`, `code`, `markdown`,
  `virtual-list`, `anchored`. `<img src>` takes a file path, a `data:` URL or an http(s) URL, plus
  a width and a height.
- Style with `<style>` class rules (`.btn`, `.btn.primary`, `.btn:hover`, `.btn:active`) and inline
  `style=`. Layout is flexbox in logical pixels: lengths in `px` or `rem` (16 px), and `%`/`auto`
  for `width`, `height`, `min-*` and `max-*`. Use `flex-grow: 1` for `flex: 1`, and `border-width`
  plus `border-color` for `border`. The styling page lists every property.
- Colours go in `var(--token)`, from the palette in `lib/theme.ts`.
- Inputs report through events: `<input value={text} onchange={(e) => (text = e.value)} />`.
  `{@attach (node) => ...}` hands you an element.
- A click goes to the element under the pointer. Put `hitbox="self"` on a clickable element whose
  children paint a background, and it receives their clicks. `onclick` is the primary button; right
  and middle clicks are `onauxclick`.
- App-wide keyboard shortcuts: `on_window_key('keydown', handler)` from `gpuix-svelte`, returned
  from an `$effect` so it unsubscribes.
- Scrolling content goes in `Scroller` (`gpuix-svelte/components/Scroller.svelte`), which draws the
  scrollbar; modals, menus and toasts go in `Portal` (`gpuix-svelte/components/Portal.svelte`),
  which paints on top; hover tips and dropdowns that sit beside a trigger go in `Tooltip` and
  `Popover` from the same directory. `IconButton`'s `tip` is a `Tooltip`, coloured by the palette's
  `tooltip-surface` and `tooltip-ink`.
- `window_size` from `gpuix-svelte` is the window's size, reactive in a template or `$derived`; it
  polls only while something reactive reads it, so keep reads inside components.
- Handlers take `GpuixEvent` and `{@attach}` gets a `ShadowNode`, both importable as types from
  `gpuix-svelte`.

## Dependencies

`gpuix-svelte` brings its own build of Svelte, the one with the custom renderer API, and resolves
every `svelte` import to it. Keep `svelte` itself out of `package.json`. The ML stack is a separate
package in `ml/` with its own `bun.lock`; Bun blocks onnxruntime-node's postinstall, which only
fetches CUDA binaries for Linux, and nothing here needs it.
