// Single-owner backend authorization model.
// TubePilot is a private, single-installation app: there are no user accounts.
// Every server function runs as the one owner identity below, using the
// service-role client. Credentials and API tokens never leave the server.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/** Stable identity that owns all channels, tokens, jobs and Telegram links. */
export const OWNER_ID = "41153d37-c99e-4254-93d2-aa371cdc0a32";

export type OwnerContext = {
  supabase: typeof supabaseAdmin;
  userId: string;
};

/** Server-side context replacing the removed per-user auth middleware. */
export function ownerContext(): OwnerContext {
  return { supabase: supabaseAdmin, userId: OWNER_ID };
}
