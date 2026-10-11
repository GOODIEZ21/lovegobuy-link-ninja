import { createFileRoute } from "@tanstack/react-router";

const SAFE_PATH = /^[a-zA-Z0-9/_-]+\.[a-zA-Z0-9]{1,8}$/;

export const Route = createFileRoute("/api/public/product-image")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const path = new URL(request.url).searchParams.get("path") ?? "";
        if (!SAFE_PATH.test(path) || path.includes("..") || !/^(archive|catalog)\//.test(path)) {
          return new Response("Invalid image path", { status: 400 });
        }

        let data: Blob | null = null;
        if ((process.env['SUPABASE_SERVICE_ROLE_KEY'] || process.env['DB_SERVICE_ROLE_KEY'])) {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const res = await supabaseAdmin.storage.from("product-images").download(path);
          data = res.error ? null : res.data;
        } else if (process.env['SUPABASE_URL']) {
          // Brak klucza serwera — próbujemy publicznego adresu zdjęcia zamiast zwracać błąd.
          const r = await fetch(
            `${process.env['SUPABASE_URL']}/storage/v1/object/public/product-images/${path}`,
          ).catch(() => null);
          data = r?.ok ? await r.blob() : null;
        }
        if (!data) return new Response("Image not found", { status: 404 });

        return new Response(data, {
          headers: {
            "Content-Type": data.type || "application/octet-stream",
            "Cache-Control": "public, max-age=31536000, immutable",
          },
        });
      },
    },
  },
});