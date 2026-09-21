begin;

create index if not exists document_links_agreement_target_idx
  on public.document_links (lease_agreement_id, created_at, id)
  where target_type = 'lease_agreement';

create index if not exists document_links_amendment_target_idx
  on public.document_links (lease_amendment_id, created_at, id)
  where target_type = 'lease_amendment';

comment on index public.document_links_agreement_target_idx is
  'Reverse Contract dossier lookup for Agreement document links.';

comment on index public.document_links_amendment_target_idx is
  'Reverse Contract dossier lookup for Amendment document links.';

commit;
