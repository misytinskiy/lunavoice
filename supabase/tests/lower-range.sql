begin;
insert into auth.users values ('11111111-1111-4111-8111-111111111111','range@example.test');
set local role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
select public.voice_apply(gen_random_uuid(),'{"kind":"preferences","value":{"baseMidi":36}}');
select public.voice_apply(gen_random_uuid(),jsonb_build_object('kind','attempt','record',jsonb_build_object(
 'recordVersion',1,'id',gen_random_uuid(),'title','Low range','startedAt',now(),'status','incomplete',
 'practice',jsonb_build_object('exerciseId','descent','exerciseVersion',1,'baseMidi',36,'bpm',75),'audio','{}'::jsonb,'reason','')));
do $$ begin
 if (select count(*) from public.voice_records) <> 2 then raise exception 'Low-range records missing'; end if;
 begin
  perform public.voice_apply(gen_random_uuid(),'{"kind":"preferences","value":{"baseMidi":35}}');
  raise exception 'Out-of-range setting accepted';
 exception when raise_exception then
  if SQLERRM <> 'Invalid preference' then raise; end if;
 end;
end $$;
rollback;
