-- =============================================================================
--  SALON DE BEAUTÉ "AINLAH" — COMPLETE SUPABASE SCHEMA
-- =============================================================================
--  Project : https://klwovduevlwvoccxhbpm.supabase.co
--
--  HOW TO USE
--  ----------
--  1. Supabase dashboard → SQL Editor → New query → paste this ENTIRE file → Run.
--     It is idempotent (IF NOT EXISTS / ON CONFLICT / CREATE OR REPLACE) and can
--     be re-run safely after updates.
--  2. Open the app → Login → "Créer le compte administrateur". The first account
--     becomes the salon admin, then that button disappears for good.
--  3. The admin creates workers from "Employés". Each worker gets a real
--     Supabase Auth account (auth.users) + profile and only sees / can use the
--     interfaces and actions granted in its permissions (enforced by RLS too).
--
--  CONTENTS
--    1-9  Business tables & relations (config, clients/fidelity, catalog,
--         reservations, workers & payments, suppliers, products, point of
--         sale, caisse) + migrations for existing databases
--    10   Indexes
--    11   Authentication: auto-confirm, profile trigger
--    12   Permission helpers (mirror of src/lib/permissions.ts)
--    13   Row Level Security per interface & action
--    14   Storage buckets for images (logos, avatars, products)
--    15   Login-page (anonymous) access
--
--  RELATIONS
--    auth.users 1─1 profiles ─* employee_payments / reservation_workers /
--      worker_daily_payment_periods / worker_reservation_payments / caisse
--    worker_roles 1─* profiles
--    clients 1─* reservations, product_sales
--    prestations 1─* reservations ; reservations 1─* reservation_products,
--      reservation_workers
--    suppliers 1─* purchases, product_purchases ; product_purchases 1─*
--      product_purchase_items, purchase_payments
--    product_categories / product_brands 1─* products ; products 1─*
--      product_purchase_items, sale_items
--    product_sales 1─* sale_items, sale_payments
-- =============================================================================

create extension if not exists "pgcrypto";      -- gen_random_uuid()

-- =============================================================================
--  1. IDENTITY & CONFIGURATION
-- =============================================================================

-- Custom job roles that an admin can create (Coiffeuse, Esthéticienne, …)
create table if not exists public.worker_roles (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  created_at  timestamptz not null default now()
);

-- User profiles.  profiles.id === auth.users.id (1-to-1).
create table if not exists public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  username      text,
  email         text,
  full_name     text,
  role          text not null default 'worker',      -- 'admin' | 'worker' | 'super_admin'
  role_id       uuid references public.worker_roles(id) on delete set null,
  job_title     text,                                -- readable custom role label
  avatar_url    text,
  phone         text,
  address       text,
  birthday      date,
  id_card_number text,
  hire_date     date,                                -- start of working
  -- Payment configuration ----------------------------------------------------
  is_paid_enabled boolean not null default true,     -- does this worker get paid?
  payment_type  text default 'month',                -- 'days' | 'month' | 'percentage'
  percentage    numeric default 0,
  daily_rate    numeric default 0,
  monthly_rate  numeric default 0,
  -- Account & permissions ----------------------------------------------------
  has_account   boolean not null default true,       -- can log in?
  active        boolean not null default true,
  permissions   jsonb not null default '{}'::jsonb,  -- { "reservations": ["view","create","delete"], ... }
  created_at    timestamptz not null default now()
);

-- Single-row store configuration (id is always 1).
create table if not exists public.store_config (
  id          bigint primary key,
  name        text default 'Salon de Beauté',
  slogan      text default '',
  phone       text default '',
  location    text default '',
  facebook    text default '',
  instagram   text default '',
  tiktok      text default '',
  logo_url    text,
  created_at  timestamptz not null default now()
);
insert into public.store_config (id, name, slogan)
values (1, 'Salon de Beauté Ainlah', 'Votre beauté est notre priorité')
on conflict (id) do nothing;

-- Single-row fidelity / loyalty configuration (id is always 1).
create table if not exists public.fidelity_config (
  id                    bigint primary key,
  enabled               boolean not null default true,
  reservations_required int not null default 10,     -- N reservations → 1 reward
  reduction_type        text not null default 'percentage', -- 'percentage' | 'fixed'
  reduction_value       numeric not null default 50,  -- 50% or 50 DA
  created_at            timestamptz not null default now()
);
insert into public.fidelity_config (id) values (1) on conflict (id) do nothing;

-- =============================================================================
--  2. CLIENTS & FIDELITY
-- =============================================================================

