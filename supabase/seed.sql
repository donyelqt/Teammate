-- Local development seed.
--
-- Creates one user with a workspace, so the app has something to sign into and
-- the membership query has a row to find. Applied only by `supabase db reset`
-- against the local stack.
--
-- Ids are deliberately outside the ranges used by `tests/policies.sql`. Both run
-- against the same database after a reset, and sharing a primary key makes the
-- policy suite fail with "duplicate key value violates unique constraint"
-- before it asserts anything.
--
-- The `identities` row is not optional. GoTrue resolves a password login through
-- it, so a seed that inserts only into `auth.users` signs in with a 500 rather
-- than a session. That failure reads as a password bug and is not.

do $$
declare
  seed_user uuid := '99999999-9999-9999-9999-999999999999';
  seed_workspace uuid := 'bbbbbbbb-9999-9999-9999-999999999999';
  existing_user uuid;
begin
  -- The address may already be taken, from an earlier reset or from a user
  -- created through the admin API. Reuse that user rather than failing on the
  -- partial unique index over email, which is a different constraint from the
  -- primary key and needs its own lookup.
  select id into existing_user
  from auth.users
  where email = 'developer@teammate.local';

  if existing_user is not null then
    seed_user := existing_user;
  else
    insert into auth.users (
      id, instance_id, aud, role, email,
      encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at
    ) values (
      seed_user,
      '00000000-0000-0000-0000-000000000000',
      'authenticated',
      'authenticated',
      'developer@teammate.local',
      crypt('local-dev-password', gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}',
      '{}',
      now(),
      now()
    ) on conflict (id) do nothing;
  end if;

  insert into auth.identities (
    id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at
  ) values (
    gen_random_uuid(),
    seed_user,
    gen_random_uuid(),
    jsonb_build_object(
      'sub', seed_user,
      'email', 'developer@teammate.local',
      'email_verified', true,
      'phone_verified', false
    ),
    'email',
    now(),
    now(),
    now()
  ) on conflict do nothing;

  insert into workspaces (id, name, slug, created_by)
  values (
    seed_workspace,
    'Local Dev',
    'local-dev',
    seed_user
  ) on conflict (id) do nothing;

  insert into workspace_members (workspace_id, user_id, role)
  values (
    seed_workspace,
    seed_user,
    'owner'
  ) on conflict (workspace_id, user_id) do nothing;
end;
$$;
