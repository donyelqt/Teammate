-- Test-only stub of Supabase's auth schema.
--
-- Local policy tests run against a plain Postgres container where the auth
-- schema does not exist. Under `supabase start` the real schema is present and
-- this file is not needed. Keep it minimal and never migrate it: it exists so
-- the RLS suite can assert real behavior without a live Supabase project.

create schema if not exists auth;

-- Supabase precreates these roles. Plain Postgres does not, and RLS is only
-- exercised meaningfully from the authenticated role.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role;
  end if;
end
$$;

-- Grants for the policy suite. They are applied after the tests schema
-- exists, which is why they live here rather than in the suite's own script:
-- the suite switches to the authenticated role mid-test and must still be
-- able to call its own helper functions.

create table if not exists auth.users (
  id uuid primary key,
  email text,
  instance_id uuid,
  aud text default 'authenticated',
  role text default 'authenticated',
  encrypted_password text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

create or replace function auth.role()
returns text
language sql
stable
as $$
  select coalesce(current_setting('request.jwt.claim.role', true), 'authenticated');
$$;
