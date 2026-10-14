import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { POST as signup } from "@/app/api/auth/signup/route";
import { POST as upload } from "@/app/api/images/route";
import { GET as serve } from "@/app/api/images/[id]/route";
import { closeDatabase, query } from "@/lib/server/db";
import { imageType, parseImageData } from "@/lib/images";

// A real 1×1 JPEG, PNG header and WebP header.
const JPEG = Buffer.from("/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==", "base64");
const dataUrl = (b: Buffer, type = "image/jpeg") => `data:${type};base64,${b.toString("base64")}`;

describe("owners' photos", () => {
  it("knows a photo by its bytes, not by what it claims to be", () => {
    expect(imageType(JPEG)).toBe("image/jpeg");
    expect(imageType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0]))).toBe("image/png");
    expect(imageType(Buffer.from("RIFF0000WEBPVP8 "))).toBe("image/webp");
    expect(() => parseImageData(dataUrl(Buffer.from("<svg onload=alert(1)>"), "image/png"))).toThrow(/isn't a photo/);
    expect(() => parseImageData("data:text/html;base64,PGgxPg==")).toThrow(/isn't a photo/);
    expect(() => parseImageData(dataUrl(Buffer.concat([JPEG, Buffer.alloc(500_000)])))).toThrow(/too large/);
    expect(parseImageData(dataUrl(JPEG, "image/png")).type).toBe("image/jpeg");
  });
});

const DB = process.env.TEST_DATABASE_URL;
const ORIGIN = "http://localhost:3000";
const req = (path: string, body: unknown, cookie?: string) =>
  new Request(`${ORIGIN}${path}`, {
    method: "POST",
    headers: { host: "localhost:3000", origin: ORIGIN, "content-type": "application/json", "x-forwarded-for": "10.78.0.1", ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  });

describe.skipIf(!DB)("owners' photos (PostgreSQL)", () => {
  beforeAll(() => {
    process.env.DATABASE_URL = DB;
  });
  afterAll(async () => {
    await closeDatabase();
    delete process.env.DATABASE_URL;
  });
  beforeEach(async () => {
    await query("delete from app_users where email like '%@photos.example.com'");
  });

  it("needs an account; then anyone can see the photo, cached, as the type it really is", async () => {
    expect((await upload(req("/api/images", { data: dataUrl(JPEG) }))).status).toBe(401);
    const res = await signup(req("/api/auth/signup", { email: "owner@photos.example.com", password: "correct horse" }));
    const cookie = res.headers.get("set-cookie")!.split(";")[0];
    expect((await upload(req("/api/images", { data: "data:text/html;base64,PGgxPg==" }, cookie))).status).toBe(400);
    const ok = await upload(req("/api/images", { data: dataUrl(JPEG) }, cookie));
    expect(ok.status).toBe(200);
    const { id, url } = await ok.json();
    expect(url).toBe(`http://localhost:3000/api/images/${id}`);

    const shown = await serve(new Request(url), { params: Promise.resolve({ id }) });
    expect(shown.status).toBe(200);
    expect(shown.headers.get("content-type")).toBe("image/jpeg");
    expect(shown.headers.get("cache-control")).toContain("immutable");
    expect(shown.headers.get("x-content-type-options")).toBe("nosniff");
    expect(Buffer.from(await shown.arrayBuffer()).equals(JPEG)).toBe(true);
    expect((await serve(new Request(url, { headers: { "if-none-match": `"${id}"` } }), { params: Promise.resolve({ id }) })).status).toBe(304);
    expect((await serve(new Request(url), { params: Promise.resolve({ id: "../etc/passwd" }) })).status).toBe(404);

    // Photos go with the account.
    await query("delete from app_users where email = 'owner@photos.example.com'");
    expect((await serve(new Request(url), { params: Promise.resolve({ id }) })).status).toBe(404);
  });
});
