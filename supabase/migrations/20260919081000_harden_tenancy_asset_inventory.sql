begin;

-- Hardening follow-up to merged canonical #15.
-- Keep the original migration immutable; replace only the guard function body.

create or replace function public.guard_tenancy_asset_assignment()
returns trigger
language plpgsql
as $tenancy_asset_assignment_guard$
declare
  tenancy_unit_id uuid;
  tenancy_status text;
  asset_unit_id uuid;
  asset_status text;
  assessment_asset_id uuid;
  move_in_changed boolean;
  move_out_changed boolean;
begin
  if tg_op = 'DELETE' then
    raise exception 'Tenancy Asset assignments preserve inventory history.'
      using errcode = '23514',
            constraint = 'tenancy_asset_assignment_delete_forbidden';
  end if;

  if tg_op = 'INSERT' then
    select unit_id, status
      into tenancy_unit_id, tenancy_status
    from public.tenancies
    where id = new.tenancy_id;

    select unit_id, status
      into asset_unit_id, asset_status
    from public.assets
    where id = new.asset_id;

    if asset_unit_id is null or asset_unit_id <> tenancy_unit_id then
      raise exception 'Tenancy inventory Asset must belong to the Tenancy Unit.'
        using errcode = '23514',
              constraint = 'tenancy_asset_assignment_unit_mismatch';
    end if;

    if tenancy_status not in ('draft', 'planned', 'active') then
      raise exception 'Tenancy state cannot receive a new Asset inventory assignment.'
        using errcode = '23514',
              constraint = 'tenancy_asset_assignment_tenancy_state_invalid';
    end if;

    if asset_status in ('retired', 'replaced') then
      raise exception 'Retired or replaced Asset cannot be newly assigned to Tenancy inventory.'
        using errcode = '23514',
              constraint = 'tenancy_asset_assignment_asset_status_invalid';
    end if;

    if new.version <> 1
       or new.move_in_presence is not null
       or new.move_out_presence is not null
    then
      raise exception 'New Tenancy Asset assignments start empty at version 1.'
        using errcode = '23514',
              constraint = 'tenancy_asset_assignment_initial_state';
    end if;

    return new;
  end if;

  if new.id is distinct from old.id
     or new.tenancy_id is distinct from old.tenancy_id
     or new.asset_id is distinct from old.asset_id
     or new.assigned_at is distinct from old.assigned_at
     or new.assigned_by_user_id is distinct from old.assigned_by_user_id
  then
    raise exception 'Tenancy Asset assignment identity is immutable.'
      using errcode = '23514',
            constraint = 'tenancy_asset_assignment_identity_immutable';
  end if;

  select unit_id, status
    into tenancy_unit_id, tenancy_status
  from public.tenancies
  where id = new.tenancy_id;

  select unit_id
    into asset_unit_id
  from public.assets
  where id = new.asset_id;

  move_in_changed :=
    new.move_in_presence is distinct from old.move_in_presence
    or new.move_in_condition_assessment_id is distinct from old.move_in_condition_assessment_id
    or new.move_in_recorded_at is distinct from old.move_in_recorded_at
    or new.move_in_recorded_by_user_id is distinct from old.move_in_recorded_by_user_id
    or new.move_in_notes is distinct from old.move_in_notes;

  move_out_changed :=
    new.move_out_presence is distinct from old.move_out_presence
    or new.move_out_condition_assessment_id is distinct from old.move_out_condition_assessment_id
    or new.move_out_recorded_at is distinct from old.move_out_recorded_at
    or new.move_out_recorded_by_user_id is distinct from old.move_out_recorded_by_user_id
    or new.move_out_notes is distinct from old.move_out_notes;

  if move_in_changed = move_out_changed then
    raise exception 'Exactly one inventory phase may be appended per mutation.'
      using errcode = '23514',
            constraint = 'tenancy_asset_assignment_phase_mutation_invalid';
  end if;

  if move_in_changed
     and tenancy_status not in ('planned', 'active')
  then
    raise exception 'Move-in inventory requires planned or active Tenancy.'
      using errcode = '23514',
            constraint = 'tenancy_asset_assignment_move_in_tenancy_state';
  end if;

  if move_out_changed
     and tenancy_status not in ('active', 'notice_given', 'move_out_pending')
  then
    raise exception 'Move-out inventory requires an operational move-out Tenancy state.'
      using errcode = '23514',
            constraint = 'tenancy_asset_assignment_move_out_tenancy_state';
  end if;

  if (
    (move_in_changed and new.move_in_presence = 'present')
    or (move_out_changed and new.move_out_presence = 'present')
  ) and (asset_unit_id is null or asset_unit_id <> tenancy_unit_id)
  then
    raise exception 'Present Tenancy inventory requires Asset current Unit to match Tenancy Unit.'
      using errcode = '23514',
            constraint = 'tenancy_asset_assignment_present_unit_mismatch';
  end if;

  if new.version <> old.version + 1 then
    raise exception 'Tenancy Asset inventory mutation must advance version by one.'
      using errcode = '23514',
            constraint = 'tenancy_asset_assignment_version_step';
  end if;

  if move_in_changed then
    if old.move_in_presence is not null or new.move_in_presence is null then
      raise exception 'Move-in inventory is append-once.'
        using errcode = '23514',
              constraint = 'tenancy_asset_assignment_move_in_immutable';
    end if;
  end if;

  if move_out_changed then
    if old.move_in_presence is null
       or old.move_out_presence is not null
       or new.move_out_presence is null
    then
      raise exception 'Move-out inventory is append-once and requires move-in.'
        using errcode = '23514',
              constraint = 'tenancy_asset_assignment_move_out_immutable';
    end if;
  end if;

  if new.move_in_condition_assessment_id is not null then
    select asset_id into assessment_asset_id
    from public.asset_condition_assessments
    where id = new.move_in_condition_assessment_id;

    if assessment_asset_id is distinct from new.asset_id then
      raise exception 'Move-in condition assessment must belong to assigned Asset.'
        using errcode = '23514',
              constraint = 'tenancy_asset_assignment_condition_asset_mismatch';
    end if;
  end if;

  if new.move_out_condition_assessment_id is not null then
    select asset_id into assessment_asset_id
    from public.asset_condition_assessments
    where id = new.move_out_condition_assessment_id;

    if assessment_asset_id is distinct from new.asset_id then
      raise exception 'Move-out condition assessment must belong to assigned Asset.'
        using errcode = '23514',
              constraint = 'tenancy_asset_assignment_condition_asset_mismatch';
    end if;
  end if;

  return new;
end;
$tenancy_asset_assignment_guard$;


commit;
