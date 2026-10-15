/**
 * Speaks ml/llm-worker.ts's protocol without a model, so LocalLlm's spawn, token
 * streaming, abort, crash, idle exit and the safeguards run for real. The last message
 * decides: `__slow__` streams fifty words, `__crash__` dies, `__idle__` answers then exits
 * cleanly as an idle worker does, `__hang__` blocks its thread as a stuck GPU wait does
 * (no more heartbeats), `__junk__` reports junk output; anything else is echoed.
 */

import type { LlmJob, LlmMessage, LlmRequest } from "../lib/llm-local.ts";

const send = (msg: LlmMessage) => process.send?.(msg);
const aborted = new Set<number>();
let ready = false;

function load() {
  if (ready) return;
  send({ type: "status", state: "downloading", progress: 50 });
  send({ type: "status", state: "loading" });
  ready = true;
  send({ type: "status", state: "ready", progress: 100 });
}

async function chat(job: Extract<LlmJob, { type: "chat" }>) {
  load();
  const last = job.messages.at(-1)?.content;
  const prompt = typeof last === "string" ? last : "";
  if (prompt === "__crash__") process.exit(1);
  if (prompt === "__hang__") for (;;);
  if (prompt === "__junk__") {
    throw Object.assign(new Error("Gemma 4 E4B started writing junk tokens"), {
      code: "DEGENERATE",
    });
  }
  const slow = prompt === "__slow__";
  const words = slow
    ? Array.from({ length: 50 }, (_, i) => `w${i} `)
    : ["echo: ", prompt];
  let text = "";
  for (const word of words) {
    if (aborted.has(job.id)) break;
    text += word;
    send({ type: "token", id: job.id, text: word });
    await Bun.sleep(slow ? 10 : 0);
  }
  if (prompt === "__idle__") setTimeout(() => process.exit(0), 20);
  return { text };
}

process.on("message", async (msg: LlmRequest) => {
  if (msg?.type === "shutdown") process.exit(0);
  if (msg?.type === "abort") {
    aborted.add(msg.id);
    return;
  }
  try {
    const result = msg.type === "chat" ? await chat(msg) : (load(), { ms: 1 });
    send({ id: msg.id, ok: true, result });
  } catch (err) {
    send({
      id: msg.id,
      ok: false,
      error: {
        message: (err as Error).message,
        code: (err as { code?: string }).code ?? "INFERENCE",
        transient: false,
      },
    });
  }
});
process.on("disconnect", () => process.exit(0));
// The real worker's heartbeat, sped up to suit the tests' short stall limit.
setInterval(() => send({ type: "mem", rss: 1 }), 50);

send({ type: "hello", pid: process.pid });
