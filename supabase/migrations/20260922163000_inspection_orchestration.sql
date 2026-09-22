begin;

create or replace function public.guard_inspection_orchestration_update()
returns trigger
language plpgsql
as $inspection_orchestration_guard$
begin
  if
    new.assigned_to_user_id is distinct from old.assigned_to_user_id
    or new.scheduled_for is distinct from old.scheduled_for
  then
    if old.status <> 'draft' or new.status <> 'draft' then
      raise exception 'Inspection assignment/schedule can only change while draft.'
        using errcode = '23514',
              constraint = 'inspection_orchestration_draft_only';
    end if;

    if new.version <> old.version + 1 then
      raise exception 'Inspection orchestration changes require version CAS progression.'
        using errcode = '23514',
              constraint = 'inspection_orchestration_version_progression';
    end if;
  end if;

  return new;
end;
$inspection_orchestration_guard$;

create trigger inspections_orchestration_guard_trg
before update on public.inspections
for each row
execute function public.guard_inspection_orchestration_update();

commit;
