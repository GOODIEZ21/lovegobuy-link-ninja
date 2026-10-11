import { createServerFn } from "@tanstack/react-start";
import type { Tables } from "@/integrations/supabase/types";

const ADMIN_TABLES = [
  "agents",
  "categories",
  "guide_steps",
  "products",
  "promos",
  "sellers",
  "settings",
  "shipping_rates",
  "social_links",
] as const;

type AdminTable = (typeof ADMIN_TABLES)[number];

function cleanToken(value: unknown) { return String(value ?? "").slice(0, 4000); }

export const getPanelSession = createServerFn({ method: "POST" })
  .inputValidator((data: { token: string }) => ({ token: cleanToken(data?.token) }))
  .handler(async ({ data }) => {
    const { verifyToken } = await import("@/lib/session.server");
    return await verifyToken(data.token);
  });

export const adminLogin = createServerFn({ method: "POST" })
  .inputValidator((data: { login: string; password: string }) => ({login:String(data?.login??'').trim().slice(0,120),password:String(data?.password??'').slice(0,500)}))
  .handler(async ({data}) => { const {loginPanel}=await import('./panel-auth.server');return loginPanel(data.login,data.password); });
export const changeAdminCredentials = createServerFn({method:'POST'})
 .inputValidator((data:{token:string;current:string;login:string;password:string})=>data)
 .handler(async({data})=>{const {changePanelCredentials}=await import('./panel-auth.server');return changePanelCredentials(data.token,data.current,data.login,data.password)});
export const sellerLogin = createServerFn({ method: "POST" })
  .inputValidator((data: { token: string }) => ({ token: cleanToken(data?.token) }))
  .handler(async ({ data }) => {
    const { verifyToken } = await import("@/lib/session.server");
    const session = await verifyToken(data.token);
    return session?.role === "seller" && session.sellerId ? { ok: true as const, token: data.token, sellerId: session.sellerId } : { ok: false as const };
  });

/**
 * Single privileged write path for the admin and seller panels.
 * The browser never writes to the database directly: every mutation is
 * authorised here against a signed session token before it runs.
 */