create table if not exists public.clients (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,
  phone             text,
  notes             text,
  rewards_redeemed  int not null default 0,   -- how many fidelity rewards used
  created_at        timestamptz not null default now()
);

-- =============================================================================
--  3. CATALOG : PRESTATIONS & SERVICES
-- =============================================================================

create table if not exists public.prestations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text,
  price       numeric not null default 0,
  created_at  timestamptz not null default now()
);

create table if not exists public.services (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text,
  price       numeric not null default 0,
  created_at  timestamptz not null default now()
);

-- =============================================================================
--  4. RESERVATIONS
-- =============================================================================

create table if not exists public.reservations (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid references public.clients(id) on delete set null,
  client_name   text,
  client_phone  text,
  prestation_id uuid references public.prestations(id) on delete set null, -- primary
  prestation_ids jsonb not null default '[]'::jsonb,  -- all prestations booked
  service_ids   jsonb not null default '[]'::jsonb,   -- array of service ids
  date          date not null,
  time          text,
  total_price   numeric not null default 0,
  paid_amount   numeric not null default 0,
  discount_amount numeric not null default 0,         -- fidelity reduction applied
  fidelity_applied boolean not null default false,
  status        text not null default 'pending',      -- pending|finalized|cancelled|completed
  worker_id     uuid references public.profiles(id) on delete set null,
  created_by    uuid,
  finalized_by  uuid,
  finalized_at  timestamptz,
  is_walk_in    boolean not null default false,       -- "Sur place"
  created_at    timestamptz not null default now()
);

-- Products consumed during a reservation.
create table if not exists public.reservation_products (
  id             uuid primary key default gen_random_uuid(),
  reservation_id uuid references public.reservations(id) on delete cascade,
  product_id     uuid,
  quantity       numeric not null default 0,
  price          numeric not null default 0,
  is_detail      boolean not null default false,
  detail_qty_used numeric,
  detail_unit    text,
  created_at     timestamptz not null default now()
);

-- Workers that participated in a reservation (percentage / journalier earnings).
create table if not exists public.reservation_workers (
  id             uuid primary key default gen_random_uuid(),
  reservation_id uuid references public.reservations(id) on delete cascade,
  worker_id      uuid references public.profiles(id) on delete cascade,
  amount         numeric not null default 0,
  percentage     numeric default 0,
  payment_type   text,                                 -- 'percentage' | 'days'
  status         text not null default 'unpaid',       -- 'paid' | 'unpaid'
  created_at     timestamptz not null default now()
);

-- =============================================================================
--  5. WORKERS : PAYMENTS, ACOMPTES, ABSENCES, PERIODS
-- =============================================================================

-- Salary payments, acomptes (advances) and absences all live here.
create table if not exists public.employee_payments (
  id                  uuid primary key default gen_random_uuid(),
  employee_id         uuid references public.profiles(id) on delete cascade,
  amount              numeric not null default 0,
  type                text not null,          -- 'salary' | 'acompte' | 'absence'
  description         text,
  date                date not null,
  status              text default 'paid',    -- 'paid' | 'unpaid'
  paid                boolean default true,
  reservation_details text,                   -- JSON detail for journalier payments
  created_at          timestamptz not null default now()
);

-- Snapshot of already-paid "journalier" periods (to avoid double payment).
create table if not exists public.worker_daily_payment_periods (
  id          uuid primary key default gen_random_uuid(),
  worker_id   uuid references public.profiles(id) on delete cascade,
  start_date  date,
  end_date    date,
  total_days  int default 0,
  amount      numeric default 0,
  status      text default 'paid',
  created_at  timestamptz not null default now()
);

-- Historical per-reservation worker payouts (used by delete/cleanup flows).
create table if not exists public.worker_reservation_payments (
  id             uuid primary key default gen_random_uuid(),
  worker_id      uuid references public.profiles(id) on delete cascade,
  reservation_id uuid,
  amount         numeric not null default 0,
  date           date,
  created_at     timestamptz not null default now()
);

-- =============================================================================
--  6. SUPPLIERS, PURCHASES, EXPENSES
-- =============================================================================

create table if not exists public.suppliers (
  id          uuid primary key default gen_random_uuid(),
  full_name   text not null,
  phone       text,
  address     text,
  created_at  timestamptz not null default now()
);

create table if not exists public.purchases (
  id          uuid primary key default gen_random_uuid(),
  supplier_id uuid references public.suppliers(id) on delete set null,
  description text,
  cost        numeric not null default 0,
  paid_amount numeric not null default 0,
  date        date not null,
  created_at  timestamptz not null default now()
);

