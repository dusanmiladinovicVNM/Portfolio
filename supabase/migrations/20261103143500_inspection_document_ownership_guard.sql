begin;

-- P1 #126: an Inspection write may not bind a DocumentVersion belonging to
-- another Inspection. Keep existing immutable rows unchanged and validate new
-- evidence/signature/final-report references on the canonical DB boundary.
-- Lock the parent Document while validating to serialize competing inserts
-- referring to different versions of the same Document.
create or replace function public.guard_inspection_document_ownership()
returns trigger
language plpgsql
as $inspection_document_owner$
declare
  v_version_id uuid;
  v_document_id uuid;
  v_code text;
  v_category text;
  v_purpose text;
  v_expected_code text;
begin
  if tg_table_name = 'inspection_signatures' then
    v_version_id := new.signature_document_version_id;
    v_purpose := 'signature';
  else
    v_version_id := new.document_version_id;
    v_purpose := new.kind;
  end if;

  select d.id, d.code, d.category
    into v_document_id, v_code, v_category
  from public.document_versions v
  join public.documents d on d.id = v.document_id
  where v.id = v_version_id
  for update of d;

  if v_document_id is null then
    raise exception 'Inspection DocumentVersion does not exist.'
      using errcode = '23514',
            constraint = 'inspection_document_owner_mismatch';
  end if;

  if v_purpose = 'final_report' then
    v_expected_code := 'INSPECTION-FINAL-' || new.inspection_id::text;
    if lower(v_code) <> lower(v_expected_code) or v_category <> 'inspection' then
      raise exception 'Final report document belongs to another Inspection.'
        using errcode = '23514',
              constraint = 'inspection_document_owner_mismatch';
    end if;
  elsif v_purpose = 'signature' then
    v_expected_code := 'INSPECTION-' || new.inspection_id::text
                       || '-signature-' || v_version_id::text;
    if lower(v_code) <> lower(v_expected_code) or v_category <> 'signature' then
      raise exception 'Signature document belongs to another Inspection.'
        using errcode = '23514',
              constraint = 'inspection_document_owner_mismatch';
    end if;
  elsif v_purpose in ('photo', 'attachment') then
    if lower(v_code) like 'inspection-%' then
      v_expected_code := 'INSPECTION-' || new.inspection_id::text
                         || '-' || v_purpose || '-' || v_version_id::text;
      if lower(v_code) <> lower(v_expected_code)
         or (v_purpose = 'photo' and v_category <> 'photo')
         or (v_purpose = 'attachment' and v_category <> 'inspection')
      then
        raise exception 'Scoped evidence document belongs to another Inspection.'
          using errcode = '23514',
                constraint = 'inspection_document_owner_mismatch';
      end if;
    elsif v_category in ('signature', 'inspection')
       or (v_purpose = 'photo' and v_category <> 'photo')
    then
      raise exception 'Unscoped documents cannot be used for Inspection signature/report evidence.'
        using errcode = '23514',
              constraint = 'inspection_document_owner_mismatch';
    end if;
  end if;

  if exists (
    select 1
    from public.inspection_evidence e
    join public.document_versions v on v.id = e.document_version_id
    where v.document_id = v_document_id
      and e.inspection_id <> new.inspection_id
  ) or exists (
    select 1
    from public.inspection_signatures s
    join public.document_versions v on v.id = s.signature_document_version_id
    where v.document_id = v_document_id
      and s.inspection_id <> new.inspection_id
  ) then
    raise exception 'Document is already bound to another Inspection.'
      using errcode = '23514',
            constraint = 'inspection_document_owner_mismatch';
  end if;

  return new;
end;
$inspection_document_owner$;

create trigger aa_inspection_evidence_document_owner_trg
before insert on public.inspection_evidence
for each row execute function public.guard_inspection_document_ownership();

create trigger aa_inspection_signature_document_owner_trg
before insert on public.inspection_signatures
for each row execute function public.guard_inspection_document_ownership();

commit;