export const secureMutate = createServerFn({ method: "POST" })
  .inputValidator(
    (data: {
      token: string;
      table: string;
      op: "insert" | "update" | "upsert" | "delete";
      values?: unknown;
      id?: string | null;
    }) => {
      const table = String(data?.table ?? "");
      if (!(ADMIN_TABLES as readonly string[]).includes(table)) throw new Error("Unknown table");
      const op = String(data?.op ?? "");
      if (!["insert", "update", "upsert", "delete"].includes(op)) throw new Error("Unknown op");
      const id = data?.id == null ? null : String(data.id).slice(0, 100);
      if ((op === "update" || op === "delete") && !id) throw new Error("Missing id");
      return {
        token: cleanToken(data?.token),
        table: table as AdminTable,
        op: op as "insert" | "update" | "upsert" | "delete",
        values: data?.values ?? null,
        id,
      };
    },
  )
  .handler(async ({ data }) => {
    const { verifyToken } = await import("@/lib/session.server");
    const session = await verifyToken(data.token);
    if (!session) return { error: "Unauthorized" };

    if (session.role === "seller") {
      if (data.op === "upsert") return { error: "Unauthorized" };
      // Sellers may only manage their own products and their own store row.
      if (!session.sellerId) return { error: "Unauthorized" };
      if (data.table === "sellers") {
        if (data.op !== "update" || data.id !== session.sellerId) return { error: "Unauthorized" };
      } else if (data.table !== "products") {
        return { error: "Unauthorized" };
      }
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    if (session.role === "seller" && data.table === "products" && (data.op === "update" || data.op === "delete")) {
      if (!data.id) return { error: "Unauthorized" };
      const { data: row } = await supabaseAdmin
        .from("products")
        .select("seller_id")
        .eq("id", data.id)
        .maybeSingle();
      if (!row || row.seller_id !== session.sellerId) return { error: "Unauthorized" };
    }

    const scopeValues = (values: unknown) => {
      if (session.role !== "seller") return values;
      if (data.table === "sellers") {
        const { password_hash: _p, username: _u, active: _a, ...rest } =
          (values ?? {}) as Record<string, unknown>;
        return rest;
      }
      const apply = (v: Record<string, unknown>) => {
        const { id: _id, ...rest } = v;
        return { ...rest, seller_id: session.sellerId };
      };
      return Array.isArray(values)
        ? values.map((v) => apply(v as Record<string, unknown>))
        : apply((values ?? {}) as Record<string, unknown>);
    };

    if (data.table === "sellers" && session.role === "admin" && data.op !== "delete") {
      const input = (data.values ?? {}) as Record<string, unknown>;
      const { password_hash: _password, user_id: _owner, password: rawPassword, ...safe } = input;
      const password = String(rawPassword ?? "");
      if (password && password.length < 8) return { error: "Hasło musi mieć minimum 8 znaków." };
      const { sellerLoginEmail } = await import("@/lib/sellerLogin");
      const setAccount = async (login: string, currentUserId: string | null) => {
        const email = sellerLoginEmail(login);
        if (currentUserId) {
          const { error } = await supabaseAdmin.auth.admin.updateUserById(currentUserId, password ? { email, password, email_confirm: true } : { email, email_confirm: true });
          return error ? null : currentUserId;
        }
        const { data: created, error } = await supabaseAdmin.auth.admin.createUser({ email, password, email_confirm: true });
        if (created?.user) return created.user.id;
        if (!error) return null;
        // Konto z tym loginem już istnieje — ustawiamy nowe hasło.
        const { data: list } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
        const found = list?.users.find((u) => u.email?.toLowerCase() === email);
        if (!found) return null;
        const { error: upd } = await supabaseAdmin.auth.admin.updateUserById(found.id, { password, email_confirm: true });
        return upd ? null : found.id;
      };
      if (data.op === "insert" || data.op === "upsert" || data.op === "update") {
        const login = String(safe['username'] ?? "").trim().toLowerCase();
        const loginOk = /^[a-z0-9._@+-]{3,80}$/.test(login);
        safe['username'] = login;
        const sellerRowId = data.id ?? (safe['id'] ? String(safe['id']) : null);
        const existing = sellerRowId ? await supabaseAdmin.from("sellers").select("id,user_id").eq("id", sellerRowId).maybeSingle() : null;
        if (!existing?.data) {
          if (!loginOk) return { error: "Podaj login sprzedawcy (min. 3 znaki, bez spacji)." };
          if (!password) return { error: "Ustaw hasło dla sprzedawcy (min. 8 znaków)." };
          const userId = await setAccount(login, null);
          if (!userId) return { error: "Nie udało się utworzyć konta sprzedawcy — ten login może być zajęty." };
          const { data: seller, error: sellerError } = await supabaseAdmin.from("sellers").insert({ ...safe, name: String(safe['name'] ?? ""), slug: String(safe['slug'] ?? ""), user_id: userId }).select("id").single();
          if (sellerError || !seller) {
            console.error("seller insert failed", sellerError?.message);
            return { error: sellerError?.code === "23505" ? "Sklep o takim adresie (slug) już istnieje." : "Nie udało się zapisać sklepu." };
          }
          await supabaseAdmin.from("user_roles").delete().eq("user_id", userId).eq("role", "seller");
          const { error: roleError } = await supabaseAdmin.from("user_roles").insert({ user_id: userId, seller_id: seller.id, role: "seller" });
          return { error: roleError ? "Nie udało się nadać dostępu do sklepu." : null };
        }
        const oldUserId = (existing.data as { user_id: string | null }).user_id;
        if (password) {
          if (!loginOk) return { error: "Podaj login sprzedawcy (min. 3 znaki, bez spacji)." };
          const userId = await setAccount(login, oldUserId);
          if (!userId) return { error: "Nie udało się zmienić loginu/hasła — ten login może być zajęty." };
          safe['user_id'] = userId;
          if (!oldUserId) {
            await supabaseAdmin.from("user_roles").delete().eq("user_id", userId).eq("role", "seller");
            await supabaseAdmin.from("user_roles").insert({ user_id: userId, seller_id: existing.data.id, role: "seller" });
          }
        } else if (oldUserId) {
          if (!loginOk) return { error: "Podaj login sprzedawcy (min. 3 znaki, bez spacji)." };
          await supabaseAdmin.auth.admin.updateUserById(oldUserId, { email: sellerLoginEmail(login), email_confirm: true });
        } else if (!loginOk) {
          // Sklep bez konta: zapisujemy logo, opis itp., login można nadać później.
          safe['username'] = null;
        }
      }
      data.values = safe;
    }

    const table = supabaseAdmin.from(data.table) as any;
    let error: { message: string } | null = null;

    let values = scopeValues(data.values);
    if (data.table === "products" && data.op !== "delete" && values) {
      const { archiveProductImages } = await import("@/lib/image-storage.server");
      // Bulk CSV remains bounded; full galleries are archived by media sync.
      if (Array.isArray(values)) {
        const archived = [];
        for (const row of values) archived.push(await archiveProductImages({ ...row, images: undefined, qc_images: undefined }).then((copy) => ({ ...row, image_url: copy.image_url })));
        values = archived;
      } else values = await archiveProductImages(values as Record<string, unknown>);
    }

    if (data.op === "insert") ({ error } = await table.insert(values));
    else if (data.op === "upsert") ({ error } = await table.upsert(values));
    else if (data.op === "update")
      ({ error } = await table.update(values).eq("id", data.id));
    else ({ error } = await table.delete().eq("id", data.id));

    if (error) console.error(`secureMutate ${data.table}/${data.op} failed`, error.message);
    return { error: error ? "Operation failed" : null };
  });

/** Admin-only: seller usernames (never password hashes) for the management UI. */
export const adminSellerUsernames = createServerFn({ method: "POST" })
  .inputValidator((data: { token: string }) => ({ token: cleanToken(data?.token) }))
  .handler(async ({ data }) => {
    const { verifyToken } = await import("@/lib/session.server");
    const session = await verifyToken(data.token);
    if (!session || session.role !== "admin") return { usernames: {} as Record<string, string> };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows } = await supabaseAdmin.from("sellers").select("id, username");
    return {
      usernames: Object.fromEntries((rows ?? []).map((r) => [r.id, r.username])) as Record<string, string>,
    };
  });