create table if not exists public.expenses (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text,
  cost        numeric not null default 0,
  date        date not null,
  created_at  timestamptz not null default now()
);

-- =============================================================================
--  7. PRODUCTS / INVENTORY
-- =============================================================================

create table if not exists public.product_categories (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  created_at  timestamptz not null default now()
);

create table if not exists public.product_brands (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  created_at  timestamptz not null default now()
);

create table if not exists public.products (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  description    text,
  barcode        text,
  category_id    uuid references public.product_categories(id) on delete set null,
  brand_id       uuid references public.product_brands(id) on delete set null,
  sell_by_detail boolean not null default false,
  detail_unit_qty numeric,
  detail_unit    text,
  min_stock      numeric default 0,
  price_sell     numeric default 0,
  price_last_buy numeric default 0,
  created_at     timestamptz not null default now()
);

create table if not exists public.product_purchases (
  id          uuid primary key default gen_random_uuid(),
  supplier_id uuid references public.suppliers(id) on delete set null,
  date        date not null,
  total_cost  numeric not null default 0,
  paid_amount numeric not null default 0,
  status      text not null default 'debt',   -- 'paid' | 'debt'
  created_at  timestamptz not null default now()
);

create table if not exists public.product_purchase_items (
  id              uuid primary key default gen_random_uuid(),
  purchase_id     uuid references public.product_purchases(id) on delete cascade,
  product_id      uuid references public.products(id) on delete set null,
  quantity_bought numeric not null default 0,
  price_buy       numeric not null default 0,
  price_sell      numeric not null default 0,
  min_stock       numeric,
  sell_by_detail  boolean default false,
  detail_unit_qty numeric,
  created_at      timestamptz not null default now()
);

create table if not exists public.purchase_payments (
  id          uuid primary key default gen_random_uuid(),
  purchase_id uuid references public.product_purchases(id) on delete cascade,
  amount      numeric not null default 0,
  date        date not null,
  note        text,
  created_at  timestamptz not null default now()
);

-- =============================================================================
--  8. POINT OF SALE (product sales)
-- =============================================================================

create table if not exists public.product_sales (
  id             uuid primary key default gen_random_uuid(),
  client_id      uuid references public.clients(id) on delete set null,
  client_name    text,
  client_phone   text,
  date           date not null,
  total_amount   numeric not null default 0,
  paid_amount    numeric not null default 0,
  status         text not null default 'paid',   -- 'paid' | 'debt'
  invoice_number text,
  created_at     timestamptz not null default now()
);

create table if not exists public.sale_items (
  id             uuid primary key default gen_random_uuid(),
  sale_id        uuid references public.product_sales(id) on delete cascade,
  product_id     uuid references public.products(id) on delete set null,
  quantity       numeric not null default 0,
  unit_price     numeric not null default 0,
  is_detail      boolean not null default false,
  detail_qty_used numeric,
  detail_unit    text,
  created_at     timestamptz not null default now()
);

create table if not exists public.sale_payments (
  id          uuid primary key default gen_random_uuid(),
  sale_id     uuid references public.product_sales(id) on delete cascade,
  amount      numeric not null default 0,
  date        date not null,
  note        text,
  created_at  timestamptz not null default now()
);

-- =============================================================================
--  9. CAISSE (cash register)
-- =============================================================================
-- Manual deposits / withdrawals.  The Caisse page combines these rows with all
-- payments coming from reservations, sales and purchases to show the balance.
create table if not exists public.caisse_transactions (
  id          uuid primary key default gen_random_uuid(),
  type        text not null,                -- 'deposit' | 'withdraw'
  amount      numeric not null default 0,
  date        date not null default current_date,
  description text,
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);

-- =============================================================================
--  9b. MIGRATIONS FOR EXISTING DATABASES
-- -----------------------------------------------------------------------------
--  `create table if not exists` above is a no-op once a table exists, so any
--  column added after the first deployment has to be applied explicitly here.
--  Every statement is idempotent — re-running this file is always safe.
-- =============================================================================
alter table public.reservations
  add column if not exists prestation_ids   jsonb   not null default '[]'::jsonb,
  add column if not exists discount_amount  numeric not null default 0,
  add column if not exists fidelity_applied boolean not null default false,
  add column if not exists is_walk_in       boolean not null default false;

