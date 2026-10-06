import { requireAdmin } from "@/lib/server/admin-guard";
import { accountError } from "@/lib/server/respond";
import { ipAllowed, siteLocked, trustedIp } from "@/lib/server/site-access";

export const runtime = "nodejs";

/** The site lock's status, and the admin's own address so they know what to allowlist. */
export async function GET(req: Request) {
  try {
    requireAdmin(req);
    const ip = trustedIp(req);
    const allowed = (process.env.SITE_ALLOWED_IPS ?? "").split(/[\s,]+/).filter(Boolean).length;
    return Response.json({
      locked: siteLocked(),
      allowed,
      ip,
      ipAllowed: ipAllowed(ip),
    });
  } catch (e) {
    return accountError(e);
  }
}
