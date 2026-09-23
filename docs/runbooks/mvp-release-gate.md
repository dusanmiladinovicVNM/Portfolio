# Full lifecycle MVP release gate

This is the final executable MVP release proof. It does not add product features.

## Release decision

A commit is release-candidate eligible only when the same exact SHA passes:

~~~text
Typecheck
→ Web production build
→ Unit/security/HTTP tests
→ Full lifecycle MVP release rehearsal
~~~

The release rehearsal itself is one command:

~~~text
pnpm release:rehearse
~~~

and executes:

~~~text
browser full lifecycle
→ real PostgreSQL integration invariants
→ destructive backup/restore
→ restored repository reads
→ canonical post-restore write + reread
~~~

## Browser lifecycle evidence

The existing browser workflow is reused rather than duplicated. It covers the launch workflows introduced through #38, including:

- Party / Property / Unit / Space setup;
- Tenancy lifecycle and party assignment;
- Lease agreements, amendments and signed-document binaries;
- Asset lifecycle, warranty, claims, service plans and service events;
- Meter creation/readings and tenancy boundaries;
- Maintenance Issues / WorkOrders / ServiceEvent linkage;
- Inspection orchestration, field section CAS, dirty-navigation guards;
- Findings and evidence binaries;
- lock / signatures / controlled unlock / re-lock;
- immutable finalization and final report;
- adversarial pending-write ownership and lost-acknowledgement recovery paths.

## PostgreSQL invariant evidence

The existing integration suite applies the canonical schema and exercises repository plus direct-SQL sabotage coverage for ownership, temporal, CAS, lifecycle and security invariants.

## Recovery continuation evidence

The destructive recovery rehearsal remains the #41 mechanism:

~~~text
migrations from zero
→ fixture
→ pg_dump + checksums + ACLs
→ destroy source DB
→ create fresh restore DB
→ pg_restore
→ business/security verification
→ canonical repository reads
~~~

#43 adds one final continuation proof after restore:

~~~text
PostgresPortfolioRepository.insertProperty(new canonical Property)
→ getPropertyById
→ exact round-trip equality
~~~

This proves the restored database is not merely readable evidence; domain validation, authorization, the application command and canonical PostgreSQL persistence can continue after recovery.

## Exact-SHA provenance

`RELEASE_CODE_SHA` is only an expected SHA assertion. Before any rehearsal work, the script reads the actual `git rev-parse HEAD`, fails if an expected SHA differs, and fails if the working tree has any tracked or untracked changes. The manifest records only that verified actual checkout SHA. CI explicitly checks out the PR head SHA (or `github.sha` on non-PR pushes), and the verified actual SHA is forwarded to recovery as `RECOVERY_CODE_SHA`. The release gate fails if recovery provenance differs.

## Production-only prerequisites

The executable repository gate cannot prove deployment-provider configuration. Before production release, the deployment runbook still requires:

- production secrets and provider roles;
- edge/platform request rate limits;
- upload limits;
- abuse/concurrency limits;
- production backup destination/retention policy;
- chosen Google Drive binary durability/backup policy.

These are release-environment checks, not reasons to introduce an in-memory serverless limiter or provider-specific code into the domain/application layers.

## Non-scope

No new domain aggregate, offline support, metrics/tracing vendor, PITR orchestration, Drive replication implementation or deployment platform is introduced by #43.
