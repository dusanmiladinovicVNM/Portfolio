# ADR 0024: Maintenance separates problems from work execution

**Status:** Accepted

## Context

Canonical #19 introduces Maintenance after Inspection, Asset/Service, Improvements and Cost already own their respective business truth.

The main modeling risks are:

- collapsing a reported problem and the work used to address it into one mutable record;
- copying Asset service history or financial amounts into Maintenance;
- allowing a maintenance record to mutate Asset, Inspection or Cost state directly;
- losing the physical place where an Issue was reported when an Asset later moves;
- allowing Issue terminal transitions to race with WorkOrder creation/progress;
- treating an InspectionFinding as the maintenance aggregate itself.

## Decision

Maintenance has two primary grains:

```text
MaintenanceIssue
  └─ MaintenanceWorkOrder[]
       └─ ServiceEventLink[]

Cost → may reference MaintenanceIssue or MaintenanceWorkOrder
InspectionFinding → may originate one MaintenanceIssue
```

### MaintenanceIssue

One MaintenanceIssue is one reported maintenance problem.

It owns:

- human code;
- title and optional description;
- priority `low|normal|high|urgent`;
- immutable physical scope snapshot: Property plus optional Unit, Space and Asset;
- optional unique originating InspectionFinding;
- `reportedAt` occurrence time;
- immutable recording provenance;
- lifecycle `open -> resolved|cancelled`;
- optimistic version.

The physical hierarchy must be coherent. Space requires Unit. Unit belongs to Property. Space belongs to Unit. When Asset is present, the Issue captures that Asset's exact current Property/Unit/Space placement at creation. Later Asset movement does not rewrite historical Issue scope.

An originating InspectionFinding is provenance, not mutable maintenance state. Its Inspection Unit must equal the Issue Unit. One finding can originate at most one Issue.

Priority belongs to Issue in this phase. WorkOrders do not carry a competing priority field.

Issue title, description and priority are correctable only while open. Scope, origin, code and reported/recorded provenance are immutable.

Resolving an Issue requires at least one completed WorkOrder and every WorkOrder to be terminal. Cancelling an Issue requires every existing WorkOrder to be cancelled. The Issue terminal timestamp cannot predate any child terminal timestamp.

### MaintenanceWorkOrder

One MaintenanceWorkOrder is one operational task intended to address one exact Issue. An Issue may have zero, one or many WorkOrders.

Lifecycle:

```text
draft -> assigned -> in_progress -> completed
   \        \            \
    \--------\-------------> cancelled
```

A WorkOrder may be assigned to exactly one active internal User or active Party. Reassignment is allowed before work starts. Assignment and task definition freeze once work starts.

WorkOrder completion is operational closure of the task. It does not copy detailed Asset service evidence or money.

### ServiceEvent linkage

ServiceEvent remains Asset/Service completed-work truth.

Maintenance owns a link relation rather than adding maintenance fields to ServiceEvent. A WorkOrder may link several ServiceEvents; one ServiceEvent may belong to at most one WorkOrder in this phase.

A link is legal only when:

- the Issue is Asset-scoped;
- the ServiceEvent belongs to that exact Asset;
- the WorkOrder is in progress or completed;
- ServiceEvent.performedAt is not before WorkOrder.startedAt;
- if WorkOrder is completed, ServiceEvent.performedAt is not after completedAt.

A WorkOrder with linked ServiceEvents cannot be cancelled.

### Cost linkage

Cost remains financial truth. Maintenance stores no amount, currency, invoice or supplier-money fields.

Canonical #19 extends the existing typed CostSource with:

- `maintenance_issue`;
- `maintenance_work_order`.

The Cost bounded context still owns Cost creation/correction and independently validates that the referenced Maintenance source exists.

### Inspection linkage

InspectionFinding remains Inspection truth. Maintenance does not mutate it.

The optional origin link is unique and relationally protected. The Issue copies its own title/description/priority as independent maintenance state; later maintenance workflow does not alter the Inspection.

### Concurrency and database parity

PostgreSQL independently enforces static shape, lifecycle and cross-row rules.

WorkOrder inserts/updates take a shared lock on the parent Issue. Issue terminal transitions serialize against those child writes and re-check child terminal state under the lock.

ServiceEvent link creation takes a shared lock on the WorkOrder. WorkOrder cancellation therefore serializes with link creation.

Normal application commands still validate the same invariants before persistence.

## Boundaries

Canonical #19 does **not** introduce:

- recurring preventive-maintenance scheduling beyond existing ServicePlan;
- inventory/procurement;
- invoice/AP/payment state;
- mutable money fields on Issue or WorkOrder;
- generic technician timesheets;
- document/evidence redesign;
- Asset movement/replacement mutation from Maintenance;
- a duplicate ServiceEvent model.

## Consequences

- a problem can exist before any work is commissioned;
- one problem can require several work attempts/orders without overwriting history;
- Asset/Service and Cost remain authoritative bounded contexts;
- Inspection findings can become actionable without becoming WorkOrders;
- historical issue scope remains stable even if an Asset later moves;
- DB direct writes cannot bypass the core parent/child lifecycle rules.
