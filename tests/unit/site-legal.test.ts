import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { LEGAL_FIELDS, missingLegal, parseLegal, privacySections, termsSections } from "@/lib/site-legal";
import { closeDatabase, query } from "@/lib/server/db";
import { getLegal, setLegal } from "@/lib/server/site-legal";

describe("site terms and privacy policy", () => {
  it("checks the owner's details and lists what's missing", () => {
    const d = parseLegal({ company: "Acme <b>Apps</b>", email: "not-an-email", effective: "2026-10-01", jurisdiction: "{{x}} England and Wales" });
    expect(d.company).toBe("Acme b Apps /b");
    expect(d.email).toBe("");
    expect(d.jurisdiction).toBe("x England and Wales");
    expect(missingLegal(d)).toEqual(["Contact email", "Postal address"]);
  });

  it("only uses placeholders that the admin can fill in, and says who is responsible", () => {
    const keys = new Set(LEGAL_FIELDS.map((f) => f.key));
    const text = [...termsSections(), ...privacySections()].flatMap((s) => [...s.paragraphs, ...(s.bullets ?? []), ...(s.after ?? [])]).join("\n");
    for (const m of text.matchAll(/\{\{(\w+)\}\}/g)) expect(keys.has(m[1] as never), m[1]).toBe(true);
    expect(text).toContain("You're responsible for everything in your apps and their store listings");
    expect(text).toContain("There are no subscriptions");
    expect(text).toContain("don't use analytics or tracking cookies");
    expect(text).toContain("delete them one year after the appointment");
  });
});

const DB = process.env.TEST_DATABASE_URL;
describe.skipIf(!DB)("legal details (PostgreSQL)", () => {
  beforeAll(() => {
    process.env.DATABASE_URL = DB;
  });
  afterAll(async () => {
    await query("delete from app_settings where key = 'legal'");
    await closeDatabase();
    delete process.env.DATABASE_URL;
    delete process.env.APPMAKER_CONTACT_EMAIL;
  });

  it("saves the details, with the environment as a fallback", async () => {
    await query("delete from app_settings where key = 'legal'");
    process.env.APPMAKER_CONTACT_EMAIL = "hello@acme.example";
    expect((await getLegal()).email).toBe("hello@acme.example");
    const saved = await setLegal({ company: "Acme Apps Ltd", jurisdiction: "England and Wales", effective: "2026-10-01" });
    expect(saved).toMatchObject({
      company: "Acme Apps Ltd",
      email: "hello@acme.example",
      jurisdiction: "England and Wales",
      effective: "2026-10-01",
      address: "",
    });
  });
});
