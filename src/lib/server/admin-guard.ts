import { adminConfigured, isAdmin } from "./admin";
import { AuthError } from "./auth";
import { databaseConfigured } from "./db";

/** For admin routes: the admin area is on and this browser is signed in to it. */
export function requireAdmin(req: Request, needsDatabase = false): void {
  if (!adminConfigured()) throw new AuthError("The admin area is off. Set ADMIN_PASSWORD on the server to turn it on.", 404);
  if (!isAdmin(req)) throw new AuthError("Enter the admin password.", 401);
  if (needsDatabase && !databaseConfigured()) throw new AuthError("This needs the database. Add DATABASE_URL first.", 409);
}
