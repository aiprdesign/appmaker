import { afterEach, describe, expect, it } from "vitest";
import { seal, sealText, unseal, unsealText } from "@/lib/server/data-crypto";

describe("customer data encryption", () => {
  afterEach(() => {
    delete process.env.DATA_ENCRYPTION_KEY;
  });
  it("stores records and booking fields unreadably, and reads them back", () => {
    process.env.DATA_ENCRYPTION_KEY = "a-long-random-secret-for-tests";
    const sealed = seal({ name: "Ana", phone: "555" });
    expect(JSON.stringify(sealed)).not.toContain("Ana");
    expect(unseal(sealed)).toEqual({ name: "Ana", phone: "555" });
    const phone = sealText("5550199");
    expect(phone).toMatch(/^enc:v1\./);
    expect(unsealText(phone)).toBe("5550199");
  });
  it("without a key, keeps working as before and still reads old plain records", () => {
    expect(seal({ name: "Ana" })).toEqual({ name: "Ana" });
    expect(sealText("555")).toBe("555");
    expect(unseal({ name: "Bo" })).toEqual({ name: "Bo" });
  });
  it("never shows garbage when the key is wrong", () => {
    process.env.DATA_ENCRYPTION_KEY = "first-key-xxxxxxxxxxxxxxxx";
    const sealed = seal({ name: "Ana" });
    process.env.DATA_ENCRYPTION_KEY = "another-key-yyyyyyyyyyyyyy";
    expect(unseal(sealed)).toEqual({});
  });
});
