-- 1) Products -> products (typy zgodne z aplikacją)
ALTER TABLE "Products" RENAME TO products;

ALTER TABLE products
  ALTER COLUMN id TYPE uuid USING id::uuid,
  ALTER COLUMN price TYPE numeric USING price::numeric,
  ALTER COLUMN price_cny TYPE numeric USING price_cny::numeric,
  ALTER COLUMN views TYPE integer USING views::integer,
  ALTER COLUMN display_order TYPE integer USING display_order::integer,
  ALTER COLUMN seller_id TYPE uuid USING NULLIF(seller_id, '')::uuid,
  ALTER COLUMN images TYPE text[] USING array_remove(string_to_array(regexp_replace(COALESCE(images, ''), '\s*,\s*', ',', 'g'), ','), ''),
  ALTER COLUMN sizes TYPE text[] USING array_remove(string_to_array(regexp_replace(COALESCE(sizes, ''), '\s*,\s*', ',', 'g'), ','), '');

ALTER TABLE products ALTER COLUMN id SET NOT NULL;
ALTER TABLE products ALTER COLUMN title SET NOT NULL;
ALTER TABLE products ALTER COLUMN category SET DEFAULT '';
ALTER TABLE products ALTER COLUMN category SET NOT NULL;
ALTER TABLE products ALTER COLUMN price SET DEFAULT 0;
ALTER TABLE products ALTER COLUMN price SET NOT NULL;
ALTER TABLE products ALTER COLUMN price_cny SET DEFAULT 0;
ALTER TABLE products ALTER COLUMN price_cny SET NOT NULL;
ALTER TABLE products ALTER COLUMN quality SET DEFAULT 'Best';
ALTER TABLE products ALTER COLUMN quality SET NOT NULL;
ALTER TABLE products ALTER COLUMN views SET DEFAULT 0;
ALTER TABLE products ALTER COLUMN views SET NOT NULL;
ALTER TABLE products ALTER COLUMN agent_links SET DEFAULT '{}'::jsonb;
ALTER TABLE products ALTER COLUMN agent_links SET NOT NULL;
ALTER TABLE products ALTER COLUMN sizes SET DEFAULT '{}'::text[];
ALTER TABLE products ALTER COLUMN sizes SET NOT NULL;
ALTER TABLE products ALTER COLUMN images SET DEFAULT '{}'::text[];
ALTER TABLE products ALTER COLUMN images SET NOT NULL;
ALTER TABLE products ALTER COLUMN batch SET DEFAULT '';
UPDATE products SET batch = '' WHERE batch IS NULL;
ALTER TABLE products ALTER COLUMN batch SET NOT NULL;
ALTER TABLE products ALTER COLUMN display_order SET DEFAULT 0;
ALTER TABLE products ALTER COLUMN display_order SET NOT NULL;
ALTER TABLE products ALTER COLUMN store_url SET DEFAULT '';
UPDATE products SET store_url = '' WHERE store_url IS NULL;
ALTER TABLE products ALTER COLUMN store_url SET NOT NULL;
ALTER TABLE products ALTER COLUMN store_name SET DEFAULT '';
UPDATE products SET store_name = '' WHERE store_name IS NULL;
ALTER TABLE products ALTER COLUMN store_name SET NOT NULL;

ALTER TABLE products ADD COLUMN IF NOT EXISTS likes int NOT NULL DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS dislikes int NOT NULL DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS qc_images text[] NOT NULL DEFAULT '{}';
ALTER TABLE products ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'products'::regclass AND contype = 'p') THEN
    ALTER TABLE products ADD PRIMARY KEY (id);
  END IF;
END $$;

-- 2) Role użytkowników (osobna tabela)
CREATE TABLE IF NOT EXISTS public.user_roles (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE, role text NOT NULL CHECK (role IN ('admin','seller')), seller_id uuid, UNIQUE(user_id,role));
GRANT SELECT ON public.user_roles TO authenticated; GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Read own roles" ON public.user_roles; CREATE POLICY "Read own roles" ON public.user_roles FOR SELECT TO authenticated USING (user_id=auth.uid());
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=_user_id AND role=_role) $$;

