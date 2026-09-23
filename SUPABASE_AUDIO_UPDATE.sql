-- Lower piano range to C2 (MIDI 36). Preserves history and account settings.
begin;
create or replace function public.voice_apply(operation_id uuid, mutation jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare
  u uuid := auth.uid(); k text := mutation->>'kind'; r jsonb; i text; pair record; parent_id text;
begin
  if u is null or not exists(select 1 from auth.users where id = u) then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if operation_id is null or jsonb_typeof(mutation) <> 'object' or octet_length(mutation::text) > 120000 then
    raise exception 'Invalid mutation';
  end if;
  -- Serialize writes of one account, including deletion and duplicate requests.
  perform pg_advisory_xact_lock(hashtextextended(u::text, 0));
  if exists(select 1 from voice_private.receipts p where p.owner_id=u and p.operation_id=voice_apply.operation_id) then return; end if;
  if k in ('attempt','session') then
    r := mutation->'record'; i := r->>'id';
    perform i::uuid;
    if i is null or jsonb_typeof(r) <> 'object' or r->>'recordVersion' is distinct from '1'
      or coalesce(r->>'status','') not in ('incomplete','completed','interrupted')
      or jsonb_typeof(r->'title') is distinct from 'string' or length(r->>'title') > 200
      or jsonb_typeof(r->'startedAt') is distinct from 'string' then raise exception 'Invalid record'; end if;
    perform (r->>'startedAt')::timestamptz;
    if r->>'status' <> 'incomplete' and r->>'endedAt' is null then raise exception 'Missing end time'; end if;
    if r->>'endedAt' is not null then perform (r->>'endedAt')::timestamptz; end if;
    if k = 'attempt' then
      if jsonb_typeof(r->'practice') is distinct from 'object' or jsonb_typeof(r->'audio') is distinct from 'object'
        or jsonb_typeof(r->'reason') is distinct from 'string' or length(r->>'reason') > 2000
        or coalesce(r->'practice'->>'exerciseId','') not in ('ladder','steady','pulse','descent','thirds','melody','soft-descent','two-waves','warm-arch','open-echo','five-vowels','clear-steps','light-syllables','lip-rhythm','octave-echo','upper-swing','wide-arch','upward-light','three-step-run','growing-wave','broken-chord','returning-steps','major-up','major-down','minor-up','minor-down','major-penta-up','major-penta-down','minor-penta-up','minor-penta-down')
        or coalesce((r->'practice'->>'baseMidi')::numeric,0) not between 36 and 77
        or coalesce((r->'practice'->>'bpm')::numeric,0) not between 30 and 150
        or coalesce((r->'practice'->>'exerciseVersion')::int,0) < 1
        then raise exception 'Invalid attempt settings'; end if;
      if r->>'score' is not null and ((r->>'score')::numeric not between 0 and 100 or r->>'status' <> 'completed') then raise exception 'Invalid score'; end if;
      if r->>'result' is not null and (jsonb_typeof(r->'result'->'notes') is distinct from 'array' or jsonb_array_length(r->'result'->'notes') > 128) then raise exception 'Invalid note results'; end if;
      -- Whitelist the derived data. Raw microphone samples/trace have no storage field.
      r := jsonb_build_object('recordVersion',1,'id',i,'title',r->'title','startedAt',r->'startedAt',
        'endedAt',r->'endedAt','status',r->'status','practice',r->'practice','audio',r->'audio',
        'scoreVersion',r->'scoreVersion','score',r->'score','result',r->'result','reason',r->'reason','sessionId',r->'sessionId');
      parent_id := r->>'sessionId';
      if parent_id is not null then
        perform parent_id::uuid;
        if exists(select 1 from public.voice_records where owner_id=u and kind='session' and id=parent_id and deleted) then
          perform voice_private.put_record(u,k,i,null,true);
          insert into voice_private.receipts values(u,operation_id,now()); return;
        end if;
      end if;
    else
      if jsonb_typeof(r->'queue') is distinct from 'array' or jsonb_typeof(r->'attemptIds') is distinct from 'array'
        or jsonb_array_length(r->'queue') not between 1 and 32 or jsonb_array_length(r->'queue') <> jsonb_array_length(r->'attemptIds')
        then raise exception 'Invalid session'; end if;
      r := jsonb_build_object('recordVersion',1,'id',i,'title',r->'title','startedAt',r->'startedAt',
        'endedAt',r->'endedAt','status',r->'status','queue',r->'queue','attemptIds',r->'attemptIds');
    end if;
    perform voice_private.put_record(u,k,i,r);
  elsif k = 'preferences' then
    if jsonb_typeof(mutation->'value') is distinct from 'object' then raise exception 'Invalid preferences'; end if;
    for pair in select * from jsonb_each(mutation->'value') loop
      if pair.key = 'tempos' then
        if jsonb_typeof(pair.value) <> 'object' then raise exception 'Invalid tempos'; end if;
        for i,r in select * from jsonb_each(pair.value) loop
          if i not in ('ladder','steady','pulse','descent','thirds','melody','soft-descent','two-waves','warm-arch','open-echo','five-vowels','clear-steps','light-syllables','lip-rhythm','octave-echo','upper-swing','wide-arch','upward-light','three-step-run','growing-wave','broken-chord','returning-steps','major-up','major-down','minor-up','minor-down','major-penta-up','major-penta-down','minor-penta-up','minor-penta-down') or jsonb_typeof(r) <> 'number' or r::text::numeric not between 30 and 150 then raise exception 'Invalid tempo'; end if;
          perform voice_private.put_record(u,'setting','tempo:'||i,r);
        end loop;
      else
        if not (
          (pair.key='baseMidi' and jsonb_typeof(pair.value)='number' and pair.value::text::numeric between 36 and 77) or
          (pair.key='volume' and jsonb_typeof(pair.value)='number' and pair.value::text::numeric between 0 and 100) or
          (pair.key='goalMinutes' and pair.value::text in ('1','3','5','10','15')) or
          (pair.key='reminder' and jsonb_typeof(pair.value)='boolean') or
          (pair.key='lastExerciseId' and pair.value #>> '{}' in ('ladder','steady','pulse','descent','thirds','melody','soft-descent','two-waves','warm-arch','open-echo','five-vowels','clear-steps','light-syllables','lip-rhythm','octave-echo','upper-swing','wide-arch','upward-light','three-step-run','growing-wave','broken-chord','returning-steps','major-up','major-down','minor-up','minor-down','major-penta-up','major-penta-down','minor-penta-up','minor-penta-down'))
        ) then raise exception 'Invalid preference'; end if;
        perform voice_private.put_record(u,'setting',pair.key,pair.value);
      end if;
    end loop;
  elsif k = 'favorite' then
    i := mutation->>'id';
    if i is null or i not in ('ladder','steady','pulse','descent','thirds','melody','soft-descent','two-waves','warm-arch','open-echo','five-vowels','clear-steps','light-syllables','lip-rhythm','octave-echo','upper-swing','wide-arch','upward-light','three-step-run','growing-wave','broken-chord','returning-steps','major-up','major-down','minor-up','minor-down','major-penta-up','major-penta-down','minor-penta-up','minor-penta-down') or jsonb_typeof(mutation->'enabled') is distinct from 'boolean' then raise exception 'Invalid favorite'; end if;
    perform voice_private.put_record(u,'favorite',i,mutation->'enabled');
  elsif k = 'profile' then
    if jsonb_typeof(mutation->'name') is distinct from 'string' or length(mutation->>'name') > 80 then raise exception 'Invalid name'; end if;
    perform voice_private.put_record(u,'profile','name',to_jsonb(trim(mutation->>'name')));
  elsif k in ('deleteAttempt','deleteSession') then
    i := mutation->>'id'; perform i::uuid;
    if i is null then raise exception 'Invalid id'; end if;
    if k='deleteAttempt' then
      select data->>'sessionId' into parent_id from public.voice_records where owner_id=u and kind='attempt' and id=i;
      perform voice_private.put_record(u,'attempt',i,null,true);
      if parent_id is not null then perform voice_private.put_record(u,'session',parent_id,null,true); end if;
    else
      perform voice_private.put_record(u,'session',i,null,true);
      update public.voice_records set data=null,deleted=true,updated_at=now()
        where owner_id=u and kind='attempt' and data->>'sessionId'=i;
    end if;
  elsif k = 'clear' then
    update public.voice_records set data=null,deleted=true,updated_at=now() where owner_id=u and kind in ('attempt','session');
  else raise exception 'Unknown mutation';
  end if;
  insert into voice_private.receipts values(u,operation_id,now());
end;
$$;
revoke all on function public.voice_apply(uuid,jsonb) from public, anon;
grant execute on function public.voice_apply(uuid,jsonb) to authenticated;

commit;