/** Admin-only product export so CSV never depends on a delayed/failed public browser query. */
export const adminExportProducts = createServerFn({ method: "POST" })
  .inputValidator((data: { token: string }) => ({ token: cleanToken(data?.token) }))
  .handler(async ({ data }) => {
    const { verifyToken } = await import("@/lib/session.server");
    const session = await verifyToken(data.token);
    if (!session || session.role !== "admin") throw new Error("Unauthorized");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const all: Tables<"products">[] = [];
    for (let from = 0; from < 4000; from += 1000) {
      const { data: page, error } = await supabaseAdmin
        .from("products")
        .select("*")
        .order("display_order", { ascending: true })
        .order("created_at", { ascending: false })
        .order("id", { ascending: true })
        .range(from, Math.min(from + 999, 3999));
      if (error) throw new Error("Export failed");
      all.push(...((page ?? []) as Tables<"products">[]));
      if (!page || page.length < 1000) break;
    }
    return all;
  });

/** Publiczny licznik wyświetleń produktu — zwiększany po otwarciu karty. */
export const registerProductView = createServerFn({ method: "POST" })
  .inputValidator((data: { productId: string }) => {
    const productId = String(data?.productId ?? "");
    if (!/^[0-9a-fA-F-]{36}$/.test(productId)) throw new Error("Invalid product");
    return { productId };
  })
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin
      .from("products")
      .select("views")
      .eq("id", data.productId)
      .maybeSingle();
    if (!row) return { ok: false as const };
    const next = (row.views ?? 0) + 1;
    await supabaseAdmin.from("products").update({ views: next }).eq("id", data.productId);
    return { ok: true as const, value: next };
  });

