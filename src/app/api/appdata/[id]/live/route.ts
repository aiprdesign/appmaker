import { closeLive, openLive, subscribe, ticketStore } from "@/lib/server/data-versions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/**
 * A live owner page: one open connection that hears about every change the
 * moment it happens (server-sent events), instead of checking. It closes
 * after 30 minutes and the browser reconnects; if it can't connect, the page
 * falls back to its normal checks.
 */
export async function GET(req: Request, ctx: Ctx) {
  const id = (await ctx.params).id;
  const ticket = new URL(req.url).searchParams.get("t") ?? "";
  if (ticketStore(ticket) !== id) return new Response("Not allowed", { status: 403 });
  if (!openLive(id)) return new Response("Busy", { status: 503 });

  const enc = new TextEncoder();
  let cleanup = () => {};
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const send = (text: string) => {
        if (!closed) controller.enqueue(enc.encode(text));
      };
      // Tell the browser to wait 5 seconds before reconnecting, and that we're here.
      send("retry: 5000\n: connected\n\n");
      const stop = subscribe(id, (collection) => send(`event: change\ndata: ${JSON.stringify({ collection })}\n\n`));
      // A comment every 25 seconds keeps proxies from closing a quiet connection.
      const ping = setInterval(() => send(": ping\n\n"), 25_000);
      const end = setTimeout(() => cleanup(), 30 * 60 * 1000);
      cleanup = () => {
        if (closed) return;
        closed = true;
        stop();
        clearInterval(ping);
        clearTimeout(end);
        closeLive(id);
        try {
          controller.close();
        } catch {
          // already closed
        }
      };
      req.signal.addEventListener("abort", () => cleanup());
    },
    cancel() {
      cleanup();
    },
  });
  return new Response(stream, {
    headers: { "content-type": "text/event-stream", "cache-control": "no-store, no-transform", connection: "keep-alive", "x-accel-buffering": "no" },
  });
}
