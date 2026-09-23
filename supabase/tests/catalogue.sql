begin;
insert into auth.users values ('11111111-1111-4111-8111-111111111111','catalogue@example.test');
set local role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
select public.voice_apply(gen_random_uuid(),'{"kind":"preferences","value":{"lastExerciseId":"wide-arch","tempos":{"five-vowels":75,"minor-penta-down":90}}}');
select public.voice_apply(gen_random_uuid(),'{"kind":"favorite","id":"five-vowels","enabled":true}');
select public.voice_apply(gen_random_uuid(),jsonb_build_object('kind','attempt','record',jsonb_build_object(
 'recordVersion',1,'id',gen_random_uuid(),'title','Wide arch','startedAt',now(),'status','incomplete',
 'practice',jsonb_build_object('exerciseId','wide-arch','exerciseVersion',1,'baseMidi',48,'bpm',75),'audio','{}'::jsonb,'reason','')));
do $$ begin
 if (select count(*) from public.voice_records) <> 5 then raise exception 'Catalogue records missing'; end if;
 begin
  perform public.voice_apply(gen_random_uuid(),'{"kind":"favorite","id":"unknown-exercise","enabled":true}');
  raise exception 'Unknown exercise accepted';
 exception when raise_exception then
  if SQLERRM <> 'Invalid favorite' then raise; end if;
 end;
end $$;
rollback;
