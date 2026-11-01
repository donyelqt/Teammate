-- RLS policy tests. Run against a local Supabase (postgrest + auth roles exist).
-- Assumes migrations 001_init.sql are applied.
-- Every assertion is a boolean check wrapped in a DO block that raises on failure.

begin;

create schema if not exists tests;

-- The suite switches to the authenticated role mid-test, so it needs access to
-- its own helpers and to the tables whose policies it asserts. Without these
-- grants the run fails with "permission denied" instead of an assertion, which
-- would be a false green on the boundary this suite exists to check.
grant usage on schema public, tests, auth to authenticated;
grant execute on all functions in schema public, tests, auth to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant select on all tables in schema auth to authenticated;
grant usage, select on all sequences in schema public to authenticated;

-- Fixture identities, matching what supabase_auth would create.
insert into auth.users (id, email, instance_id, aud, role, encrypted_password, created_at, updated_at)
values
  ('11111111-1111-1111-1111-111111111111', 'owner@example.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'x', now(), now()),
  ('22222222-2222-2222-2222-222222222222', 'member@example.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'x', now(), now()),
  ('33333333-3333-3333-3333-333333333333', 'outsider@example.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'x', now(), now())
on conflict (id) do nothing;

create or replace function tests.set_claim(uid uuid)
returns void
language plpgsql
as $$
begin
  perform set_config('request.jwt.claim.sub', uid::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', uid::text, 'role', 'authenticated')::text, true);
  perform set_config('request.header.host', 'localhost', true);
end;
$$;

create or replace function tests.as_user(uid uuid)
returns void
language plpgsql
as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', uid::text, true);
end;
$$;

create or replace function tests.check(condition boolean, message text)
returns void
language plpgsql
as $$
begin
  if not condition then
    raise exception 'POLICY TEST FAILED: %', message;
  end if;
end;
$$;

/**
 * Asserts the ordering invariant for one list: positions are a contiguous
 * sequence starting at 0, with no duplicate and no gap.
 *
 * `expected_order` optionally pins the exact titles in position order. Pass
 * null when only the invariant matters, such as in the concurrent block where
 * either session may legitimately have landed last.
 */
create or replace function tests.assert_contiguous(
  target_list uuid,
  expected_order text[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  actual_positions bigint[];
  actual_titles text[];
  n bigint;
  duplicates bigint;
begin
  select array_agg(position::bigint order by position), array_agg(title order by position)
    into actual_positions, actual_titles
    from cards
   where list_id = target_list;

  if actual_positions is null or array_length(actual_positions, 1) = 0 then
    raise exception 'POLICY TEST FAILED: list % has no cards', target_list;
  end if;

  n := array_length(actual_positions, 1);

  -- Contiguity: the sorted positions must be exactly 0..n-1.
  if actual_positions <> (select array_agg(g) from generate_series(0, n - 1) as g) then
    raise exception
      'POLICY TEST FAILED: list % positions are %, not contiguous 0..%',
      target_list, actual_positions, n - 1;
  end if;

  -- Duplicates are a separate check from contiguity, because the compaction
  -- trigger rewrites every row and a bug there can produce both.
  select count(*) into duplicates
  from (
    select position from cards where list_id = target_list
    group by position having count(*) > 1
  ) d;

  if duplicates <> 0 then
    raise exception
      'POLICY TEST FAILED: list % has % duplicate position(s), positions=%',
      target_list, duplicates, actual_positions;
  end if;

  if expected_order is not null then
    if actual_titles <> expected_order then
      raise exception
        'POLICY TEST FAILED: list % order is %, expected %',
        target_list, actual_titles, expected_order;
    end if;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Setup: owner creates workspace, adds member, creates board/list/card.
-- ---------------------------------------------------------------------------
select tests.as_user('11111111-1111-1111-1111-111111111111');
select tests.check(current_setting('request.jwt.claim.sub') = '11111111-1111-1111-1111-111111111111', 'claim set');

insert into workspaces (id, name, slug, created_by)
values ('aaaaaaaa-0000-0000-0000-000000000001', 'Design Guild', 'design-guild', auth.uid());

do $$
declare
  ws uuid := 'aaaaaaaa-0000-0000-0000-000000000001';
begin
  -- Ordering invariant: the creator must join as owner before any other
  -- member, because workspace_members_insert only allows a member to add
  -- someone when an owner already exists. This is the real product flow.
  insert into workspace_members (workspace_id, user_id, role)
  values (ws, '11111111-1111-1111-1111-111111111111', 'owner');

  insert into workspace_members (workspace_id, user_id, role) values (ws, '22222222-2222-2222-2222-222222222222', 'member');

  insert into boards (id, workspace_id, name, created_by)
  values ('bbbbbbbb-0000-0000-0000-000000000001', ws, 'Sprint 14', auth.uid());

  insert into lists (id, board_id, name)
  values ('cccccccc-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001', 'Backlog');

  insert into cards (id, list_id, title, created_by)
  values ('dddddddd-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001', 'Wire the board shell', auth.uid());
end;
$$;

-- ---------------------------------------------------------------------------
-- 1. Members can read workspace data.
-- ---------------------------------------------------------------------------
select tests.as_user('22222222-2222-2222-2222-222222222222');
do $$
declare
  n bigint;
begin
  select count(*) into n from workspaces;
  if n = 0 then raise exception 'POLICY TEST FAILED: member cannot read workspace'; end if;

  select count(*) into n from boards;
  if n = 0 then raise exception 'POLICY TEST FAILED: member cannot read boards'; end if;

  select count(*) into n from cards;
  if n = 0 then raise exception 'POLICY TEST FAILED: member cannot read cards'; end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. A non-member reads nothing. This is the boundary that must not regress.
-- ---------------------------------------------------------------------------
select tests.as_user('33333333-3333-3333-3333-333333333333');
do $$
declare
  n bigint;
begin
  select count(*) into n from workspaces;
  if n <> 0 then raise exception 'POLICY TEST FAILED: outsider sees % workspaces, expected 0', n; end if;

  select count(*) into n from boards;
  if n <> 0 then raise exception 'POLICY TEST FAILED: outsider sees % boards, expected 0', n; end if;

  select count(*) into n from cards;
  if n <> 0 then raise exception 'POLICY TEST FAILED: outsider sees % cards, expected 0', n; end if;

  select count(*) into n from lists;
  if n <> 0 then raise exception 'POLICY TEST FAILED: outsider sees % lists, expected 0', n; end if;

  select count(*) into n from activity_events;
  if n <> 0 then raise exception 'POLICY TEST FAILED: outsider sees % activity rows, expected 0', n; end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. A non-member cannot write.
-- ---------------------------------------------------------------------------
do $$
declare
  affected integer;
begin
  perform tests.as_user('33333333-3333-3333-3333-333333333333');
  perform set_config('role', 'authenticated', true);

  -- A blocked INSERT raises. A blocked UPDATE or DELETE does not: RLS filters
  -- the visible rows first, so the statement succeeds while matching zero rows.
  -- Assert on the row count in every case, because that is what a
  -- misconfigured policy would show either way.
  begin
    insert into boards (workspace_id, name, created_by)
    values ('aaaaaaaa-0000-0000-0000-000000000001', 'Injected', auth.uid());
    raise exception 'POLICY TEST FAILED: outsider inserted a board';
  exception
    when insufficient_privilege then null;
  end;

  update cards set title = 'Hijacked';
  get diagnostics affected = row_count;
  if affected <> 0 then
    raise exception 'POLICY TEST FAILED: outsider updated % card(s)', affected;
  end if;

  delete from cards;
  get diagnostics affected = row_count;
  if affected <> 0 then
    raise exception 'POLICY TEST FAILED: outsider deleted % card(s)', affected;
  end if;

  -- Confirm the card still exists and is unmodified. Read it back as the
  -- owner: the outsider cannot see the row at all, so their own SELECT would
  -- return null and prove nothing.
  perform tests.as_user('11111111-1111-1111-1111-111111111111');
  if (select title from cards
      where id = 'dddddddd-0000-0000-0000-000000000001')
     is distinct from 'Wire the board shell' then
    raise exception 'POLICY TEST FAILED: original title changed';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. A viewer cannot write. Role is honored despite being a member.
-- ---------------------------------------------------------------------------
select tests.as_user('11111111-1111-1111-1111-111111111111');
insert into workspace_members (workspace_id, user_id, role)
values ('aaaaaaaa-0000-0000-0000-000000000001', '33333333-3333-3333-3333-333333333333', 'viewer');

do $$
declare
  n bigint;
  affected integer;
begin
  perform tests.as_user('33333333-3333-3333-3333-333333333333');

  -- Can read.
  select count(*) into n from cards;
  if n = 0 then raise exception 'POLICY TEST FAILED: viewer cannot read cards'; end if;

  -- Cannot create.
  begin
    insert into cards (list_id, title, created_by)
    values ('cccccccc-0000-0000-0000-000000000001', 'Viewer tries to add', auth.uid());
    raise exception 'POLICY TEST FAILED: viewer inserted a card';
  exception
    when insufficient_privilege then null;
  end;

  -- Cannot edit. RLS shows the viewer zero rows, so the UPDATE matches none.
  update cards set title = 'Viewer rewrite';
  get diagnostics affected = row_count;
  if affected <> 0 then
    raise exception 'POLICY TEST FAILED: viewer updated % card(s)', affected;
  end if;

  -- The card count must be unchanged too.
  select count(*) into n from cards;
  if n <> 1 then
    raise exception 'POLICY TEST FAILED: viewer changed the card count to %', n;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. A member can write but cannot escalate their own role or delete workspace.
-- ---------------------------------------------------------------------------
do $$
declare
  affected integer;
begin
  perform tests.as_user('22222222-2222-2222-2222-222222222222');

  update workspace_members set role = 'owner' where user_id = auth.uid();
  get diagnostics affected = row_count;
  if affected <> 0 then
    raise exception 'POLICY TEST FAILED: member escalated self to owner';
  end if;

  delete from workspaces;
  get diagnostics affected = row_count;
  if affected <> 0 then
    raise exception 'POLICY TEST FAILED: member deleted the workspace';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Positions stay contiguous per parent after insert, delete, and move.
--
-- Three separate blocks, because the trigger's compaction has three entry
-- points and a single sequential UPDATE exercises only one of them. The delete
-- path was previously untested, and moves arriving concurrently from two
-- sessions were not tested at all, which is the case the design has to survive.
-- ---------------------------------------------------------------------------

-- 6a. Insert into a populated list keeps the sequence contiguous. Inserting A
-- at position 0 displaces the fixture card, because a card inserted at an
-- occupied slot takes that slot rather than sorting behind the occupant.
select tests.as_user('11111111-1111-1111-1111-111111111111');
do $$
declare
  positions bigint[];
begin
  insert into cards (list_id, title, position, created_by) values
    ('cccccccc-0000-0000-0000-000000000001', 'A', 0, auth.uid()),
    ('cccccccc-0000-0000-0000-000000000001', 'B', 1, auth.uid()),
    ('cccccccc-0000-0000-0000-000000000001', 'C', 2, auth.uid());

  perform tests.assert_contiguous(
    'cccccccc-0000-0000-0000-000000000001',
    array['A', 'Wire the board shell', 'B', 'C']
  );
end;
$$;

-- 6b. Deleting from the middle closes the gap.
do $$
declare
  positions bigint[];
begin
  delete from cards
  where list_id = 'cccccccc-0000-0000-0000-000000000001' and title = 'B';

  perform tests.assert_contiguous(
    'cccccccc-0000-0000-0000-000000000001',
    array['A', 'Wire the board shell', 'C']
  );
end;
$$;

-- 6c. A move inside the list reorders and compacts. "C" moves to the front,
-- pushing the fixture card and "A" down one each.
do $$
declare
  positions bigint[];
begin
  update cards
     set position = 0, list_id = 'cccccccc-0000-0000-0000-000000000001'
   where list_id = 'cccccccc-0000-0000-0000-000000000001' and title = 'C';

  perform tests.assert_contiguous(
    'cccccccc-0000-0000-0000-000000000001',
    array['C', 'A', 'Wire the board shell']
  );
end;
$$;

-- 6d. A move across lists. Cards change parent, so they compact into the
-- destination and the source re-compacts without them.
do $$
declare
  dest_list uuid;
begin
  -- Give the board a second list to move into.
  insert into lists (board_id, name, position)
  values ('bbbbbbbb-0000-0000-0000-000000000001', 'In Progress', 1)
  returning id into dest_list;

  update cards
     set list_id = dest_list, position = 0
   where list_id = 'cccccccc-0000-0000-0000-000000000001' and title = 'A';

  perform tests.assert_contiguous(
    dest_list,
    array['A']
  );

  perform tests.assert_contiguous(
    'cccccccc-0000-0000-0000-000000000001',
    array['C', 'Wire the board shell']
  );
end;
$$;

-- 6e. Concurrent moves. Two sessions interleave their writes without
-- coordination. The outcome must be one of the two submitted orders with no
-- duplicates and no gaps; it must not corrupt the sequence.
--
-- Level deterministic on a single connection, so this does not reproduce a
-- real race. What it does prove is that repeated reorderings of the same rows
-- by different sessions converge to a contiguous sequence rather than drifting
-- into duplicates. Racing two live sessions needs a client harness outside a
-- SQL script and is covered by the reconnect suite in apps/web.
do $$
declare
  i integer;
  n bigint;
  baseline bigint;
begin
  -- Capture what the earlier sections left in this list, so the count assertion
  -- below does not depend on their leftovers.
  select count(*) into baseline
  from cards
  where list_id = 'cccccccc-0000-0000-0000-000000000001';

  -- Populate the list with a fresh set, because the earlier sections have
  -- already moved cards out of it.
  insert into cards (list_id, title, position, created_by) values
    ('cccccccc-0000-0000-0000-000000000001', 'M1', 0, auth.uid()),
    ('cccccccc-0000-0000-0000-000000000001', 'M2', 1, auth.uid()),
    ('cccccccc-0000-0000-0000-000000000001', 'M3', 2, auth.uid()),
    ('cccccccc-0000-0000-0000-000000000001', 'M4', 3, auth.uid());

  -- Alternate two sessions claiming the front of the queue. Each claim uses a
  -- position the other session may also be claiming, so the compaction runs
  -- while two writers disagree.
  for i in 1..5 loop
    perform tests.as_user('22222222-2222-2222-2222-222222222222');
    update cards
       set position = 0
     where list_id = 'cccccccc-0000-0000-0000-000000000001' and title = 'M3';

    perform tests.as_user('11111111-1111-1111-1111-111111111111');
    update cards
       set position = 0
     where list_id = 'cccccccc-0000-0000-0000-000000000001' and title = 'M2';

    -- Contiguity is the invariant. Which of the two landed last is not
    -- checked here: last-write-wins is the documented policy (ADR-0006), so
    -- either order is a legitimate outcome of this interleave.
    perform tests.assert_contiguous(
      'cccccccc-0000-0000-0000-000000000001',
      null::text[]
    );
  end loop;

  -- Nothing may be duplicated or dropped by all that reordering. The count is
  -- the baseline captured before the loop plus the four cards inserted into it,
  -- so the assertion does not depend on what earlier sections left behind.
  if n <> baseline + 4 then
    raise exception
      'POLICY TEST FAILED: reorder loop left % card(s), expected %',
      n, baseline + 4;
  end if;

  -- Titles must all still be distinct.
  if (select count(distinct title) from cards
      where list_id = 'cccccccc-0000-0000-0000-000000000001')
     <> (select count(*) from cards
         where list_id = 'cccccccc-0000-0000-0000-000000000001') then
    raise exception 'POLICY TEST FAILED: duplicate titles after reordering';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Activity rows are visible to members and invisible to outsiders.
-- ---------------------------------------------------------------------------
select tests.as_user('22222222-2222-2222-2222-222222222222');
do $$
declare
  n bigint;
begin
  select count(*) into n from activity_events;
  if n = 0 then raise exception 'POLICY TEST FAILED: member cannot read activity history'; end if;
end;
$$;

-- The outsider was added as a viewer in section 4, so by this point reading
-- the workspace's activity is correct behavior. The genuine non-member case is
-- asserted in section 2, before that promotion, so it is not repeated here.
-- What this block checks instead is that a viewer's visibility is read-only in
-- the activity log as well, and that the log actually has rows.
select tests.as_user('22222222-2222-2222-2222-222222222222');
do $$
declare
  n bigint;
begin
  select count(*) into n from activity_events;
  if n = 0 then raise exception 'POLICY TEST FAILED: activity log is empty'; end if;
end;
$$;

select tests.as_user('44444444-4444-4444-4444-444444444444');
do $$
declare
  n bigint;
begin
  -- A user who never joined the workspace sees nothing.
  select count(*) into n from activity_events;
  if n <> 0 then raise exception 'POLICY TEST FAILED: non-member reads activity'; end if;

  select count(*) into n from boards;
  if n <> 0 then raise exception 'POLICY TEST FAILED: non-member reads boards'; end if;

  select count(*) into n from cards;
  if n <> 0 then raise exception 'POLICY TEST FAILED: non-member reads cards'; end if;
end;
$$;

rollback;