-- Back-fill prestation_ids for rows created before multi-prestation support.
update public.reservations
   set prestation_ids = jsonb_build_array(prestation_id)
 where prestation_id is not null
   and (prestation_ids is null or prestation_ids = '[]'::jsonb);

-- =============================================================================
--  10. INDEXES
-- =============================================================================
create index if not exists idx_reservations_date        on public.reservations(date);
create index if not exists idx_reservations_status       on public.reservations(status);
create index if not exists idx_reservations_worker       on public.reservations(worker_id);
create index if not exists idx_reservations_client       on public.reservations(client_id);
create index if not exists idx_res_workers_worker        on public.reservation_workers(worker_id);
create index if not exists idx_res_workers_res           on public.reservation_workers(reservation_id);
-- One row per (reservation, worker): required so the app can UPSERT a worker's
-- earnings on finalization with ON CONFLICT (reservation_id, worker_id).
create unique index if not exists uidx_res_workers_res_worker
  on public.reservation_workers(reservation_id, worker_id);
create index if not exists idx_res_products_res          on public.reservation_products(reservation_id);
create index if not exists idx_emp_payments_emp          on public.employee_payments(employee_id);
create index if not exists idx_emp_payments_date         on public.employee_payments(date);
create index if not exists idx_ppitems_purchase          on public.product_purchase_items(purchase_id);
create index if not exists idx_ppitems_product           on public.product_purchase_items(product_id);
create index if not exists idx_sale_items_sale           on public.sale_items(sale_id);
create index if not exists idx_caisse_date               on public.caisse_transactions(date);

-- =============================================================================
--  11. AUTHENTICATION
-- =============================================================================

-- 11a. Auto-confirm every new account so admins/workers can log in right away,
--      even if "Confirm email" is still enabled in Auth → Providers → Email.
create or replace function public.auto_confirm_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.email_confirmed_at is null then
    new.email_confirmed_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_confirm on auth.users;
create trigger on_auth_user_confirm
  before insert on auth.users
  for each row execute function public.auto_confirm_user();

-- Confirm accounts that were created before this trigger existed.
update auth.users set email_confirmed_at = now() where email_confirmed_at is null;

-- 11b. Create a profile for every new auth user.
--      • The first account (while no admin exists) becomes 'admin'.
--      • Every other account starts as a 'worker' with NO permissions. The
--        sign-up metadata 'role' is deliberately ignored so nobody can promote
--        themselves; the admin sets role / permissions from "Employés".
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_role text;
begin
  -- Serialise concurrent sign-ups so only one account can become the admin.
  perform pg_advisory_xact_lock(hashtext('salon_first_admin'));

  if not exists (select 1 from public.profiles where role in ('admin', 'super_admin')) then
    v_role := 'admin';
  else
    v_role := 'worker';
  end if;

  insert into public.profiles (id, username, full_name, email, role, permissions)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data->>'username', ''), split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    new.email,
    v_role,
    '{}'::jsonb
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 11c. Keep profiles.email in sync when an auth email changes.
create or replace function public.handle_user_email_change()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  update public.profiles set email = new.email where id = new.id;
  return new;
end;
$$;

drop trigger if exists on_auth_user_email_changed on auth.users;
create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row when (old.email is distinct from new.email)
  execute function public.handle_user_email_change();

-- =============================================================================
--  12. PERMISSION HELPERS
-- -----------------------------------------------------------------------------
--  profiles.permissions = { "<interface>": ["view","create","edit","delete","finalize"] }
--  Interfaces (same ids as src/lib/permissions.ts): dashboard, reservations,
--  clients, prestations, products, product-purchases, sales, suppliers,
--  employees, caisse, expenses, reports, config.
--  Admins / super-admins implicitly have every permission.
-- =============================================================================

create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('admin', 'super_admin')
  );
$$;

-- Any active staff member (admin or worker with an enabled account).
create or replace function public.is_staff()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and active and has_account
  );
$$;

-- Does the current user have `act` on interface `iface`?
create or replace function public.has_perm(iface text, act text)
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.is_admin() or exists (
    select 1 from public.profiles
    where id = auth.uid() and active and has_account
      and coalesce(permissions -> iface, '[]'::jsonb) ? act
  );
$$;

-- Does the current user have ANY of `acts` on ANY of `ifaces`?
create or replace function public.has_any_perm(ifaces text[], acts text[])
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.is_admin() or exists (
    select 1
    from public.profiles p, unnest(ifaces) as i(iface)
    where p.id = auth.uid() and p.active and p.has_account
      and coalesce(p.permissions -> i.iface, '[]'::jsonb) ?| acts
  );