-- 3) Kategorie i agenci
CREATE TABLE IF NOT EXISTS public.categories (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, slug text NOT NULL UNIQUE, sort_order int NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT ON public.categories TO anon,authenticated; GRANT INSERT,UPDATE,DELETE ON public.categories TO authenticated; GRANT ALL ON public.categories TO service_role;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public categories" ON public.categories; CREATE POLICY "Public categories" ON public.categories FOR SELECT USING(true); DROP POLICY IF EXISTS "Admin categories" ON public.categories; CREATE POLICY "Admin categories" ON public.categories FOR ALL TO authenticated USING(public.has_role(auth.uid(),'admin')) WITH CHECK(public.has_role(auth.uid(),'admin'));

CREATE TABLE IF NOT EXISTS public.agents (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, avatar_url text, referral_url text NOT NULL DEFAULT '', sort_order int NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT ON public.agents TO anon,authenticated; GRANT INSERT,UPDATE,DELETE ON public.agents TO authenticated; GRANT ALL ON public.agents TO service_role;
ALTER TABLE public.agents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public agents" ON public.agents; CREATE POLICY "Public agents" ON public.agents FOR SELECT USING(true); DROP POLICY IF EXISTS "Admin agents" ON public.agents; CREATE POLICY "Admin agents" ON public.agents FOR ALL TO authenticated USING(public.has_role(auth.uid(),'admin')) WITH CHECK(public.has_role(auth.uid(),'admin'));

-- 4) Sklepy (przed kluczem produktów)
CREATE TABLE IF NOT EXISTS public.sellers (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, name text NOT NULL, slug text NOT NULL UNIQUE, username text NOT NULL DEFAULT '', password_hash text NOT NULL DEFAULT '', logo_url text, banner_url text, description text NOT NULL DEFAULT '', active boolean NOT NULL DEFAULT true, external_url text NOT NULL DEFAULT '', link_mode text NOT NULL DEFAULT 'agents', created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT(id,name,slug,logo_url,banner_url,description,active,external_url,link_mode,created_at) ON public.sellers TO anon,authenticated; GRANT ALL ON public.sellers TO service_role;
ALTER TABLE public.sellers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public seller profiles" ON public.sellers; CREATE POLICY "Public seller profiles" ON public.sellers FOR SELECT USING(active OR user_id=auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE OR REPLACE VIEW public.sellers_public WITH (security_invoker=true) AS SELECT id,name,slug,logo_url,banner_url,description,active,external_url,link_mode,created_at FROM public.sellers;
GRANT SELECT ON public.sellers_public TO anon,authenticated;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'products_seller_fk' AND conrelid = 'public.products'::regclass) THEN
    ALTER TABLE public.products ADD CONSTRAINT products_seller_fk FOREIGN KEY (seller_id) REFERENCES public.sellers(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 5) Poradnik, ustawienia, promocje, social, wysyłka, blokady AI
CREATE TABLE IF NOT EXISTS public.guide_steps (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), step_number int NOT NULL DEFAULT 1, title text NOT NULL, description text NOT NULL DEFAULT '', image_url text, created_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT ON public.guide_steps TO anon,authenticated; GRANT INSERT,UPDATE,DELETE ON public.guide_steps TO authenticated; GRANT ALL ON public.guide_steps TO service_role;
ALTER TABLE public.guide_steps ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public guides" ON public.guide_steps; CREATE POLICY "Public guides" ON public.guide_steps FOR SELECT USING(true); DROP POLICY IF EXISTS "Admin guides" ON public.guide_steps; CREATE POLICY "Admin guides" ON public.guide_steps FOR ALL TO authenticated USING(public.has_role(auth.uid(),'admin')) WITH CHECK(public.has_role(auth.uid(),'admin'));

CREATE TABLE IF NOT EXISTS public.settings (key text PRIMARY KEY, value text NOT NULL DEFAULT '');
GRANT SELECT ON public.settings TO anon,authenticated; GRANT INSERT,UPDATE,DELETE ON public.settings TO authenticated; GRANT ALL ON public.settings TO service_role;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public safe settings" ON public.settings; CREATE POLICY "Public safe settings" ON public.settings FOR SELECT USING(key NOT IN ('admin_username','admin_password_hash') AND key NOT LIKE '%secret%' AND key NOT LIKE '%token%'); DROP POLICY IF EXISTS "Admin settings" ON public.settings; CREATE POLICY "Admin settings" ON public.settings FOR ALL TO authenticated USING(public.has_role(auth.uid(),'admin')) WITH CHECK(public.has_role(auth.uid(),'admin'));

CREATE TABLE IF NOT EXISTS public.promos (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), title text NOT NULL, description text NOT NULL DEFAULT '', image_url text, link_url text NOT NULL DEFAULT '', sort_order int NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT ON public.promos TO anon,authenticated; GRANT INSERT,UPDATE,DELETE ON public.promos TO authenticated; GRANT ALL ON public.promos TO service_role;
ALTER TABLE public.promos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public promos" ON public.promos; CREATE POLICY "Public promos" ON public.promos FOR SELECT USING(true); DROP POLICY IF EXISTS "Admin promos" ON public.promos; CREATE POLICY "Admin promos" ON public.promos FOR ALL TO authenticated USING(public.has_role(auth.uid(),'admin')) WITH CHECK(public.has_role(auth.uid(),'admin'));

CREATE TABLE IF NOT EXISTS public.social_links (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), label text NOT NULL, url text NOT NULL DEFAULT '', icon text NOT NULL DEFAULT '', image_url text, sort_order int NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT ON public.social_links TO anon,authenticated; GRANT INSERT,UPDATE,DELETE ON public.social_links TO authenticated; GRANT ALL ON public.social_links TO service_role;
ALTER TABLE public.social_links ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public social" ON public.social_links; CREATE POLICY "Public social" ON public.social_links FOR SELECT USING(true); DROP POLICY IF EXISTS "Admin social" ON public.social_links; CREATE POLICY "Admin social" ON public.social_links FOR ALL TO authenticated USING(public.has_role(auth.uid(),'admin')) WITH CHECK(public.has_role(auth.uid(),'admin'));

CREATE TABLE IF NOT EXISTS public.shipping_rates (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), agent_name text NOT NULL, line_name text NOT NULL DEFAULT 'Standard', base_price numeric NOT NULL DEFAULT 0, price_per_kg numeric NOT NULL DEFAULT 0, min_weight numeric NOT NULL DEFAULT 0, max_weight numeric NOT NULL DEFAULT 30, sort_order int NOT NULL DEFAULT 0, price_table jsonb NOT NULL DEFAULT '{}', discount_percent numeric NOT NULL DEFAULT 0, coupon_code text NOT NULL DEFAULT '', signup_url text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT ON public.shipping_rates TO anon,authenticated; GRANT INSERT,UPDATE,DELETE ON public.shipping_rates TO authenticated; GRANT ALL ON public.shipping_rates TO service_role;
ALTER TABLE public.shipping_rates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public shipping" ON public.shipping_rates; CREATE POLICY "Public shipping" ON public.shipping_rates FOR SELECT USING(true); DROP POLICY IF EXISTS "Admin shipping" ON public.shipping_rates; CREATE POLICY "Admin shipping" ON public.shipping_rates FOR ALL TO authenticated USING(public.has_role(auth.uid(),'admin')) WITH CHECK(public.has_role(auth.uid(),'admin'));

CREATE TABLE IF NOT EXISTS public.ai_access_blocks (feature text PRIMARY KEY, message text NOT NULL, status int NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
GRANT ALL ON public.ai_access_blocks TO service_role; ALTER TABLE public.ai_access_blocks ENABLE ROW LEVEL SECURITY;

-- 6) Indeksy i porządkowanie linków agentów
CREATE INDEX IF NOT EXISTS products_browse ON public.products(display_order,created_at DESC,id);
CREATE INDEX IF NOT EXISTS products_seller ON public.products(seller_id);

UPDATE public.products SET agent_links = COALESCE((SELECT jsonb_object_agg(
  CASE lower(k) WHEN 'lovegobuy' THEN 'LoveGoBuy' WHEN 'kakobuy' THEN 'Kakobuy' WHEN 'usfans' THEN 'USFans' ELSE k END, v)
  FROM jsonb_each_text(agent_links) AS t(k,v)), '{}'::jsonb);

-- 7) Dane startowe: agenci, kategorie, sklep, social, ustawienia, cenniki
INSERT INTO public.agents (name, referral_url, sort_order) VALUES
  ('LoveGoBuy','https://www.lovegobuy.com/?invite_code=7KN8NW',0),
  ('Kakobuy','https://ikako.vip/r/six7n',1),
  ('USFans','https://www.usfans.com/?ref=5FTXZW',2);

