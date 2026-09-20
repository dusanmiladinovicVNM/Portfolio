begin;

create view public.unit_business_events as
with
document_link_scope as (
  select
    dl.*,
    case dl.target_type
      when 'unit' then dl.unit_id
      when 'tenancy' then t.unit_id
      when 'lease_agreement' then lt.unit_id
      when 'lease_amendment' then lat.unit_id
      else null
    end as resolved_unit_id,
    case dl.target_type
      when 'unit' then dl.unit_id::text
      when 'tenancy' then dl.tenancy_id::text
      when 'lease_agreement' then dl.lease_agreement_id::text
      when 'lease_amendment' then dl.lease_amendment_id::text
      else null
    end as target_id
  from public.document_links dl
  left join public.tenancies t
    on dl.target_type = 'tenancy'
   and t.id = dl.tenancy_id
  left join public.lease_agreements la
    on dl.target_type = 'lease_agreement'
   and la.id = dl.lease_agreement_id
  left join public.tenancies lt
    on lt.id = la.tenancy_id
  left join public.lease_amendments lam
    on dl.target_type = 'lease_amendment'
   and lam.id = dl.lease_amendment_id
  left join public.lease_agreements laa
    on laa.id = lam.agreement_id
  left join public.tenancies lat
    on lat.id = laa.tenancy_id
),
cost_scope as (
  select
    c.*,
    case c.source_kind
      when 'unit' then c.unit_id
      when 'space' then cs.unit_id
      when 'improvement_project' then cip.unit_id
      when 'work_item' then ciwp.unit_id
      when 'work_record' then ciwrp.unit_id
      when 'work_material' then ciwmp.unit_id
      when 'maintenance_issue' then cmi.unit_id
      when 'maintenance_work_order' then cmiwo.unit_id
      else null
    end as resolved_unit_id
  from public.costs c
  left join public.spaces cs
    on c.source_kind = 'space'
   and cs.id = c.space_id
  left join public.improvement_projects cip
    on c.source_kind = 'improvement_project'
   and cip.id = c.improvement_project_id
  left join public.improvement_work_items ciwi
    on c.source_kind = 'work_item'
   and ciwi.id = c.work_item_id
  left join public.improvement_projects ciwp
    on ciwp.id = ciwi.project_id
  left join public.improvement_work_records ciwr
    on c.source_kind = 'work_record'
   and ciwr.id = c.work_record_id
  left join public.improvement_projects ciwrp
    on ciwrp.id = ciwr.project_id
  left join public.improvement_work_materials ciwm
    on c.source_kind = 'work_material'
   and ciwm.id = c.work_material_id
  left join public.improvement_work_records ciwmr
    on ciwmr.id = ciwm.work_record_id
  left join public.improvement_projects ciwmp
    on ciwmp.id = ciwmr.project_id
  left join public.maintenance_issues cmi
    on c.source_kind = 'maintenance_issue'
   and cmi.id = c.maintenance_issue_id
  left join public.maintenance_work_orders cmwo
    on c.source_kind = 'maintenance_work_order'
   and cmwo.id = c.maintenance_work_order_id
  left join public.maintenance_issues cmiwo
    on cmiwo.id = cmwo.issue_id
),
events as (
  -- Tenancy: stable creation instant + durable date-only business boundaries.
  select
    'tenancy.created:' || t.id::text as event_key,
    t.unit_id,
    'tenancy'::text as category,
    'tenancy.created'::text as event_type,
    'instant'::text as precision,
    (timezone('UTC', t.created_at))::date as occurred_on,
    t.created_at as occurred_at,
    t.created_at as recorded_at,
    null::uuid as recorded_by_user_id,
    'tenancy'::text as source_type,
    t.id::text as source_id,
    null::text as related_entity_type,
    null::text as related_entity_id,
    jsonb_build_object(
      'code', t.code
    ) as details
  from public.tenancies t

  union all
  select
    'tenancy.started:' || t.id::text,
    t.unit_id,
    'tenancy',
    'tenancy.started',
    'date',
    t.actual_start,
    null::timestamptz,
    null::timestamptz,
    null::uuid,
    'tenancy',
    t.id::text,
    null::text,
    null::text,
    jsonb_build_object('code', t.code)
  from public.tenancies t
  where t.actual_start is not null

  union all
  select
    'tenancy.notice_given:' || t.id::text,
    t.unit_id,
    'tenancy',
    'tenancy.notice_given',
    'date',
    t.notice_given_at,
    null::timestamptz,
    null::timestamptz,
    null::uuid,
    'tenancy',
    t.id::text,
    null::text,
    null::text,
    jsonb_build_object('code', t.code)
  from public.tenancies t
  where t.notice_given_at is not null

  union all
  select
    'tenancy.termination_effective:' || t.id::text,
    t.unit_id,
    'tenancy',
    'tenancy.termination_effective',
    'date',
    t.termination_effective_at,
    null::timestamptz,
    null::timestamptz,
    null::uuid,
    'tenancy',
    t.id::text,
    null::text,
    null::text,
    jsonb_build_object('code', t.code)
  from public.tenancies t
  where t.termination_effective_at is not null

  union all
  select
    'tenancy.ended:' || t.id::text,
    t.unit_id,
    'tenancy',
    'tenancy.ended',
    'date',
    t.actual_end,
    null::timestamptz,
    null::timestamptz,
    null::uuid,
    'tenancy',
    t.id::text,
    null::text,
    null::text,
    jsonb_build_object('code', t.code)
  from public.tenancies t
  where t.actual_end is not null

  -- Lease / legal terms.
  union all
  select
    'lease.created:' || a.id::text,
    t.unit_id,
    'lease',
    'lease.created',
    'instant',
    (timezone('UTC', a.created_at))::date,
    a.created_at,
    a.created_at,
    null::uuid,
    'lease_agreement',
    a.id::text,
    'tenancy',
    t.id::text,
    jsonb_build_object(
      'code', a.code,
      'agreementType', a.agreement_type
    )
  from public.lease_agreements a
  join public.tenancies t on t.id = a.tenancy_id

  union all
  select
    'lease.signed:' || a.id::text,
    t.unit_id,
    'lease',
    'lease.signed',
    'date',
    a.signed_at,
    null::timestamptz,
    null::timestamptz,
    null::uuid,
    'lease_agreement',
    a.id::text,
    'tenancy',
    t.id::text,
    jsonb_build_object('code', a.code)
  from public.lease_agreements a
  join public.tenancies t on t.id = a.tenancy_id
  where a.signed_at is not null

  union all
  select
    'lease.effective_started:' || a.id::text,
    t.unit_id,
    'lease',
    'lease.effective_started',
    'date',
    a.effective_from,
    null::timestamptz,
    null::timestamptz,
    null::uuid,
    'lease_agreement',
    a.id::text,
    'tenancy',
    t.id::text,
    jsonb_build_object('code', a.code)
  from public.lease_agreements a
  join public.tenancies t on t.id = a.tenancy_id

  union all
  select
    'lease.effective_ended:' || a.id::text,
    t.unit_id,
    'lease',
    'lease.effective_ended',
    'date',
    a.effective_to,
    null::timestamptz,
    null::timestamptz,
    null::uuid,
    'lease_agreement',
    a.id::text,
    'tenancy',
    t.id::text,
    jsonb_build_object('code', a.code)
  from public.lease_agreements a
  join public.tenancies t on t.id = a.tenancy_id
  where a.effective_to is not null

  union all
  select
    'lease_amendment.created:' || am.id::text,
    t.unit_id,
    'lease',
    'lease_amendment.created',
    'instant',
    (timezone('UTC', am.created_at))::date,
    am.created_at,
    am.created_at,
    null::uuid,
    'lease_amendment',
    am.id::text,
    'lease_agreement',
    a.id::text,
    jsonb_build_object(
      'code', am.code,
      'title', am.title
    )
  from public.lease_amendments am
  join public.lease_agreements a on a.id = am.agreement_id
  join public.tenancies t on t.id = a.tenancy_id

  union all
  select
    'lease_amendment.signed:' || am.id::text,
    t.unit_id,
    'lease',
    'lease_amendment.signed',
    'date',
    am.signed_at,
    null::timestamptz,
    null::timestamptz,
    null::uuid,
    'lease_amendment',
    am.id::text,
    'lease_agreement',
    a.id::text,
    jsonb_build_object(
      'code', am.code,
      'title', am.title
    )
  from public.lease_amendments am
  join public.lease_agreements a on a.id = am.agreement_id
  join public.tenancies t on t.id = a.tenancy_id
  where am.signed_at is not null

  union all
  select
    'lease_amendment.effective_started:' || am.id::text,
    t.unit_id,
    'lease',
    'lease_amendment.effective_started',
    'date',
    am.effective_from,
    null::timestamptz,
    null::timestamptz,
    null::uuid,
    'lease_amendment',
    am.id::text,
    'lease_agreement',
    a.id::text,
    jsonb_build_object(
      'code', am.code,
      'title', am.title
    )
  from public.lease_amendments am
  join public.lease_agreements a on a.id = am.agreement_id
  join public.tenancies t on t.id = a.tenancy_id

  union all
  select
    'tenancy_terms.effective_started:' || tv.id::text,
    t.unit_id,
    'lease',
    'tenancy_terms.effective_started',
    'date',
    tv.effective_from,
    null::timestamptz,
    tv.created_at,
    null::uuid,
    'tenancy_term_version',
    tv.id::text,
    'tenancy',
    t.id::text,
    jsonb_build_object(
      'sourceType', tv.source_type,
      'currency', tv.currency,
      'baseRent', tv.base_rent::text,
      'serviceCharge', tv.service_charge::text,
      'utilitiesAdvance', tv.utilities_advance::text
    )
  from public.tenancy_term_versions tv
  join public.tenancies t on t.id = tv.tenancy_id

  -- Document relationship creation. Property/Party links have no exact Unit.
  union all
  select
    'document.linked:' || dls.id::text,
    dls.resolved_unit_id,
    'document',
    'document.linked',
    'instant',
    (timezone('UTC', dls.created_at))::date,
    dls.created_at,
    dls.created_at,
    null::uuid,
    'document_link',
    dls.id::text,
    dls.target_type,
    dls.target_id,
    jsonb_build_object(
      'documentId', dls.document_id::text,
      'documentVersionId', dls.document_version_id::text,
      'relation', dls.relation,
      'targetType', dls.target_type
    )
  from document_link_scope dls
  where dls.resolved_unit_id is not null

  -- Inspection workflow.
  union all
  select
    'inspection.created:' || i.id::text,
    i.unit_id,
    'inspection',
    'inspection.created',
    'instant',
    (timezone('UTC', i.created_at))::date,
    i.created_at,
    i.created_at,
    i.created_by_user_id,
    'inspection',
    i.id::text,
    case when i.tenancy_id is null then null else 'tenancy' end,
    i.tenancy_id::text,
    jsonb_build_object(
      'code', i.code,
      'inspectionType', i.inspection_type
    )
  from public.inspections i

  union all
  select
    'inspection.started:' || i.id::text,
    i.unit_id,
    'inspection',
    'inspection.started',
    'instant',
    (timezone('UTC', i.started_at))::date,
    i.started_at,
    null::timestamptz,
    null::uuid,
    'inspection',
    i.id::text,
    case when i.tenancy_id is null then null else 'tenancy' end,
    i.tenancy_id::text,
    jsonb_build_object('code', i.code)
  from public.inspections i
  where i.started_at is not null

  union all
  select
    'inspection.locked:' || i.id::text,
    i.unit_id,
    'inspection',
    'inspection.locked',
    'instant',
    (timezone('UTC', i.locked_at))::date,
    i.locked_at,
    null::timestamptz,
    null::uuid,
    'inspection',
    i.id::text,
    case when i.tenancy_id is null then null else 'tenancy' end,
    i.tenancy_id::text,
    jsonb_build_object('code', i.code)
  from public.inspections i
  where i.locked_at is not null

  union all
  select
    'inspection.finalized:' || i.id::text,
    i.unit_id,
    'inspection',
    'inspection.finalized',
    'instant',
    (timezone('UTC', i.finalized_at))::date,
    i.finalized_at,
    null::timestamptz,
    null::uuid,
    'inspection',
    i.id::text,
    case when i.tenancy_id is null then null else 'tenancy' end,
    i.tenancy_id::text,
    jsonb_build_object('code', i.code)
  from public.inspections i
  where i.finalized_at is not null

  union all
  select
    'inspection.cancelled:' || i.id::text,
    i.unit_id,
    'inspection',
    'inspection.cancelled',
    'instant',
    (timezone('UTC', i.cancelled_at))::date,
    i.cancelled_at,
    null::timestamptz,
    null::uuid,
    'inspection',
    i.id::text,
    case when i.tenancy_id is null then null else 'tenancy' end,
    i.tenancy_id::text,
    jsonb_build_object('code', i.code)
  from public.inspections i
  where i.cancelled_at is not null

  union all
  select
    'inspection.finding_created:' || f.id::text,
    i.unit_id,
    'inspection',
    'inspection.finding_created',
    'instant',
    (timezone('UTC', f.created_at))::date,
    f.created_at,
    f.created_at,
    f.created_by_user_id,
    'inspection_finding',
    f.id::text,
    'inspection',
    i.id::text,
    jsonb_build_object(
      'severity', f.severity,
      'title', f.title
    )
  from public.inspection_findings f
  join public.inspections i on i.id = f.inspection_id

  -- Asset historical location and condition.
  union all
  select
    'asset.location_started:' || h.id::text,
    h.unit_id,
    'asset',
    'asset.location_started',
    'instant',
    (timezone('UTC', h.valid_from))::date,
    h.valid_from,
    h.created_at,
    h.changed_by_user_id,
    'asset_location_history',
    h.id::text,
    'asset',
    h.asset_id::text,
    jsonb_build_object(
      'assetId', h.asset_id::text,
      'spaceId', h.space_id::text,
      'changeType', h.change_type,
      'reason', h.reason
    )
  from public.asset_location_history h
  where h.unit_id is not null

  union all
  select
    'asset.location_ended:' || h.id::text,
    h.unit_id,
    'asset',
    'asset.location_ended',
    'instant',
    (timezone('UTC', h.valid_to))::date,
    h.valid_to,
    null::timestamptz,
    null::uuid,
    'asset_location_history',
    h.id::text,
    'asset',
    h.asset_id::text,
    jsonb_build_object(
      'assetId', h.asset_id::text,
      'spaceId', h.space_id::text
    )
  from public.asset_location_history h
  where h.unit_id is not null
    and h.valid_to is not null

  union all
  select
    'asset.condition_assessed:' || ca.id::text,
    h.unit_id,
    'asset',
    'asset.condition_assessed',
    'instant',
    (timezone('UTC', ca.assessed_at))::date,
    ca.assessed_at,
    ca.created_at,
    ca.assessed_by_user_id,
    'asset_condition_assessment',
    ca.id::text,
    'asset',
    ca.asset_id::text,
    jsonb_build_object(
      'condition', ca.condition,
      'notes', ca.notes
    )
  from public.asset_condition_assessments ca
  join public.asset_location_history h
    on h.asset_id = ca.asset_id
   and ca.assessed_at >= h.valid_from
   and (h.valid_to is null or ca.assessed_at < h.valid_to)
  where h.unit_id is not null

  union all
  select
    'asset.inventory_move_in_recorded:' || a.id::text,
    t.unit_id,
    'asset',
    'asset.inventory_move_in_recorded',
    'instant',
    (timezone('UTC', a.move_in_recorded_at))::date,
    a.move_in_recorded_at,
    a.move_in_recorded_at,
    a.move_in_recorded_by_user_id,
    'tenancy_asset_assignment',
    a.id::text,
    'asset',
    a.asset_id::text,
    jsonb_build_object(
      'presence', a.move_in_presence,
      'notes', a.move_in_notes
    )
  from public.tenancy_asset_assignments a
  join public.tenancies t on t.id = a.tenancy_id
  where a.move_in_recorded_at is not null

  union all
  select
    'asset.inventory_move_out_recorded:' || a.id::text,
    t.unit_id,
    'asset',
    'asset.inventory_move_out_recorded',
    'instant',
    (timezone('UTC', a.move_out_recorded_at))::date,
    a.move_out_recorded_at,
    a.move_out_recorded_at,
    a.move_out_recorded_by_user_id,
    'tenancy_asset_assignment',
    a.id::text,
    'asset',
    a.asset_id::text,
    jsonb_build_object(
      'presence', a.move_out_presence,
      'notes', a.move_out_notes
    )
  from public.tenancy_asset_assignments a
  join public.tenancies t on t.id = a.tenancy_id
  where a.move_out_recorded_at is not null

  -- Warranty claim lifecycle and exact service occurrences resolve through
  -- Asset historical location at each exact instant.
  union all
  select
    'warranty_claim.submitted:' || c.id::text,
    h.unit_id,
    'service',
    'warranty_claim.submitted',
    'instant',
    (timezone('UTC', c.submitted_at))::date,
    c.submitted_at,
    null::timestamptz,
    null::uuid,
    'warranty_claim',
    c.id::text,
    'asset',
    w.asset_id::text,
    jsonb_build_object(
      'providerReference', c.provider_reference
    )
  from public.asset_warranty_claims c
  join public.asset_warranties w on w.id = c.warranty_id
  join public.asset_location_history h
    on h.asset_id = w.asset_id
   and c.submitted_at >= h.valid_from
   and (h.valid_to is null or c.submitted_at < h.valid_to)
  where c.submitted_at is not null
    and h.unit_id is not null

  union all
  select
    'warranty_claim.resolved:' || c.id::text,
    h.unit_id,
    'service',
    'warranty_claim.resolved',
    'instant',
    (timezone('UTC', c.resolved_at))::date,
    c.resolved_at,
    null::timestamptz,
    null::uuid,
    'warranty_claim',
    c.id::text,
    'asset',
    w.asset_id::text,
    '{}'::jsonb
  from public.asset_warranty_claims c
  join public.asset_warranties w on w.id = c.warranty_id
  join public.asset_location_history h
    on h.asset_id = w.asset_id
   and c.resolved_at >= h.valid_from
   and (h.valid_to is null or c.resolved_at < h.valid_to)
  where c.resolved_at is not null
    and h.unit_id is not null

  union all
  select
    'warranty_claim.closed:' || c.id::text,
    h.unit_id,
    'service',
    'warranty_claim.closed',
    'instant',
    (timezone('UTC', c.closed_at))::date,
    c.closed_at,
    null::timestamptz,
    null::uuid,
    'warranty_claim',
    c.id::text,
    'asset',
    w.asset_id::text,
    '{}'::jsonb
  from public.asset_warranty_claims c
  join public.asset_warranties w on w.id = c.warranty_id
  join public.asset_location_history h
    on h.asset_id = w.asset_id
   and c.closed_at >= h.valid_from
   and (h.valid_to is null or c.closed_at < h.valid_to)
  where c.closed_at is not null
    and h.unit_id is not null

  union all
  select
    'warranty_claim.cancelled:' || c.id::text,
    h.unit_id,
    'service',
    'warranty_claim.cancelled',
    'instant',
    (timezone('UTC', c.cancelled_at))::date,
    c.cancelled_at,
    null::timestamptz,
    null::uuid,
    'warranty_claim',
    c.id::text,
    'asset',
    w.asset_id::text,
    '{}'::jsonb
  from public.asset_warranty_claims c
  join public.asset_warranties w on w.id = c.warranty_id
  join public.asset_location_history h
    on h.asset_id = w.asset_id
   and c.cancelled_at >= h.valid_from
   and (h.valid_to is null or c.cancelled_at < h.valid_to)
  where c.cancelled_at is not null
    and h.unit_id is not null

  union all
  select
    'service.performed:' || s.id::text,
    h.unit_id,
    'service',
    'service.performed',
    'instant',
    (timezone('UTC', s.performed_at))::date,
    s.performed_at,
    s.recorded_at,
    s.recorded_by_user_id,
    'service_event',
    s.id::text,
    'asset',
    s.asset_id::text,
    jsonb_build_object(
      'eventType', s.event_type,
      'description', s.description,
      'reference', s.reference
    )
  from public.asset_service_events s
  join public.asset_location_history h
    on h.asset_id = s.asset_id
   and s.performed_at >= h.valid_from
   and (h.valid_to is null or s.performed_at < h.valid_to)
  where h.unit_id is not null

  -- Improvements only when project has an explicit Unit scope.
  union all
  select
    'improvement.created:' || p.id::text,
    p.unit_id,
    'improvement',
    'improvement.created',
    'instant',
    (timezone('UTC', p.created_at))::date,
    p.created_at,
    p.created_at,
    p.created_by_user_id,
    'improvement_project',
    p.id::text,
    null::text,
    null::text,
    jsonb_build_object('code', p.code, 'name', p.name)
  from public.improvement_projects p
  where p.unit_id is not null

  union all
  select
    'improvement.planned:' || p.id::text,
    p.unit_id,
    'improvement',
    'improvement.planned',
    'instant',
    (timezone('UTC', p.planned_at))::date,
    p.planned_at,
    null::timestamptz,
    null::uuid,
    'improvement_project',
    p.id::text,
    null::text,
    null::text,
    jsonb_build_object('code', p.code, 'name', p.name)
  from public.improvement_projects p
  where p.unit_id is not null and p.planned_at is not null

  union all
  select
    'improvement.started:' || p.id::text,
    p.unit_id,
    'improvement',
    'improvement.started',
    'instant',
    (timezone('UTC', p.started_at))::date,
    p.started_at,
    null::timestamptz,
    null::uuid,
    'improvement_project',
    p.id::text,
    null::text,
    null::text,
    jsonb_build_object('code', p.code, 'name', p.name)
  from public.improvement_projects p
  where p.unit_id is not null and p.started_at is not null

  union all
  select
    'improvement.completed:' || p.id::text,
    p.unit_id,
    'improvement',
    'improvement.completed',
    'instant',
    (timezone('UTC', p.completed_at))::date,
    p.completed_at,
    null::timestamptz,
    null::uuid,
    'improvement_project',
    p.id::text,
    null::text,
    null::text,
    jsonb_build_object('code', p.code, 'name', p.name)
  from public.improvement_projects p
  where p.unit_id is not null and p.completed_at is not null

  union all
  select
    'improvement.cancelled:' || p.id::text,
    p.unit_id,
    'improvement',
    'improvement.cancelled',
    'instant',
    (timezone('UTC', p.cancelled_at))::date,
    p.cancelled_at,
    null::timestamptz,
    null::uuid,
    'improvement_project',
    p.id::text,
    null::text,
    null::text,
    jsonb_build_object('code', p.code, 'name', p.name)
  from public.improvement_projects p
  where p.unit_id is not null and p.cancelled_at is not null

  union all
  select
    'work_item.created:' || wi.id::text,
    p.unit_id,
    'improvement',
    'work_item.created',
    'instant',
    (timezone('UTC', wi.created_at))::date,
    wi.created_at,
    wi.created_at,
    wi.created_by_user_id,
    'work_item',
    wi.id::text,
    'improvement_project',
    p.id::text,
    jsonb_build_object('code', wi.code, 'title', wi.title)
  from public.improvement_work_items wi
  join public.improvement_projects p on p.id = wi.project_id
  where p.unit_id is not null

  union all
  select
    'work_item.started:' || wi.id::text,
    p.unit_id,
    'improvement',
    'work_item.started',
    'instant',
    (timezone('UTC', wi.started_at))::date,
    wi.started_at,
    null::timestamptz,
    null::uuid,
    'work_item',
    wi.id::text,
    'improvement_project',
    p.id::text,
    jsonb_build_object('code', wi.code, 'title', wi.title)
  from public.improvement_work_items wi
  join public.improvement_projects p on p.id = wi.project_id
  where p.unit_id is not null and wi.started_at is not null

  union all
  select
    'work_item.completed:' || wi.id::text,
    p.unit_id,
    'improvement',
    'work_item.completed',
    'instant',
    (timezone('UTC', wi.completed_at))::date,
    wi.completed_at,
    null::timestamptz,
    null::uuid,
    'work_item',
    wi.id::text,
    'improvement_project',
    p.id::text,
    jsonb_build_object('code', wi.code, 'title', wi.title)
  from public.improvement_work_items wi
  join public.improvement_projects p on p.id = wi.project_id
  where p.unit_id is not null and wi.completed_at is not null

  union all
  select
    'work_item.cancelled:' || wi.id::text,
    p.unit_id,
    'improvement',
    'work_item.cancelled',
    'instant',
    (timezone('UTC', wi.cancelled_at))::date,
    wi.cancelled_at,
    null::timestamptz,
    null::uuid,
    'work_item',
    wi.id::text,
    'improvement_project',
    p.id::text,
    jsonb_build_object('code', wi.code, 'title', wi.title)
  from public.improvement_work_items wi
  join public.improvement_projects p on p.id = wi.project_id
  where p.unit_id is not null and wi.cancelled_at is not null

  union all
  select
    'work_record.performed:' || wr.id::text,
    p.unit_id,
    'improvement',
    'work_record.performed',
    'instant',
    (timezone('UTC', wr.performed_at))::date,
    wr.performed_at,
    wr.recorded_at,
    wr.recorded_by_user_id,
    'work_record',
    wr.id::text,
    'work_item',
    wr.work_item_id::text,
    jsonb_build_object(
      'description', wr.description,
      'reference', wr.reference
    )
  from public.improvement_work_records wr
  join public.improvement_projects p on p.id = wr.project_id
  where p.unit_id is not null

  -- Costs only when Unit attribution is explicit and stable.
  union all
  select
    'cost.incurred:' || c.id::text,
    c.resolved_unit_id,
    'cost',
    'cost.incurred',
    'date',
    c.incurred_on,
    null::timestamptz,
    c.recorded_at,
    c.recorded_by_user_id,
    'cost',
    c.id::text,
    c.source_kind,
    case c.source_kind
      when 'unit' then c.unit_id::text
      when 'space' then c.space_id::text
      when 'improvement_project' then c.improvement_project_id::text
      when 'work_item' then c.work_item_id::text
      when 'work_record' then c.work_record_id::text
      when 'work_material' then c.work_material_id::text
      when 'maintenance_issue' then c.maintenance_issue_id::text
      when 'maintenance_work_order' then c.maintenance_work_order_id::text
      else null
    end,
    jsonb_build_object(
      'description', c.description,
      'amount', c.amount::text,
      'currency', c.currency,
      'reportingClass', c.reporting_class,
      'sourceKind', c.source_kind,
      'invoiceReference', c.invoice_reference
    )
  from cost_scope c
  where c.resolved_unit_id is not null

  union all
  select
    'cost.reversed:' || r.id::text,
    c.resolved_unit_id,
    'cost',
    'cost.reversed',
    'instant',
    (timezone('UTC', r.recorded_at))::date,
    r.recorded_at,
    r.recorded_at,
    r.recorded_by_user_id,
    'cost_reversal',
    r.id::text,
    'cost',
    c.id::text,
    jsonb_build_object(
      'reason', r.reason,
      'replacementCostId', r.replacement_cost_id::text,
      'amount', c.amount::text,
      'currency', c.currency
    )
  from public.cost_reversals r
  join cost_scope c on c.id = r.cost_id
  where c.resolved_unit_id is not null

  -- Maintenance explicit Unit snapshot.
  union all
  select
    'maintenance_issue.reported:' || i.id::text,
    i.unit_id,
    'maintenance',
    'maintenance_issue.reported',
    'instant',
    (timezone('UTC', i.reported_at))::date,
    i.reported_at,
    i.recorded_at,
    i.recorded_by_user_id,
    'maintenance_issue',
    i.id::text,
    case when i.asset_id is null then null else 'asset' end,
    i.asset_id::text,
    jsonb_build_object(
      'code', i.code,
      'title', i.title,
      'priority', i.priority
    )
  from public.maintenance_issues i
  where i.unit_id is not null

  union all
  select
    'maintenance_issue.resolved:' || i.id::text,
    i.unit_id,
    'maintenance',
    'maintenance_issue.resolved',
    'instant',
    (timezone('UTC', i.resolved_at))::date,
    i.resolved_at,
    null::timestamptz,
    null::uuid,
    'maintenance_issue',
    i.id::text,
    case when i.asset_id is null then null else 'asset' end,
    i.asset_id::text,
    jsonb_build_object('code', i.code, 'title', i.title)
  from public.maintenance_issues i
  where i.unit_id is not null and i.resolved_at is not null

  union all
  select
    'maintenance_issue.cancelled:' || i.id::text,
    i.unit_id,
    'maintenance',
    'maintenance_issue.cancelled',
    'instant',
    (timezone('UTC', i.cancelled_at))::date,
    i.cancelled_at,
    null::timestamptz,
    null::uuid,
    'maintenance_issue',
    i.id::text,
    case when i.asset_id is null then null else 'asset' end,
    i.asset_id::text,
    jsonb_build_object('code', i.code, 'title', i.title)
  from public.maintenance_issues i
  where i.unit_id is not null and i.cancelled_at is not null

  union all
  select
    'maintenance_work_order.created:' || w.id::text,
    i.unit_id,
    'maintenance',
    'maintenance_work_order.created',
    'instant',
    (timezone('UTC', w.created_at))::date,
    w.created_at,
    w.created_at,
    w.created_by_user_id,
    'maintenance_work_order',
    w.id::text,
    'maintenance_issue',
    i.id::text,
    jsonb_build_object('code', w.code, 'title', w.title)
  from public.maintenance_work_orders w
  join public.maintenance_issues i on i.id = w.issue_id
  where i.unit_id is not null

  union all
  select
    'maintenance_work_order.assigned:' || w.id::text,
    i.unit_id,
    'maintenance',
    'maintenance_work_order.assigned',
    'instant',
    (timezone('UTC', w.assigned_at))::date,
    w.assigned_at,
    null::timestamptz,
    null::uuid,
    'maintenance_work_order',
    w.id::text,
    'maintenance_issue',
    i.id::text,
    jsonb_build_object(
      'code', w.code,
      'title', w.title,
      'assigneeKind', w.assignee_kind
    )
  from public.maintenance_work_orders w
  join public.maintenance_issues i on i.id = w.issue_id
  where i.unit_id is not null and w.assigned_at is not null

  union all
  select
    'maintenance_work_order.started:' || w.id::text,
    i.unit_id,
    'maintenance',
    'maintenance_work_order.started',
    'instant',
    (timezone('UTC', w.started_at))::date,
    w.started_at,
    null::timestamptz,
    null::uuid,
    'maintenance_work_order',
    w.id::text,
    'maintenance_issue',
    i.id::text,
    jsonb_build_object('code', w.code, 'title', w.title)
  from public.maintenance_work_orders w
  join public.maintenance_issues i on i.id = w.issue_id
  where i.unit_id is not null and w.started_at is not null

  union all
  select
    'maintenance_work_order.completed:' || w.id::text,
    i.unit_id,
    'maintenance',
    'maintenance_work_order.completed',
    'instant',
    (timezone('UTC', w.completed_at))::date,
    w.completed_at,
    null::timestamptz,
    null::uuid,
    'maintenance_work_order',
    w.id::text,
    'maintenance_issue',
    i.id::text,
    jsonb_build_object('code', w.code, 'title', w.title)
  from public.maintenance_work_orders w
  join public.maintenance_issues i on i.id = w.issue_id
  where i.unit_id is not null and w.completed_at is not null

  union all
  select
    'maintenance_work_order.cancelled:' || w.id::text,
    i.unit_id,
    'maintenance',
    'maintenance_work_order.cancelled',
    'instant',
    (timezone('UTC', w.cancelled_at))::date,
    w.cancelled_at,
    null::timestamptz,
    null::uuid,
    'maintenance_work_order',
    w.id::text,
    'maintenance_issue',
    i.id::text,
    jsonb_build_object('code', w.code, 'title', w.title)
  from public.maintenance_work_orders w
  join public.maintenance_issues i on i.id = w.issue_id
  where i.unit_id is not null and w.cancelled_at is not null

  -- Access custody belongs to the Tenancy Unit even for Property-scoped items.
  union all
  select
    'access.' || x.type || ':' || x.id::text,
    t.unit_id,
    'access',
    'access.' || x.type,
    'instant',
    (timezone('UTC', x.occurred_at))::date,
    x.occurred_at,
    x.recorded_at,
    x.recorded_by_user_id,
    'access_item_transaction',
    x.id::text,
    'access_item',
    x.access_item_id::text,
    jsonb_build_object(
      'accessItemId', x.access_item_id::text,
      'tenancyId', x.tenancy_id::text,
      'type', x.type,
      'note', x.note
    )
  from public.access_item_transactions x
  join public.tenancies t on t.id = x.tenancy_id

  -- Meter physical lifecycle, observations and semantic boundaries.
  union all
  select
    'meter.installed:' || m.id::text,
    m.unit_id,
    'meter',
    'meter.installed',
    'instant',
    (timezone('UTC', m.installed_at))::date,
    m.installed_at,
    m.recorded_at,
    m.recorded_by_user_id,
    'meter',
    m.id::text,
    null::text,
    null::text,
    jsonb_build_object(
      'code', m.code,
      'serialNumber', m.serial_number,
      'utilityType', m.utility_type,
      'measurementUnit', m.measurement_unit
    )
  from public.meters m

  union all
  select
    'meter.retired:' || m.id::text,
    m.unit_id,
    'meter',
    'meter.retired',
    'instant',
    (timezone('UTC', m.retired_at))::date,
    m.retired_at,
    m.retirement_recorded_at,
    m.retired_by_user_id,
    'meter',
    m.id::text,
    null::text,
    null::text,
    jsonb_build_object(
      'code', m.code,
      'retirementReason', m.retirement_reason
    )
  from public.meters m
  where m.retired_at is not null

  union all
  select
    'meter.reading:' || r.id::text,
    m.unit_id,
    'meter',
    'meter.reading',
    'instant',
    (timezone('UTC', r.read_at))::date,
    r.read_at,
    r.recorded_at,
    r.recorded_by_user_id,
    'meter_reading',
    r.id::text,
    'meter',
    m.id::text,
    jsonb_build_object(
      'meterCode', m.code,
      'value', r.value::text,
      'measurementUnit', m.measurement_unit,
      'note', r.note
    )
  from public.meter_readings r
  join public.meters m on m.id = r.meter_id

  union all
  select
    'meter.boundary_' || b.boundary_type || ':' || b.id::text,
    m.unit_id,
    'meter',
    'meter.boundary_' || b.boundary_type,
    'instant',
    (timezone('UTC', r.read_at))::date,
    r.read_at,
    b.recorded_at,
    b.recorded_by_user_id,
    'meter_reading_boundary',
    b.id::text,
    'tenancy',
    b.tenancy_id::text,
    jsonb_build_object(
      'meterId', m.id::text,
      'meterCode', m.code,
      'readingId', r.id::text,
      'value', r.value::text,
      'measurementUnit', m.measurement_unit,
      'boundaryType', b.boundary_type
    )
  from public.meter_reading_boundaries b
  join public.meter_readings r on r.id = b.reading_id
  join public.meters m on m.id = r.meter_id
)
select
  event_key,
  unit_id,
  category,
  event_type,
  precision,
  occurred_on,
  occurred_at,
  recorded_at,
  recorded_by_user_id,
  source_type,
  source_id,
  related_entity_type,
  related_entity_id,
  details
from events;

comment on view public.unit_business_events is
  'Read-only normalized business-event projection for Unit chronology. It is derived from canonical domain tables; it is not an event store or audit log. Date-only source facts retain date precision and do not invent occurred_at.';

commit;
