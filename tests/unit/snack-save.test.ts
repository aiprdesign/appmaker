import http from "node:http";
import { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { POST } from "@/app/api/snack/route";

let server: http.Server;
const saved: Record<string, unknown>[] = [];
let refuse = new Set<string>();

beforeAll(async () => {
  server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      res.setHeader("content-type", "application/json");
      if (req.url === "/--/api/v2/versions") return res.end(JSON.stringify({ data: { sdkVersions: { "56.0.0": {}, "57.0.0": {}, "58.0.0": { beta: true } } } }));
      if (req.url === "/--/api/v2/snack/save") {
        const json = JSON.parse(body);
        saved.push(json);
        if (refuse.has(json.manifest.sdkVersion)) {
          res.statusCode = 400;
          return res.end(JSON.stringify({ errors: [{ message: "Unsupported SDK" }] }));
        }
        return res.end(JSON.stringify({ id: "@snack/abc123" }));
      }
      res.statusCode = 404;
      res.end("{}");
    });
  });
  await new Promise<void>((r) => server.listen(0, r));
  process.env.APPMAKER_SNACK_API = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => {
  server.close();
  delete process.env.APPMAKER_SNACK_API;
});

const big = "x".repeat(150_000);
const call = (body: unknown) =>
  POST(new Request("http://localhost/api/snack", { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": "10.40.0.1" }, body: JSON.stringify(body) }));

describe("big apps in Snack", () => {
  it("saves the app through Snack's API, on the newest released SDK", async () => {
    const res = await call({ name: "Fresh Keeper", description: "d", dependencies: ["lucide-react-native"], files: { "App.js": `// ${big}\nexport default () => null;`, "../evil.js": "no", "package.json": "no" } });
    expect(await res.json()).toEqual({ id: "@snack/abc123", sdkVersion: "57.0.0" });
    const body = saved.at(-1) as { manifest: Record<string, unknown>; code: Record<string, { type: string; contents: string }>; dependencies: Record<string, unknown> };
    expect(body.manifest).toMatchObject({ sdkVersion: "57.0.0", name: "Fresh Keeper", dependencies: { "lucide-react-native": "*" } });
    expect(Object.keys(body.code)).toEqual(["App.js"]);
    expect(body.code["App.js"].type).toBe("CODE");
    expect(body.dependencies).toEqual({ "lucide-react-native": { version: "*" } });
  });

  it("falls back to an older SDK when Snack doesn't run the newest yet", async () => {
    refuse = new Set(["57.0.0"]);
    const res = await call({ name: "A", files: { "App.js": "export default () => null;" } });
    expect(await res.json()).toMatchObject({ sdkVersion: "56.0.0" });
    refuse = new Set(["57.0.0", "56.0.0"]);
    const failed = await call({ name: "A", files: { "App.js": "export default () => null;" } });
    expect(failed.status).toBe(502);
    expect((await failed.json()).error).toMatch(/Unsupported SDK.*Expo Go/);
    refuse = new Set();
  });

  it("refuses an empty request", async () => {
    expect((await call({ files: {} })).status).toBe(400);
  });
});