INSERT INTO public.categories (name, slug, sort_order)
SELECT category, lower(regexp_replace(category, '[^a-zA-Z0-9]+', '-', 'g')), row_number() OVER (ORDER BY category)
FROM (SELECT DISTINCT category FROM public.products WHERE category <> '') c
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.sellers (name, slug, username, active)
SELECT 'It-can-be-your','add-me-on-discord-swallow-it','', true
WHERE NOT EXISTS (SELECT 1 FROM public.sellers WHERE slug='add-me-on-discord-swallow-it');

INSERT INTO public.social_links (label, url, icon, sort_order)
SELECT * FROM (VALUES
  ('LoveGoBuy','https://www.lovegobuy.com/?invite_code=7KN8NW','🛒',0),
  ('TikTok','https://www.tiktok.com/@pkmr3ps','🎵',1)
) v(label,url,icon,sort_order)
WHERE NOT EXISTS (SELECT 1 FROM public.social_links WHERE label IN ('LoveGoBuy','TikTok'));

INSERT INTO public.settings(key,value) VALUES
  ('sponsor_label','PKMREPS x LOVEGOBUY'),
  ('sponsor_url','https://www.lovegobuy.com/?invite_code=7KN8NW'),
  ('brand_label','PKMREPS x LOVEGOBUY'),
  ('primary_agent_url','https://www.lovegobuy.com/?invite_code=7KN8NW'),
  ('promo_code','PKMR'),
  ('home_agent_name','LoveGoBuy'),
  ('agent_top1',(SELECT id::text FROM public.agents WHERE name='LoveGoBuy' LIMIT 1)),
  ('agent_top2',(SELECT id::text FROM public.agents WHERE name='Kakobuy' LIMIT 1)),
  ('agent_top3',(SELECT id::text FROM public.agents WHERE name='USFans' LIMIT 1)),
  ('deleted_local_sellers','["11111111-1111-4111-8111-111111111111"]')
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.shipping_rates (id, agent_name, line_name, base_price, price_per_kg, min_weight, max_weight, sort_order, price_table, discount_percent, coupon_code, signup_url) VALUES
('55fe01e0-3313-49a8-8784-8aab71a7370c','LoveGoBuy','Standard',0,0,0.5,25,0,'{"1":91.49,"2":153.59,"3":215.69,"4":277.79,"5":339.9,"6":402,"7":464.1,"8":526.2,"9":586.92,"10":645.29,"11":703.67,"12":762.04,"13":820.42,"14":878.79,"15":937.17,"16":995.54,"17":1053.92,"18":1112.3,"19":1170.67,"20":1229.05,"21":1313.5,"22":1373.12,"23":1432.74,"24":1492.36,"25":1551.97,"0.5":60.3,"1.5":122.54,"2.5":184.64,"3.5":246.74,"4.5":308.85,"5.5":370.95,"6.5":433.05,"7.5":495.15,"8.5":557.25,"9.5":616.1,"10.5":674.48,"11.5":732.85,"12.5":791.23,"13.5":849.61,"14.5":907.98,"15.5":966.36,"16.5":1024.73,"17.5":1083.11,"18.5":1141.48,"19.5":1199.86,"20.5":1283.7,"21.5":1343.31,"22.5":1402.93,"23.5":1462.55,"24.5":1522.16}'::jsonb,40,'PKMR','https://www.lovegobuy.com/?invite_code=7KN8NW'),
('f98157c2-b69f-499e-a4d0-181701c9a849','USFans','Standard',0,0,0.5,25,0,'{"1":106.81,"2":182.02,"3":257.14,"4":332.25,"5":407.37,"6":482.49,"7":553.75,"8":625.02,"9":696.28,"10":767.55,"11":785.85,"12":981.34,"13":1052.61,"14":1071.87,"15":1123.87,"16":1195.14,"17":1266.4,"18":1337.67,"19":1408.93,"20":1480.2,"21":1551.46,"22":1622.73,"23":1693.99,"24":1765.26,"25":1836.52,"0.5":69.34,"1.5":144.46,"2.5":219.58,"3.5":294.7,"4.5":369.81,"5.5":444.93,"6.5":518.12,"7.5":589.39,"8.5":660.65,"9.5":731.92,"10.5":803.18,"11.5":874.45,"12.5":945.71,"13.5":1063.05,"14.5":1088.24,"15.5":1159.51,"16.5":1230.77,"17.5":1302.04,"18.5":1373.3,"19.5":1444.56,"20.5":1515.83,"21.5":1587.09,"22.5":1658.36,"23.5":1729.62,"24.5":1800.89}'::jsonb,40,'5FTXZW','https://www.usfans.com/register?ref=5FTXZW'),
('2fad93fe-869c-46d5-a131-472f1d334d05','Kakobuy','Standard',0,0,0.5,25,0,'{"1":107.23,"2":165.69,"3":219.99,"4":272.42,"5":324.84,"6":377.27,"7":429.69,"8":482.12,"9":534.54,"10":586.97,"11":639.39,"12":691.81,"13":744.24,"14":796.66,"15":849.09,"16":901.51,"17":953.94,"18":1006.36,"19":1058.79,"20":1111.21,"21":1163.64,"22":1216.06,"23":1268.49,"24":1320.91,"25":1373.34,"0.5":77.13,"1.5":137.33,"2.5":193.78,"3.5":246.2,"4.5":298.63,"5.5":351.05,"6.5":403.48,"7.5":455.9,"8.5":508.33,"9.5":560.75,"10.5":613.18,"11.5":665.6,"12.5":718.03,"13.5":770.45,"14.5":822.88,"15.5":875.3,"16.5":927.73,"17.5":980.15,"18.5":1032.58,"19.5":1085,"20.5":1137.43,"21.5":1189.85,"22.5":1242.28,"23.5":1294.7,"24.5":1347.13}'::jsonb,20,'six7n','https://ikako.vip/r/six7n')
ON CONFLICT (id) DO NOTHING;

-- 8) Zasady magazynu zdjęć (bucket product-images)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Own photo uploads') THEN
    CREATE POLICY "Own photo uploads" ON storage.objects FOR INSERT TO authenticated WITH CHECK(bucket_id='product-images' AND (storage.foldername(name))[1]=auth.uid()::text);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Own photo read') THEN
    CREATE POLICY "Own photo read" ON storage.objects FOR SELECT TO authenticated USING(bucket_id='product-images' AND ((storage.foldername(name))[1]=auth.uid()::text OR public.has_role(auth.uid(),'admin')));
  END IF;
END $$;