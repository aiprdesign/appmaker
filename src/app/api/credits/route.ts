import { balance, history, paymentsConfig, planOf } from "@/lib/server/credits";
import { currentUser } from "@/lib/server/auth";
import { accountError } from "@/lib/server/respond";

/** Payment setup (public parts), and the signed-in user's balance and history. */
export async function GET(req: Request) {
  try {
    const cfg = paymentsConfig();
    const pub = {
      enabled: cfg.enabled,
      currency: cfg.currency,
      packs: cfg.packs,
      costs: cfg.costs,
      freeCredits: cfg.freeCredits,
      guestBuilds: cfg.guestBuilds,
      mode: cfg.mode,
    };
    if (!cfg.enabled) return Response.json(pub);
    const user = await currentUser(req);
    if (!user) return Response.json({ ...pub, signedIn: false, plan: "guest" });
    return Response.json({ ...pub, signedIn: true, plan: await planOf(user.id), balance: await balance(user.id), history: await history(user.id) });
  } catch (e) {
    return accountError(e);
  }
}