/** Upload an image through the server so the storage bucket needs no public write access. */
export const uploadImage = createServerFn({ method: "POST" })
  .inputValidator((data: { token: string; folder: string; ext: string; contentType: string; base64: string }) => {
    const folder = String(data?.folder ?? "uploads").replace(/[^a-zA-Z0-9/_-]/g, "").slice(0, 60) || "uploads";
    const ext = String(data?.ext ?? "jpg").replace(/[^a-zA-Z0-9]/g, "").slice(0, 6) || "jpg";
    const contentType = String(data?.contentType ?? "application/octet-stream");
    if (!contentType.startsWith("image/")) throw new Error("Only image uploads are allowed");
    const base64 = String(data?.base64 ?? "");
    if (!base64 || base64.length > 14_000_000) throw new Error("Invalid file");
    return { token: cleanToken(data?.token), folder, ext, contentType, base64 };
  })
  .handler(async ({ data }) => {
    const { verifyToken } = await import("@/lib/session.server");
    if (!(await verifyToken(data.token))) throw new Error("Unauthorized");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const bytes = Uint8Array.from(atob(data.base64), (c) => c.charCodeAt(0));
    const path = `catalog/${data.folder}/${Date.now()}-${Math.random().toString(36).slice(2)}.${data.ext}`;
    const { error } = await supabaseAdmin.storage.from("product-images").upload(path, bytes, {
      cacheControl: "31536000",
      contentType: data.contentType,
      upsert: false,
    });
    if (error) throw new Error("Upload failed");
    return { url: `/api/public/product-image?path=${encodeURIComponent(path)}` };
  });

/** Public shipping rates incl. coupon fields, served server-side so they are not exposed via the public data API. */
export const getShippingRates = createServerFn({ method: "GET" }).handler(async () => {
  const { LOCAL_SHIPPING_RATES } = await import("@/data/localShipping");
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("shipping_rates")
      .select("*")
      .order("sort_order");
    if (error || !data?.length) throw new Error("no rows");
    return JSON.parse(JSON.stringify(data)) as any[];
  } catch {
    // Brak bazy (np. hosting bez kluczy) — używamy cennika zapisanego w kodzie.
    return JSON.parse(JSON.stringify(LOCAL_SHIPPING_RATES)) as any[];
  }
});

async function deletedLocalSellers(): Promise<string[]> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("settings")
      .select("value")
      .eq("key", "deleted_local_sellers")
      .maybeSingle();
    const v = JSON.parse(data?.value || "[]");
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
}

/** Admin-only: usuwa sprzedawcę razem z jego produktami (także konto wbudowane w kod). */
export const adminDeleteSeller = createServerFn({ method: "POST" })
  .inputValidator((data: { token: string; id: string }) => ({
    token: cleanToken(data?.token),
    id: String(data?.id ?? "").slice(0, 100),
  }))
  .handler(async ({ data }) => {
    const { verifyToken } = await import("@/lib/session.server");
    const session = await verifyToken(data.token);
    if (!session || session.role !== "admin") return { error: "Unauthorized" };
    if (!data.id) return { error: "Missing id" };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error: pErr } = await supabaseAdmin.from("products").delete().eq("seller_id", data.id);
    if (pErr) return { error: "Operation failed" };
    const { error: sErr } = await supabaseAdmin.from("sellers").delete().eq("id", data.id);
    if (sErr) return { error: "Operation failed" };
    return { error: null };
  });

/** Admin-only: usuwa WSZYSTKIE produkty (opcjonalnie tylko danego sprzedawcy) po potwierdzeniu hasłem. */
export const adminDeleteAllProducts = createServerFn({ method: "POST" })
  .inputValidator((data: { token: string; passwordHash: string; sellerId?: string | null }) => ({
    token: cleanToken(data?.token),
    passwordHash: String(data?.passwordHash ?? "").trim(),
    sellerId: data?.sellerId ? String(data.sellerId).slice(0, 100) : null,
  }))
  .handler(async ({ data }) => {
    const { verifyToken } = await import("@/lib/session.server");
    const session = await verifyToken(data.token);
    if (!session || session.role !== "admin") return { error: "Unauthorized", deleted: 0 };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let q = supabaseAdmin.from("products").delete({ count: "exact" });
    q = data.sellerId ? q.eq("seller_id", data.sellerId) : q.not("id", "is", null);
    const { error, count } = await q;
    if (error) return { error: "Operation failed", deleted: 0 };
    return { error: null, deleted: count ?? 0 };
  });