$$;

-- Admin-only: delete a worker's login (auth.users row; profile cascades).
create or replace function public.delete_user_account(target uuid)
returns void
language plpgsql
security definer set search_path = public, auth
as $$
begin
  if not public.is_admin() then
    raise exception 'Seul un administrateur peut supprimer un compte';
  end if;
  if target = auth.uid() then
    raise exception 'Vous ne pouvez pas supprimer votre propre compte';
  end if;
  delete from auth.users where id = target;
end;
$$;
revoke all on function public.delete_user_account(uuid) from public, anon;
grant execute on function public.delete_user_account(uuid) to authenticated;

-- Non-admins may edit their own profile (name, phone, avatar, …) but never
-- their role, permissions, account status or their own pay settings.
create or replace function public.protect_profile_columns()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  -- Trigger-created rows (no JWT, e.g. handle_new_user) and admins are trusted.
  if auth.uid() is null or public.is_admin() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.role        := 'worker';
    new.permissions := '{}'::jsonb;
    return new;
  end if;

  new.role        := old.role;
  new.permissions := old.permissions;
  new.active      := old.active;
  new.has_account := old.has_account;
  if old.id = auth.uid() then
    new.payment_type    := old.payment_type;
    new.percentage      := old.percentage;
    new.daily_rate      := old.daily_rate;
    new.monthly_rate    := old.monthly_rate;
    new.is_paid_enabled := old.is_paid_enabled;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_profile_columns on public.profiles;
create trigger protect_profile_columns
  before insert or update on public.profiles
  for each row execute function public.protect_profile_columns();

-- =============================================================================
--  13. ROW LEVEL SECURITY
-- -----------------------------------------------------------------------------
--  • READ  : every active staff member (dashboards, pickers and joins need it;
--            the app hides the interfaces a worker may not open).
--  • WRITE : insert/update need create|edit|finalize, delete needs delete|edit
--            on one of the interfaces that owns the table. Admins: everything.
-- =============================================================================

do $$
declare
  r   record;
  pol record;
  w   text;
  d   text;
begin
  for r in
    select * from (values
      ('worker_roles',                 array['employees']),
      ('store_config',                 array['config']),
      ('fidelity_config',              array['config']),
      ('clients',                      array['clients','reservations','sales']),
      ('prestations',                  array['prestations']),
      ('services',                     array['prestations']),
      ('reservations',                 array['reservations']),
      ('reservation_products',         array['reservations']),
      ('reservation_workers',          array['reservations','employees']),
      ('employee_payments',            array['employees']),
      ('worker_daily_payment_periods', array['employees']),
      ('worker_reservation_payments',  array['employees','reservations']),
      ('suppliers',                    array['suppliers','product-purchases']),
      ('purchases',                    array['suppliers']),
      ('expenses',                     array['expenses']),
      ('product_categories',           array['products','product-purchases']),
      ('product_brands',               array['products','product-purchases']),
      ('products',                     array['products','product-purchases']),
      ('product_purchases',            array['product-purchases','suppliers']),
      ('product_purchase_items',       array['product-purchases','suppliers']),
      ('purchase_payments',            array['product-purchases','suppliers']),
      ('product_sales',                array['sales']),
      ('sale_items',                   array['sales']),
      ('sale_payments',                array['sales']),
      ('caisse_transactions',          array['caisse'])
    ) as t(tbl, ifaces)
  loop
    execute format('alter table public.%I enable row level security', r.tbl);

    -- Drop every existing policy on the table so re-runs stay clean.
    for pol in select policyname from pg_policies where schemaname = 'public' and tablename = r.tbl loop
      execute format('drop policy if exists %I on public.%I', pol.policyname, r.tbl);
    end loop;

    w := format('public.has_any_perm(%L::text[], array[''create'',''edit'',''finalize''])', r.ifaces);
    d := format('public.has_any_perm(%L::text[], array[''delete'',''edit''])', r.ifaces);

    execute format('create policy "staff_read" on public.%I for select to authenticated using (public.is_staff())', r.tbl);
    execute format('create policy "perm_insert" on public.%I for insert to authenticated with check (%s)', r.tbl, w);
    execute format('create policy "perm_update" on public.%I for update to authenticated using (%s) with check (%s)', r.tbl, w, w);
    execute format('create policy "perm_delete" on public.%I for delete to authenticated using (%s)', r.tbl, d);
  end loop;
end $$;

