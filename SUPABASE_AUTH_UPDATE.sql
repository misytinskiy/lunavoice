-- Password and Google reauthentication for account deletion. Run after migration 001.
begin;
create or replace function public.voice_delete_account()
returns void language plpgsql security definer set search_path = '' as $$
declare u uuid := auth.uid();
begin
  if u is null or coalesce((select max((entry->>'timestamp')::bigint) from jsonb_array_elements(coalesce(auth.jwt()->'amr','[]'::jsonb)) entry where entry->>'method' in ('otp','password','oauth')),0) < extract(epoch from now()) - 900 then
    raise exception 'Sign in again before deleting your account' using errcode='42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(u::text,0));
  delete from auth.users where id=u;
end;
$$;
revoke all on function public.voice_delete_account() from public, anon;
grant execute on function public.voice_delete_account() to authenticated;
commit;
