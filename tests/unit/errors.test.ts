import { describe, expect, it, vi } from "vitest";
import { unexpectedErrorResponse } from "@/lib/server/errors";
import { aiErrorMessage } from "@/lib/ai/server";
import { friendlyError } from "@/components/builder/Builder";

describe("error messages people can act on", () => {
  it("says when the database is down, and logs a reference for the owner", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const down = Object.assign(new Error("connect ECONNREFUSED 10.0.0.5:5432"), { code: "ECONNREFUSED" });
    const res = unexpectedErrorResponse(down, "start building your app");
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toMatch(/couldn't reach its database, so it couldn't start building your app/);
    // No server details leak to the person.
    expect(body.error).not.toContain("10.0.0.5");
    expect(log.mock.calls[0][0]).toContain(body.ref);
    const other = await unexpectedErrorResponse(new TypeError("x is undefined"), "start building your app").json();
    expect(other.error).toMatch(/unexpected problem.*reference/);
    log.mockRestore();
  });

  it("says when the AI provider can't be reached", () => {
    expect(aiErrorMessage(new TypeError("fetch failed"), "OpenRouter")).toMatch(/Couldn't reach OpenRouter/);
    expect(aiErrorMessage(new Error("weird"), "OpenRouter")).toBe("OpenRouter failed: weird");
  });

  it("explains bare server errors by kind", () => {
    expect(friendlyError("Request failed (502)")).toMatch(/restarting or busy \(error 502\)/);
    expect(friendlyError("Request failed (504)")).toMatch(/too long to answer \(error 504\)/);
    expect(friendlyError("Request failed (500)")).toMatch(/hit a problem \(error 500\)/);
    expect(friendlyError("You're out of credits: this needs 1 credit. Buy more on the Credits page (/credits).")).toMatch(
      /out of credits.*\[Buy credits\]\(\/credits\)/,
    );
  });
});