-- ── profiles : special rules ────────────────────────────────────────────────
alter table public.profiles enable row level security;
do $$
declare pol record;
begin
  for pol in select policyname from pg_policies where schemaname = 'public' and tablename = 'profiles' loop
    execute format('drop policy if exists %I on public.profiles', pol.policyname);
  end loop;
end $$;

-- A user can always read their own profile (so a disabled account gets a
-- clear message); active staff can read the whole team.
create policy "profiles_read" on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.is_staff());

-- The admin (or a worker with employees:create) fills the profile right after
-- the auth sign-up. The app UPSERTs → needs insert + update.
create policy "profiles_insert" on public.profiles
  for insert to authenticated
  with check (public.has_perm('employees', 'create'));

create policy "profiles_update" on public.profiles
  for update to authenticated
  using (
    id = auth.uid()
    or public.is_admin()
    or (role not in ('admin', 'super_admin')
        and public.has_any_perm(array['employees'], array['create', 'edit']))
  )
  with check (
    id = auth.uid()
    or public.is_admin()
    or (role not in ('admin', 'super_admin')
        and public.has_any_perm(array['employees'], array['create', 'edit']))
  );

create policy "profiles_delete" on public.profiles
  for delete to authenticated
  using (
    id <> auth.uid()
    and (public.is_admin()
         or (role not in ('admin', 'super_admin') and public.has_perm('employees', 'delete')))
  );

-- =============================================================================
--  14. STORAGE BUCKETS  (images are uploaded here and displayed by public URL)
-- -----------------------------------------------------------------------------
--   logos    : salon logo (Paramètres)              → admin / config:edit
--   avatars  : profile pictures, folder = <user id>  → owner, admin, employees
--   products : product pictures                      → products:create|edit
-- =============================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('logos',    'logos',    true, 5242880, array['image/png','image/jpeg','image/jpg','image/webp','image/gif','image/svg+xml']),
  ('avatars',  'avatars',  true, 5242880, array['image/png','image/jpeg','image/jpg','image/webp','image/gif']),
  ('products', 'products', true, 5242880, array['image/png','image/jpeg','image/jpg','image/webp','image/gif'])
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Who may upload / replace / delete an image in a bucket?
create or replace function public.can_write_image(bucket text, object_name text)
returns boolean
language sql stable security definer set search_path = public
as $$
  select case bucket
    when 'logos'    then public.has_perm('config', 'edit')
    when 'avatars'  then public.is_staff() and (
                           (storage.foldername(object_name))[1] = auth.uid()::text
                           or public.has_any_perm(array['employees'], array['create', 'edit']))
    when 'products' then public.has_any_perm(array['products', 'product-purchases'], array['create', 'edit'])
    else false
  end;
$$;

drop policy if exists "public_read_images"  on storage.objects;
drop policy if exists "staff_write_images"  on storage.objects;
drop policy if exists "staff_update_images" on storage.objects;
drop policy if exists "staff_delete_images" on storage.objects;
drop policy if exists "images_public_read"  on storage.objects;
drop policy if exists "images_insert"       on storage.objects;
drop policy if exists "images_update"       on storage.objects;
drop policy if exists "images_delete"       on storage.objects;

-- Anyone (including the login page) can display the images.
create policy "images_public_read" on storage.objects
  for select to public
  using (bucket_id in ('logos', 'avatars', 'products'));

create policy "images_insert" on storage.objects
  for insert to authenticated
  with check (public.can_write_image(bucket_id, name));

create policy "images_update" on storage.objects
  for update to authenticated
  using (public.can_write_image(bucket_id, name))
  with check (public.can_write_image(bucket_id, name));

create policy "images_delete" on storage.objects
  for delete to authenticated
  using (public.can_write_image(bucket_id, name));

-- =============================================================================
--  15. LOGIN-PAGE (ANONYMOUS) ACCESS
-- =============================================================================
-- Store name / logo for branding before login.
drop policy if exists "public_read_store_config" on public.store_config;
create policy "public_read_store_config" on public.store_config
  for select to anon using (true);

-- Tells the Login page whether an admin exists (hides "Créer le compte
-- administrateur") without exposing the profiles table.
create or replace function public.admin_exists()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.profiles where role in ('admin', 'super_admin'));
$$;
grant execute on function public.admin_exists() to anon, authenticated;

grant execute on function public.is_admin(), public.is_staff(),
  public.has_perm(text, text), public.has_any_perm(text[], text[]) to authenticated;

-- =============================================================================
--  DONE. Open the app → Login → "Créer le compte administrateur".
-- =============================================================================
