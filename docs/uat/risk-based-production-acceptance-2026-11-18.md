# Portfolio — preostali risk-based production acceptance

**Snapshot:** 2026-11-18  
**Basis:** production `main` release `b2a7f64e07fe023774f87bfd566292f552041d53` (merged PR #127), hosted manual UAT register dated 2026-10-30 with 2026-11-02 addendum, and the observed 2026-11-18 operational results.  
**Purpose:** freeze outstanding release evidence and bounded acceptance work. This is **not** authorization for product-scope expansion, refactoring or deployment changes.

## 1. Decision / evidence boundaries

Portfolio has a functioning online MVP and a successfully validated production release. The particular Inspector cross-assignment binary disclosure documented in [#126](https://github.com/dusanmiladinovicVNM/Portfolio/issues/126) is **CLOSED / hosted negative-and-positive UAT PASS**, following deployed [PR #127](https://github.com/dusanmiladinovicVNM/Portfolio/pull/127). The PDF signature-artwork defect [#119](https://github.com/dusanmiladinovicVNM/Portfolio/issues/119) and presentation polish issue [#123](https://github.com/dusanmiladinovicVNM/Portfolio/issues/123) are also closed. **These results do not constitute unrestricted production/security acceptance.**

Evidence levels used below:

- **HOSTED UAT PASS:** an operator authenticated to the production web/API and provided a recorded result.
- **DB VERIFIED:** a read-only production query independently confirmed canonical state/invariants.
- **AUTOMATED PASS:** GitHub Actions, unit, integration or recovery rehearsal passed; this cannot replace unperformed hosted tests.
- **GAP / NOT YET PROVEN:** a material scenario is not backed by sufficient evidence; do not call it PASS.
- **P0/P1** denote acceptance risk, not necessarily a confirmed implementation defect.

Do not modify real customer records, old finalized Inspection snapshots or signed DocumentVersions for acceptance. Use synthetic fixtures and independent sessions; record actor, environment, exact resource identifiers, observed status, timestamps and release SHA. Never copy tokens, passwords, signatures, raw private customer data or unredacted production payloads into GitHub.

## 2. Release and operational facts already supported

| Gate | Evidence as of 2026-11-18 | Disposition / residual scope |
| --- | --- | --- |
| Exact production release | [CI #1574](https://github.com/dusanmiladinovicVNM/Portfolio/actions/runs/44315022636) succeeded on merge SHA `b2a7f64e...`; database migration + hosted API release verification and Vercel deploy were reported PASS. | **PASS for that SHA**, not for all future changes. |
| Inspector-owned binary security | [#126 closure evidence](https://github.com/dusanmiladinovicVNM/Portfolio/issues/126): SEC-05/06/07 expected 403; Admin SEC-08 PDF 200; assigned Inspector SEC-09 own Inspection/metadata/PDF 200 and other PDF 403. Synthetic `UAT-SEC126-A-20261118`, final version `499dd217-3f14-49c8-8a4d-8aa5088b7965`, canonical DB link checked. | **PASS / CLOSED** for demonstrated ownership bypass. Broader role/object matrix still open. |
| PostgreSQL logical backup | [Production Backup #58](https://github.com/dusanmiladinovicVNM/Portfolio/actions/runs/44282349640) succeeded: real production data restored into fresh PostgreSQL 17; source/restored verification, application recovery smoke and encrypted artifact. | **AUTOMATED PASS**. Still lacking full loss-of-Supabase-project cutover/managed Auth/Edge Function configuration proof. Backup occurred before PR #127 merge; recheck after release. |
| Off-provider binary backup | [Production Binary Backup #58, attempt 2](https://github.com/dusanmiladinovicVNM/Portfolio/actions/runs/44296211060) succeeded after OAuth refresh-token repair: round-trip-verified encrypted artifact uploaded. The [binary recovery runbook](../runbooks/production-binary-backup-restore.md) also records an earlier hosted recovery/relocation drill on a separate Drive folder. | **AUTOMATED PASS + historical hosted restore PASS**; verify current inventory and post-release continuity. Not proof of total provider-loss cutover. |
| Health/observability | [Observability #264](https://github.com/dusanmiladinovicVNM/Portfolio/actions/runs/44267994011) succeeded, but observed scheduler gaps are ~6–10 hours despite `*/15 * * * *` with a 20-minute queried log window. | **P1 candidate OPEN [#129](https://github.com/dusanmiladinovicVNM/Portfolio/issues/129)** — actual detection continuity not proven. |
| Real user-facing functional MVP | [Hosted UAT register](hosted-acceptance-baseline-2026-10-30.md) documents tested happy paths across core modules and the Inspection final-PDF signature visual retest. | **PARTIAL HOSTED PASS**; below negative paths and systemic risks remain. |

## 3. Risk-based acceptance matrix

| Priority | Workstream | Required hosted/operational proof | Pass condition |
| --- | --- | --- | --- |
| **P0** | Cross-role and cross-object authorization | Authenticated Admin, Manager, Inspector and unrelated Property/Unit object IDs; direct GET/list/binary access and POST/PATCH actions; check leaked metadata, linked Documents, signature/evidence binary, and ownership reassignment refusal. | Every unauthorized action returns the expected denial **with no state change**; authorized controls continue to work. Preserve #126 regressions. |
| **P0** | Full recovery and continuity | Recover current production database backup into an isolated target, cross-check ledger, table counts, hashes and business reads/writes; independently verify managed Auth recovery procedure, Edge secrets/configuration, release deployment, login and binary resolution. Never destroy production. | A recoverable, authorized app can **continue operating on a disposable target**, not merely load a dump. Clearly document any unexercised Auth/provider steps. |
| **P0** | Secondary binary disaster recovery | Confirm encrypted post-#127 canonical Drive inventory and byte/hash parity; use an isolated recovery folder/target; prove exact DocumentVersion binary re-read and relocation/CAS using supported operator procedure. | Stable identity `versionId + byteSize + sha256` survives relocation; immutable original metadata/history unchanged. Avoid unsanctioned production relocation of customer files. |
| **P1** | Concurrency, CAS and lost-response recovery | Two actual sessions editing one synthetic Inspection; stale section/lifecycle version; network interruption after command commit; replay and hard reload; dirty-navigation guard. | No lost/duplicated writes; 409/conflict semantics and local draft retention are intelligible; retry never silently overwrites a newer version. |
| **P1** | Inspection adversarial lifecycle | Controlled unlock/re-lock, invalidation and re-signing, 2+ required/active signers, missing/invalid binary, corrupt storage, stale review, edits after finalization. | Valid transitions succeed; invalid transitions fail without partial mutations; frozen snapshot and final DocumentVersion remain immutable. |
| **P1** | Cross-module ownership and consistency | Inspection Finding -> Maintenance Issue -> WorkOrder -> ServiceEvent end-to-end plus cross-Unit misuse attempts; check canonical IDs and UI provenance. | Exact source/target references match in UI/API/PostgreSQL; negative wrong-owner cases are rejected. |
| **P1** | Financial, temporal and reporting reconciliation | Independent recomputation of dashboard totals, meter/cost arithmetic and selected `asOf` dates across Tenancy, Lease and operational lifecycle boundaries. | Queries and UI agree at defined cutoffs; no silent omission, double counting or present-state contamination of historical results. |
| **P1** | Mobile/tablet field operation | Physical phone/tablet or credible device session: touch signature, camera/photo upload, responsive navigation, keyboard/focus, constrained connection, pending save/error and return to draft. | Field inspector completes assigned task, can recover from interruption and never loses committed data or mistakes a pending write for success. |
| **P1** | Monitoring, provider resilience and OAuth lifecycle | Resolve #129 actual scheduling blind spots; external readiness/dead-man alert, full-window log cursor/catch-up, alert open/close drill, provider failure handling, Google OAuth long-term policy and backup job continuity. | Failed/stale monitoring is itself noticed; synthetic incidents alert and subsequently clear; credentials do not silently expire. |
| **P2 (parallel)** | Workflow-first UI/UX | [Epic #124](https://github.com/dusanmiladinovicVNM/Portfolio/issues/124): operator task map + wireflow, then staged UI implementation and desktop/tablet/mobile usability tests. | No regression to security, immutable snapshots, CAS, authorization or release rehearsal; everyday tasks do not expose technical DocumentVersion/SectionInstance internals. |

**Do not reclassify CODE/CI proof as hosted UAT.** A row stays OPEN/INCONCLUSIVE until its named proof is recorded.

## 4. Bounded execution order

### Wave A — P0 security and recoverability

1. Reuse synthetic A/B Inspector fixtures and a separate unrelated Property/Unit. Execute role/resource matrix against *actual hosted API* in isolated authenticated sessions. For unsafe writes, create disposable UAT records and inspect unchanged canonical state after negative tests.
2. Run post-#127 production DB backup plus binary snapshot; inspect exact successful job and encrypted artifacts, reconcile post-release row counts and DocumentVersion inventory.
3. Rehearse full recovery in a disposable environment; explicitly separate proven DB and Drive byte restores from any managed Auth/credential/project-cutover steps not yet performed.
4. Record exact results, then close only the corresponding bounded gate.

### Wave B — P1 write integrity

1. Run two-session Inspection section CAS and lifecycle CAS collisions; test stale submission and lost acknowledgment.
2. Verify controlled unlock / invalidated signature / re-lock and new canonical final PDF using *new* demo Inspections. Never mutate historic final PDFs.
3. Audit rejected edits and signature/evidence ownership after finalization.

### Wave C — P1 business integrity

1. Execute the complete Finding -> Issue -> WorkOrder -> ServiceEvent chain.
2. Independently verify origin and FK ownership, then rerun wrong-Unit and wrong-Property negatives.
3. Compare historical/reporting totals against explicit SQL oracle at chosen `asOf` boundaries.

### Wave D — P1 operational and field readiness

1. Exercise touch/camera/pending-write workflows on real mobile/tablet devices.
2. Resolve [#129](https://github.com/dusanmiladinovicVNM/Portfolio/issues/129) with measured cadence, missing-run alert and alert open/resolve proof.
3. Prove OAuth credential/backup monitoring failure and recovery without risking real data.

**Parallel track:** begin [UX Epic #124](https://github.com/dusanmiladinovicVNM/Portfolio/issues/124) immediately with an **audit + task map + information architecture + wireflow document only**. Risk-based acceptance continues independently. Do not defer the UX design until every P1 test is complete, but do not let UX rewrite canonical business semantics.

## 5. Operational proof register format

For each UAT case record:
- ID and severity; date/time in UTC; hosted environment and exact deployed SHA;
- role/persona and synthetic fixture identifiers; preconditions;
- exact API/UI action(s), expected outcome, observed outcome (HTTP status + durable state);
- evidence classification (`HOSTED UAT`, `DB VERIFIED`, `AUTOMATED`, `INCONCLUSIVE`);
- failure behavior and any confirmed impact; related PR/issue;
- acceptance decision: **PASS / FAIL / INCONCLUSIVE / NOT RUN**.

Never mark `Promise {<pending>}` as a pass; use completed browser responses and canonical persisted state. Keep low-level security fixtures isolated from customer data.

## 6. Final release decision policy

- **GO for already proved individual workflows** (do not revoke established evidence without a regression).
- **GO for PR #127 / issue #126 security scope** (tested assignability boundary).
- **NOT YET GO for unrestricted production acceptance** until the bounded P0 security/recovery controls and material P1 integrity/operability checks have sufficient evidence.
- **GO now for #124 design work**; it is not blocked by #129 or unexecuted test permutations.
- Findings require minimal targeted fixes and regression tests; do not initiate an unrelated architecture migration, new feature tranche, or wholesale stack rewrite.

## 7. Authoritative references

- [Host manual UAT baseline and 2026-11-02 addendum](hosted-acceptance-baseline-2026-10-30.md)
- [Full lifecycle MVP release gate](../runbooks/mvp-release-gate.md)
- [Production PostgreSQL backup + restore](../runbooks/production-backup-restore.md)
- [Production binary backup + recovery](../runbooks/production-binary-backup-restore.md)
- [Production observability](../runbooks/production-observability.md)
- [PR #127](https://github.com/dusanmiladinovicVNM/Portfolio/pull/127) and [closed #126](https://github.com/dusanmiladinovicVNM/Portfolio/issues/126)
- [Monitoring gap #129](https://github.com/dusanmiladinovicVNM/Portfolio/issues/129)
- [Workflow-first UI/UX Epic #124](https://github.com/dusanmiladinovicVNM/Portfolio/issues/124)

**This document is a frozen acceptance plan, not a declaration that its unexecuted tests passed.**
