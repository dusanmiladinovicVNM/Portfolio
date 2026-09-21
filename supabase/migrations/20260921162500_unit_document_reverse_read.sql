begin;

create index if not exists document_links_unit_target_idx
  on public.document_links (unit_id, created_at, id)
  where target_type = 'unit';

comment on index public.document_links_unit_target_idx is
  'Reverse Unit dossier lookup for document links.';

commit;
