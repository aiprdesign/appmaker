import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { POST as qualityRoute } from "@/app/api/quality/route";
import { fixFor } from "@/components/builder/Feedback";
import { isQualityEvent, qualityFixRequest } from "@/lib/quality";
import { closeDatabase, query } from "@/lib/server/db";
import { qualityReport, recordQuality } from "@/lib/server/quality";

describe("quality events", () => {
  it("knows its events, and turns problems into a clear fix request", () => {
    expect(isQualityEvent("layout")).toBe(true);
    expect(isQualityEvent("drop table")).toBe(false);
    const text = qualityFixRequest([
      { kind: "contrast", message: 'Text is hard to read: "Hello" 1.4:1.' },
      { kind: "touch", message: "Buttons smaller than 44pt." },
    ]);
    expect(text).toContain('"Hello" 1.4:1');
    expect(text).toContain("44×44pt");
    expect(text).toContain("iPhone, Android and the web");
    expect(fixFor("wrong", "A pantry tracker for my family")).toContain('"A pantry tracker for my family"');
    expect(fixFor("layout", "")).toContain("flex: 1");
  });
});

const DB = process.env.TEST_DATABASE_URL;
describe.skipIf(!DB)("quality counts (PostgreSQL)", () => {
  beforeAll(async () => {
    process.env.DATABASE_URL = DB;
    await query("delete from app_quality");
  });
  afterAll(async () => {
    await query("delete from app_quality");
    await closeDatabase();
    delete process.env.DATABASE_URL;
  });

  it("counts events per day and model, ignores unknown ones, and reports trends", async () => {
    await recordQuality(["build:new", "layout", "layout"], "anthropic/claude-x");
    await recordQuality(["build:edit", "screen:clean"], "anthropic/claude-x");
    const res = await qualityRoute(
      new Request("http://localhost/api/quality", { method: "POST", body: JSON.stringify({ events: ["contrast", "nope", "build:new"], model: "bad model!" }) }),
    );
    expect(res.status).toBe(204);
    await query("insert into app_quality (day, model, event, count) values (current_date - 10, 'anthropic/claude-x', 'layout', 5)");

    const r = await qualityReport(30);
    const ev = (e: string) => r.events.find((x) => x.event === e);
    expect(ev("layout")).toMatchObject({ total: 6, last7: 1, prev7: 5 });
    expect(ev("contrast")?.total).toBe(1);
    expect(ev("nope")).toBeUndefined();
    expect(r.models.find((m) => m.model === "anthropic/claude-x")).toMatchObject({ builds: 2, clean: 1 });
    // A bad model name falls back to the site's default model.
    expect(r.models.some((m) => m.model.includes("bad model"))).toBe(false);
  });
});
