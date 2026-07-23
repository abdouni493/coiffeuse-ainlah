-- =============================================================================
--  SALON DE BEAUTÉ "AINLAH" — COMPLETE SUPABASE SCHEMA
-- =============================================================================
--  Project : https://ungdkbgweivotrezyase.supabase.co
--
--  HOW TO USE
--  ----------
--  1. Open your Supabase project → SQL Editor → New query.
--  2. Paste this ENTIRE file and click "Run".  It is idempotent: it can be
--     run again safely (uses IF NOT EXISTS / ON CONFLICT / CREATE OR REPLACE).
--  3. In Authentication → Providers → Email, DISABLE "Confirm email" so that
--     new admin/worker accounts can log in immediately after creation.
--  4. The FIRST account created from the Login page automatically becomes the
--     salon "admin".  Every account created afterwards (from the Workers page)
--     is a "worker" and only sees the interfaces/actions granted to it in its
--     permissions.
--
--  This file creates:
--    • all business tables (reservations, clients, products, workers, …)
--    • the new features: clients + fidelity, caisse, worker roles & granular
--      permissions
--    • storage buckets for image uploads (logos, avatars, products)
--    • Row Level Security with permissive policies for authenticated staff
--    • a trigger that creates a profile automatically for every new auth user
-- =============================================================================

-- ── Extensions ───────────────────────────────────────────────────────────────
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
  prestation_id uuid references public.prestations(id) on delete set null,
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
--  10. INDEXES
-- =============================================================================
create index if not exists idx_reservations_date        on public.reservations(date);
create index if not exists idx_reservations_status       on public.reservations(status);
create index if not exists idx_reservations_worker       on public.reservations(worker_id);
create index if not exists idx_reservations_client       on public.reservations(client_id);
create index if not exists idx_res_workers_worker        on public.reservation_workers(worker_id);
create index if not exists idx_res_workers_res           on public.reservation_workers(reservation_id);
create index if not exists idx_res_products_res          on public.reservation_products(reservation_id);
create index if not exists idx_emp_payments_emp          on public.employee_payments(employee_id);
create index if not exists idx_emp_payments_date         on public.employee_payments(date);
create index if not exists idx_ppitems_purchase          on public.product_purchase_items(purchase_id);
create index if not exists idx_ppitems_product           on public.product_purchase_items(product_id);
create index if not exists idx_sale_items_sale           on public.sale_items(sale_id);
create index if not exists idx_caisse_date               on public.caisse_transactions(date);

-- =============================================================================
--  11. NEW-USER TRIGGER  (auto-create a profile for every auth user)
-- =============================================================================
-- The FIRST ever profile becomes 'admin'.  All following accounts default to
-- 'worker' (the Workers page passes role='worker' in the sign-up metadata).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_count int;
  v_role  text;
begin
  select count(*) into v_count from public.profiles;

  if v_count = 0 then
    v_role := 'admin';
  else
    v_role := coalesce(new.raw_user_meta_data->>'role', 'worker');
  end if;

  insert into public.profiles (id, username, full_name, email, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    new.email,
    v_role
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Helper : is the current auth user an admin?  (used by policies if you tighten them)
create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('admin', 'super_admin')
  );
$$;

-- =============================================================================
--  12. ROW LEVEL SECURITY
-- =============================================================================
-- This is an internal staff application: every authenticated employee may read
-- and write business data.  Fine-grained UI restrictions are enforced by the
-- per-worker `permissions` map in the app.  Tighten these policies later if you
-- expose the database to untrusted clients.

do $$
declare t text;
begin
  foreach t in array array[
    'worker_roles','profiles','store_config','fidelity_config','clients',
    'prestations','services','reservations','reservation_products',
    'reservation_workers','employee_payments','worker_daily_payment_periods',
    'worker_reservation_payments','suppliers','purchases','expenses',
    'product_categories','product_brands','products','product_purchases',
    'product_purchase_items','purchase_payments','product_sales','sale_items',
    'sale_payments','caisse_transactions'
  ]
  loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('drop policy if exists "staff_all" on public.%I;', t);
    execute format(
      'create policy "staff_all" on public.%I for all to authenticated using (true) with check (true);',
      t
    );
  end loop;
end $$;

-- =============================================================================
--  13. STORAGE BUCKETS  (image uploads)
-- =============================================================================
insert into storage.buckets (id, name, public)
values
  ('logos',   'logos',   true),
  ('avatars', 'avatars', true),
  ('products','products',true)
on conflict (id) do nothing;

-- Public read for these buckets; authenticated staff can upload / modify / delete.
drop policy if exists "public_read_images"  on storage.objects;
create policy "public_read_images" on storage.objects
  for select to public
  using (bucket_id in ('logos','avatars','products'));

drop policy if exists "staff_write_images"  on storage.objects;
create policy "staff_write_images" on storage.objects
  for insert to authenticated
  with check (bucket_id in ('logos','avatars','products'));

drop policy if exists "staff_update_images" on storage.objects;
create policy "staff_update_images" on storage.objects
  for update to authenticated
  using (bucket_id in ('logos','avatars','products'));

drop policy if exists "staff_delete_images" on storage.objects;
create policy "staff_delete_images" on storage.objects
  for delete to authenticated
  using (bucket_id in ('logos','avatars','products'));

-- =============================================================================
--  14. ANONYMOUS LOGIN-PAGE ACCESS
-- =============================================================================
-- The Login page runs before the user is authenticated, so it needs two things
-- that RLS would otherwise block for the "anon" role:
--   • read the store name / logo for branding
--   • know whether an admin already exists (to hide the "create admin" button)

-- Public (anon) read of the single store_config row.
drop policy if exists "public_read_store_config" on public.store_config;
create policy "public_read_store_config" on public.store_config
  for select to anon using (true);

-- Boolean RPC that tells the Login page if the salon already has an admin,
-- WITHOUT exposing the profiles table to anonymous visitors.
create or replace function public.admin_exists()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles where role in ('admin', 'super_admin')
  );
$$;
grant execute on function public.admin_exists() to anon, authenticated;

-- =============================================================================
--  DONE.  Create the first (admin) account from the app's Login page.
-- =============================================================================
