import { beforeAll, describe, expect, it } from "vitest";
import { POST } from "@/app/api/generate/route";
import { rateLimit } from "@/lib/rate-limit";

beforeAll(() => {
  process.env.APPMAKER_DEMO = "1";
});

const call = (body: unknown) =>
  POST(new Request("http://localhost/api/generate", { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body) }));

describe("POST /api/generate", () => {
  it("rejects malformed requests", async () => {
    expect((await call("not json")).status).toBe(400);
    expect((await call({})).status).toBe(400);
    expect((await call({ prompt: "x".repeat(9000) })).status).toBe(400);
    expect((await call({ prompt: "hi", files: { "../x.js": "a" } })).status).toBe(400);
    expect((await call({ prompt: "hi", history: [{ role: "system", content: "x" }] })).status).toBe(400);
  });

  it("streams a complete demo app that passes the parser", async () => {
    const res = await call({ prompt: "a budget tracker" });
    expect(res.status).toBe(200);
    expect(res.headers.get("X-Appmaker-Mode")).toBe("demo");
    const text = await res.text();
    expect(text).toContain('<file path="App.js">');
    expect(text).toContain("</listing>");
    expect(text).toContain("Pocketwise");
    // Emoji must survive chunked streaming intact.
    expect(text).not.toContain("\uFFFD");
  });

  it("explains that demo mode cannot edit", async () => {
    const res = await call({ prompt: "add dark mode", files: { "App.js": "export default () => null;" } });
    expect(await res.text()).toMatch(/Demo mode/);
  });
});

it("never splits emoji across stream chunks", async () => {
  for (const prompt of ["a habit tracker", "a workout app", "track my expenses", "a journal"]) {
    const res = await call({ prompt });
    const text = await res.text();
    expect(text).not.toContain("\uFFFD");
    expect(text).toMatch(/\p{Extended_Pictographic}/u);
  }
});

describe("rateLimit", () => {
  it("allows up to the limit, then blocks", () => {
    const key = `test-${Math.random()}`;
    expect(rateLimit(key, 2, 60_000).ok).toBe(true);
    expect(rateLimit(key, 2, 60_000).ok).toBe(true);
    const third = rateLimit(key, 2, 60_000);
    expect(third.ok).toBe(false);
    expect(third.retryAfter).toBeGreaterThan(0);
  });
});
