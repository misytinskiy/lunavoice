begin;
insert into auth.users(id,email) values('44444444-4444-4444-8444-444444444444','password@example.test'),('55555555-5555-4555-8555-555555555555','google@example.test');
set local role authenticated;
select set_config('request.jwt.claim.sub','44444444-4444-4444-8444-444444444444',true);
select set_config('request.jwt.claims',jsonb_build_object('amr',jsonb_build_array(jsonb_build_object('method','password','timestamp',extract(epoch from now())::bigint - 1000)))::text,true);
do $$ begin
 begin perform public.voice_delete_account(); raise exception 'Stale password accepted';
 exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claims',jsonb_build_object('amr',jsonb_build_array(jsonb_build_object('method','password','timestamp',extract(epoch from now())::bigint)))::text,true);
select public.voice_delete_account();
select set_config('request.jwt.claim.sub','55555555-5555-4555-8555-555555555555',true);
select set_config('request.jwt.claims',jsonb_build_object('amr',jsonb_build_array(jsonb_build_object('method','oauth','timestamp',extract(epoch from now())::bigint)))::text,true);
select public.voice_delete_account();
reset role;
do $$ begin if exists(select 1 from auth.users where id in ('44444444-4444-4444-8444-444444444444','55555555-5555-4555-8555-555555555555')) then raise exception 'Accounts remain'; end if; end $$;
rollback;
