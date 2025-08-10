-- Create private bucket for cached rasterized PNGs (idempotent)
insert into storage.buckets (id, name, public)
values ('studiocheck-pages', 'studiocheck-pages', false)
on conflict (id) do nothing;