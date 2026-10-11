import { createClient } from "@supabase/supabase-js";
export type Session = { role: "admin" | "seller"; sellerId?: string; exp: number };
/** Cloud validates identity; roles come only from protected database rows. */
export async function verifyToken(token: string): Promise<Session | null> {
  if (!token) return null;
  if (token.startsWith("panel.")) { const {verifyPanelSession}=await import("./panel-auth.server"); return verifyPanelSession(token); }
  const url = process.env['SUPABASE_URL'];
  const key = process.env['SUPABASE_PUBLISHABLE_KEY'];
  if (!url || !key) return null;
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data: { user }, error } = await client.auth.getUser(token);
  if (error || !user || !user.email_confirmed_at) return null;
  const { data: roles } = await client.from('user_roles').select('role,seller_id').eq('user_id',user.id);
  const role = roles?.find(r => r.role === 'admin') ?? roles?.find(r => r.role === 'seller');
  if (!role) return null;
  return { role: role.role, sellerId: role.seller_id ?? undefined, exp: Date.now()+3600000 };
}
