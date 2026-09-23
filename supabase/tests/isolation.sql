-- Run only against a disposable local database; all fixture changes roll back.
begin;
insert into auth.users(id,email) values
 ('11111111-1111-4111-8111-111111111111','a@example.test'),
 ('22222222-2222-4222-8222-222222222222','b@example.test');
set local role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
select public.voice_apply('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','{"kind":"profile","name":"Alice"}');
select public.voice_apply('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','{"kind":"profile","name":"Duplicate must be ignored"}');
do $$ begin
 if (select data #>> '{}' from public.voice_records where kind='profile') <> 'Alice' then raise exception 'Duplicate operation changed profile'; end if;
end $$;
select public.voice_apply('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaab','{"kind":"preferences","value":{"volume":30,"reminder":false,"baseMidi":48,"lastExerciseId":"pulse","goalMinutes":5,"tempos":{"pulse":80}}}');
select public.voice_apply('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaac','{"kind":"preferences","value":{"goalMinutes":10}}');
do $$ begin
 if (select data from public.voice_records where id='volume') <> '30'::jsonb then raise exception 'Partial preference overwrote volume'; end if;
 begin
   insert into public.voice_records(owner_id,kind,id,data) values('11111111-1111-4111-8111-111111111111','profile','forged','"bad"');
   raise exception 'Direct insert allowed';
 exception when insufficient_privilege then null; end;
 begin
   update public.voice_records set data='"bad"'; raise exception 'Direct update allowed';
 exception when insufficient_privilege then null; end;
 begin
   delete from public.voice_records; raise exception 'Direct delete allowed';
 exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',true);
do $$ begin
 if exists(select 1 from public.voice_records) then raise exception 'User B can read user A'; end if;
end $$;
select public.voice_apply('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','{"kind":"profile","name":"Bob","owner_id":"11111111-1111-4111-8111-111111111111"}');
do $$ begin
 if exists(select 1 from public.voice_records where owner_id <> auth.uid()) then raise exception 'Owner injection succeeded'; end if;
 if (select count(*) from public.voice_records) <> 1 then raise exception 'Unexpected B record count'; end if;
end $$;
set local role anon;
do $$ begin
 begin
   perform * from public.voice_records; raise exception 'Anonymous read allowed';
 exception when insufficient_privilege then null; end;
 begin
   perform public.voice_apply(gen_random_uuid(),'{"kind":"profile","name":"Anonymous"}'); raise exception 'Anonymous RPC allowed';
 exception when insufficient_privilege then null; end;
end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
-- An incomplete attempt can finish once; stale offline updates cannot regress it.
select public.voice_apply(gen_random_uuid(),jsonb_build_object('kind','attempt','record',jsonb_build_object(
 'recordVersion',1,'id','33333333-3333-4333-8333-333333333333','title','Test','startedAt','2026-09-16T12:00:00Z','endedAt',null,'status','incomplete',
 'practice',jsonb_build_object('exerciseId','pulse','exerciseVersion',1,'baseMidi',48,'bpm',80),'audio','{}'::jsonb,'reason','','score',null,'result',null,'scoreVersion',null,'sessionId',null)));
select public.voice_apply(gen_random_uuid(),jsonb_build_object('kind','attempt','record',
 (select data || '{"status":"completed","endedAt":"2026-09-16T12:01:00Z","score":70}'::jsonb from public.voice_records where kind='attempt')));
select public.voice_apply(gen_random_uuid(),jsonb_build_object('kind','attempt','record',
 (select data || '{"status":"incomplete","endedAt":null,"score":null}'::jsonb from public.voice_records where kind='attempt')));
do $$ begin
 if (select data->>'status' from public.voice_records where kind='attempt') <> 'completed' then raise exception 'Terminal attempt regressed'; end if;
end $$;
-- Keep a copy and try to resurrect it after deletion.
select set_config('voice.test_record',(select data::text from public.voice_records where kind='attempt'),true);
select public.voice_apply(gen_random_uuid(),'{"kind":"deleteAttempt","id":"33333333-3333-4333-8333-333333333333"}');
select public.voice_apply(gen_random_uuid(),jsonb_build_object('kind','attempt','record',current_setting('voice.test_record')::jsonb));
do $$ begin
 if exists(select 1 from public.voice_records where kind='attempt' and not deleted) then raise exception 'Deleted attempt resurrected'; end if;
 begin
   perform public.voice_apply(gen_random_uuid(),'{"kind":"preferences","value":{"volume":1000}}');
   raise exception 'Invalid volume accepted';
 exception when raise_exception then if sqlerrm='Invalid volume accepted' then raise; end if; end;
end $$;
-- Fresh OTP is required to delete an account. Remaining JWT cannot create records again.
select set_config('request.jwt.claims','{}',true);
do $$ begin
 begin
   perform public.voice_delete_account(); raise exception 'Deletion without fresh OTP succeeded';
 exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claims',jsonb_build_object('amr',jsonb_build_array(jsonb_build_object('method','otp','timestamp',extract(epoch from now())::bigint)))::text,true);
select public.voice_delete_account();
do $$ begin
 if exists(select 1 from public.voice_records) then raise exception 'Deleted account still has records'; end if;
 begin
   perform public.voice_apply(gen_random_uuid(),'{"kind":"profile","name":"Resurrect"}'); raise exception 'Deleted user wrote via old token';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$ begin
 if (select count(*) from auth.users where id='22222222-2222-4222-8222-222222222222') <> 1 then raise exception 'Other account was deleted'; end if;
 if (select data #>> '{}' from public.voice_records where owner_id='22222222-2222-4222-8222-222222222222' and kind='profile') <> 'Bob' then raise exception 'Other account modified'; end if;
 if exists(select 1 from voice_private.receipts where owner_id='11111111-1111-4111-8111-111111111111') then raise exception 'Receipts did not cascade'; end if;
end $$;
rollback;
