do $$
declare
  target_tables text[] := array[
    'cards',
    'lists',
    'comments',
    'activity_events',
    'card_presence'
  ];
  tbl text;
begin
  if not exists (
    select 1 from pg_publication where pubname = 'supabase_realtime'
  ) then
    create publication supabase_realtime;
  end if;

  for tbl in
    select unnest(target_tables)
  loop
    if not exists (
      select 1
      from pg_publication_tables pt
      join pg_publication p on p.pubname = pt.pubname
      where p.pubname = 'supabase_realtime'
        and pt.schemaname = 'public'
        and pt.tablename = tbl
    ) then
      execute format(
        'alter publication supabase_realtime add table public.%I',
        tbl
      );
    end if;

    execute format(
      'alter table public.%I replica identity full',
      tbl
    );
  end loop;
end;
$$;