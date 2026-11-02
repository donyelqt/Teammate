-- Local development seed.
--
-- Creates one confirmed user with a password identity, and a workspace they own,
-- so the auth flow has something to sign into and the membership query has a row
-- to find. Applied only by `supabase db reset` against the local stack.
--
-- The `identities` row is not optional. GoTrue resolves a password login through
-- it, so a seed that inserts only into `auth.users` signs in with a 500 rather
-- than a session.
insert into auth.users (
  id, instance_id, aud, role, email,
  encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
) values (
  '11111111-1111-1111-1111-111111111111',
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

insert into auth.identities (
  id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at
) values (
  gen_random_uuid(),
  '11111111-1111-1111-1111-111111111111',
  gen_random_uuid(),
  jsonb_build_object(
    'sub', '11111111-1111-1111-1111-111111111111',
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
  'aaaaaaaa-0000-0000-0000-000000000001',
  'Local Dev',
  'local-dev',
  '11111111-1111-1111-1111-111111111111'
) on conflict (id) do nothing;

insert into workspace_members (workspace_id, user_id, role)
values (
  'aaaaaaaa-0000-0000-0000-000000000001',
  '11111111-1111-1111-1111-111111111111',
  'owner'
) on conflict (workspace_id, user_id) do nothing;
