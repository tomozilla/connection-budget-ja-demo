-- Local lab only: a private bucket for the Storage probe, and a policy that lets any signed-in user use it.
insert into storage.buckets (id, name, public) values ('lab', 'lab', false) on conflict do nothing;
drop policy if exists lab_all on storage.objects;
create policy lab_all on storage.objects for all to authenticated using (bucket_id = 'lab') with check (bucket_id = 'lab');
