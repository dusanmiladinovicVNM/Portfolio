\set ON_ERROR_STOP on

insert into public.properties (
  id, code, name, property_type, street, house_number,
  postal_code, city, country_code, year_built, status
) values (
  '11111111-1111-4111-8111-111111111111',
  'RECOVERY-PROP-1',
  'Recovery Rehearsal Property',
  'apartment_building',
  'Recovery Street',
  '41',
  '8000',
  'Zurich',
  'CH',
  2001,
  'active'
);

insert into public.units (
  id, property_id, code, unit_number, unit_type,
  floor, area_m2, rooms, status, notes
) values (
  '22222222-2222-4222-8222-222222222222',
  '11111111-1111-4111-8111-111111111111',
  'RECOVERY-UNIT-1',
  '1A',
  'apartment',
  '1',
  72.50,
  3.50,
  'vacant',
  'Recovery rehearsal canonical unit'
);

insert into public.documents (
  id, code, title, category, status, latest_version_number, revision
) values (
  '33333333-3333-4333-8333-333333333333',
  'RECOVERY-DOC-1',
  'Recovery binary identity proof',
  'technical',
  'active',
  1,
  1
);

insert into public.document_versions (
  id, document_id, version_number, file_name, mime_type,
  byte_size, sha256, status, finalized_at,
  storage_provider, storage_object_id, storage_object_key
) values (
  '44444444-4444-4444-8444-444444444444',
  '33333333-3333-4333-8333-333333333333',
  1,
  'recovery-proof.pdf',
  'application/pdf',
  4096,
  'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  'final',
  '2026-09-23T10:00:00Z',
  'google-drive',
  'drive-recovery-object-1',
  'document-version:44444444-4444-4444-8444-444444444444'
);
