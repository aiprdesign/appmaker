import { describe, expect, it } from "vitest";
import { isIconImage } from "@/lib/icon";

describe("logo icons", () => {
  const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

  it("accepts a plain base64 image with a known background", () => {
    expect(isIconImage({ image: png, background: "white" })).toBe(true);
    expect(isIconImage({ image: png.replace("image/png", "image/webp"), background: "brand" })).toBe(true);
    expect(isIconImage({ image: png, background: "fill" })).toBe(true);
  });

  it.each([
    ["an unknown background", { image: png, background: "red" }],
    ["an SVG (can carry scripts)", { image: "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=", background: "white" }],
    ["a web link", { image: "https://example.com/logo.png", background: "white" }],
    ["something that breaks out of CSS url()", { image: `${png}"); background: url("https://evil.example/x`, background: "white" }],
    ["a huge image", { image: `data:image/png;base64,${"A".repeat(1_600_000)}`, background: "white" }],
    ["nothing", undefined],
  ])("rejects %s", (_name, value) => {
    expect(isIconImage(value)).toBe(false);
  });
});
