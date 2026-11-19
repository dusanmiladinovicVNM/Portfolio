# Portfolio — Inspection task-first wireflow and acceptance contract

**Owner-approved direction for Epic [#124](https://github.com/dusanmiladinovicVNM/Portfolio/issues/124) (2026-11-19); technical and UAT acceptance outstanding**  
**Source baseline:** main 316544ec0f76baee94efbeed7d344939f4b81f0e, 2026-11-18.  
**Scope:** low-fidelity design only. No current lifecycle, API, auth or data contract is changed by this document.

See [UX audit, task map and target IA](portfolio-ux-architecture-2026-11-18.md).

## A. Critical semantic separation

The owner-approved user-facing journey contains **exactly five guided task stages**:

1. **Setup** — identify Unit/Inspection, assignment and schedule; start permitted work.
2. **Inspect rooms/sections** — answer questions in one exact room; add Findings/photos in that room as contextual actions.
3. **Evidence overview** — aggregate linked evidence for review, scope correction and authorized Open/Download; routine capture still takes place in the room.
4. **Review & Sign** — first perform **fresh canonical review and lock while in_progress**; only once the persisted Inspection is locked may required signatures be captured. A single UX stage may show different legally available panels, never a simultaneous or atomic review/lock/sign command.
5. **Report** — Manager/Admin finalization after all required signatures, then separate authorized report generation or read-only report access. An Inspector sees the appropriate manager-handoff state, not a forbidden Finalize CTA.

These are **presentation stages, not persisted business states**. The detailed D1–D6 sections below intentionally separate Review and Sign for independent lifecycle safety even though they share guided stage 4.

Canonical lifecycle remains:

    draft --start--> in_progress --validated lock--> locked --authorized finalize--> finalized
                                   ^                 |
                                   +-- manager/admin controlled unlock (invalidates active signatures)

Cancelled is its own terminal state. The Review stage is a canonical reread during in_progress, not a status. Findings and Evidence are collected while in_progress as part of field work and may be presented within the active room; they are not a new transition. Signature collection is legal only while locked; final report generation happens after finalized and is not the finalization transaction.

For presentational simplicity, one on-screen stage may show a CTA to jump to another stage; the authoritative API capability and lifecycle preconditions must not be weakened.

### Hard invariants

1. Exact Inspection → Unit / optional same-Unit Tenancy and published schema version.
2. Assigned Inspector can only see or mutate assigned Inspection. The server is the authority; never infer permission from disabled UI alone.
3. Section PATCH merges omitted values without clearing them; section revision CAS and Inspection contentRevision/lifecycle version are distinct.
4. Fresh review before lock; missing conditionally required answers block lock; stale contentRevision blocks lock.
5. Controlled unlock is manager/admin only, append-only and invalidates all active signatures.
6. Signatures: locked only, exact immutable signature DocumentVersion, required signer role/Party, one active signature per role.
7. Finalized Inspection and its unique FinalSnapshot are immutable; PDF derives from that snapshot, with original finalized documents untouched.
8. Evidence uses the exact DocumentVersion and inspection/section/item ownership. Storage success is not evidence-link success. Binary read permission remains server-side and must retain #126/#127 closure protection.
9. All writes go through typed application commands; uncertainty after network failure is never converted into success.
10. Dirty-navigation guard and stale async response rejection remain intact; never silently replace the active Inspection/section.

## B. Wireflow — operator-visible journey

    WORK / FIND / PROPERTY UNIT
       |
       v
    [INSPECTION LIST] -- choose exact Inspection --> [FOCUSED INSPECTION TASK SHELL]
       |                                               |
       +-- permitted Create Inspection ----------------> [SETUP] (draft)
                                                        |
                                            Save assignment + schedule
                                                        |
                                               Start Inspection
                                                        v
                                               [ROOM / SECTION] (in_progress)
                                                        |
                                   answer fields; contextual Finding/photo actions
                                   async save: dirty -> saving -> saved
                                                        |
                                    <Previous room / Next room> (safe navigation)
                                                        |
                                            [REVIEW READINESS]
                                               /             \
                                     missing/stale         complete/fresh
                                        |                     |
                                  return to room         Confirm & lock
                                                              |
                                                            locked
                                                              v
                                                      [SIGNATURES]
                                           signer roles, identity, drawing/upload
                                                              |
                                          manager/admin if all required present
                                                              v
                                                  [FINALIZE] (immutable)
                                                              |
                                                  [REPORT] (independent)
                                                              |
                                              Open / Download exact PDF

On an assigned Inspector workflow, the final authorized screen may be “Awaiting manager completion” rather than a clickable Finalize action. Do not show a failing unlock/finalize CTA.

## C. Task shell: persistent visible context

Top: compact hierarchy **Property name/code › Unit number/code › Inspection code/type**; assignee, scheduled date, canonical status; back to Work / back to Unit.

Second row: current stage and **saved required fields N/M**, with room labels and missing/complete flags. Differentiate “required fields saved” from all content complete.

Main: one current task surface. On desktop, room navigation may be left column; on mobile, room selector/progress and active room are vertical, with a sticky action/status strip only if it does not cover content.

Action hierarchy:
- Exactly one visually primary available next action for current context.
- Previous, Save now, View Evidence, Diagnostics are secondary or contextual.
- Dangerous irreversible actions require explicit confirmation and state what changes.
- Technical revision/version identifiers appear under Diagnostics; a useful human-facing conflict summary remains prominent.

### Browser/URL identity

Keep existing canonical Unit deep link with tab=inspections, inspectionId and optionally sectionInstanceId. Resume must restore the *same* selected Inspection and room if still authorized, then refetch current canonical state. Invalid/stale/deleted IDs must show explicit unavailable/forbidden state rather than silently selecting an unrelated Inspection. Return to list should be deterministic even after hard reload; optional referring Work context may be a separate enhancement, not required to mutate canonical route schema now.

## D. Stage specification

### D1. Setup

**Goal:** create or open correctly scoped Inspection; office actor selects permitted published schema, type, code, assignee, optional Tenancy and date. The existing InspectionOrchestrationPanel creates/updates only draft metadata. Do not imply office-only if current server capability allows assigned Inspector self-creation.

**Primary:** “Create Inspection” on list, “Start Inspection” on ready draft.

**Secondary:** edit assignment/schedule in draft, return to Unit, view schema/version under Advanced. Show assignee name and active status, not raw user UUID.

**Gate:** server validates Unit/schema/actor assignment, no illegal reassignment, write returns exact new identity/version. Draft orchestration stops when field work starts. A failed create must reconcile a possibly committed request rather than create duplicates.

**Mobile:** one column; consistent code/type/assignee summary; avoid exposing six equal-weight fields after draft is already created.

### D2. Inspect rooms/sections

**Goal:** answer visible conditional fields on one exact SectionInstance, optionally with additional comments.

**Primary:** “Continue to next room” when safely saved; on final room, “Review inspection”. “Save now” must always be accessible as a secondary recovery action. Autosave stays enabled.

**Status:** Unsaved / Saving / Saved / Save failed / Changed elsewhere / Outcome unconfirmed. Display status in a stable location and announce changes accessibly.

**Gate:** legal in_progress status, current assigned actor, typed item/options and section expectedRevision. Required/conditional rules evaluated in local UI for guidance and again canonically on review. No promise of readiness from local form alone.

**Owner decision UX-D05 — Save & continue:** a primary “Save & continue” action on a dirty section must await an acknowledged matching canonical PATCH and fresh/merged local state before changing SectionInstance or guided stage. If the section is clean, “Continue” may navigate immediately after checking that no write is pending. If the write is pending, failed, in CAS conflict or has an ambiguous outcome, keep the user on the current section with their draft visible and show a recovery action; **never** show success or advance optimistically. A secondary “Previous room” remains navigation but is subject to the existing dirty blocker. No automatic discard of touched entries.

**Migration guard:** UX-2B is only a focused-section *focus* fix; its existing Next/Previous links still obey the dirty guard, not the newly approved Save & continue workflow. Do not claim UX-D05 is implemented before a dedicated orchestration PR, a browser test for success/409/timeout, and manual acceptance.

**Errors:** field-level validation (readable label, not technical code); conflict keeps local draft visibly intact; explicit compare/retry/discard choices must each specify risk and use a fresh expectedRevision. If comparison/merge is not implemented, do not claim it exists.

### D3. Findings & photos (contextual within active room)

**Goal:** capture observed condition and supporting evidence with unambiguous room/item ownership. Findings are *not* Maintenance Issues, and evidence is not automatically a WorkOrder.

**Primary:** “Add finding” or “Add photo” directly from the active room/item as a contextual action chosen by the operator; do not present competing large create forms by default. The separate guided **Evidence overview (stage 3)** summarizes **canonically linked** items across rooms, with scope/ownership badges, clear room navigation to repair evidence, authorized authenticated Open/Download, and explicit stored-only/incomplete states. Avoid creating a second competing upload flow.

**Evidence task:**

1. Choose photo/file (mobile camera permitted); show optional caption and selected room/item scope.
2. Prepare image locally if needed; preserve source/prepared byte information in diagnostics only.
3. **Uploading:** call existing scoped binary upload with stable idempotency key, respecting MIME and size limits.
4. **Linking:** call existing exact-version evidence attach with the permitted scope; never call it as a guessed second upload.
5. **Attached:** only after canonical Inspection reread confirms the exact DocumentVersion relation in correct Inspection/section/item.
6. Render a card showing thumbnail for supported image formats, human-readable caption/context, **Open** and **Download** if authorized; use DocumentBinaryActions or the same authenticated binary action contract.
7. If storage succeeds but link fails or response is ambiguous, show “Photo stored; not yet confirmed as attached”, retain exact version identity and offer **Resume attachment** after canonical reconciliation. On refresh, server-visible version discovery/reconciliation is needed; do not assert client memory survives reload.
8. If binary access is forbidden/missing/corrupt, the card must not leak a URL, preview pixels or an “Open” action that bypasses authorization. Show readable limited-access/repair state.

**Advanced (manager/admin where allowed):** reuse an already stored exact version, select Document/Version, audit storage metadata, manually attach. This is not the daily field path.

**Negative:** no room cross-link; another Inspection's photo must never appear in current-room results or in prefetch. Invalid MIME/oversize/slow network/retry must preserve the prepared exact byte identity and no duplicate relation.

### D4. Review and lock

**Goal:** one authoritative confirmation of saved answers, Findings and Evidence before freezing content.

**Primary:** “Review inspection”; after fresh complete canonical review, “Confirm & lock”.

**View:** grouped room summary with missing-required checklist and “Fix in room” jump; context-level evidence count; indicate required roles to be collected after lock. Technical contentRevision visible in Diagnostics, but stale/conflict warning must be plain language.

**Gate:** server-side reread; confirm unchanged source identity, section content and contentRevision immediately before lock; lock uses lifecycle version and expected contentRevision. Any content change makes the review stale and disables confirmation until reread.

**Back:** “Return to field work” must not imply unlock; still in_progress until confirmed lock. After lock, content editing is not offered.

### D5. Sign

**Goal:** capture required policy-defined signer roles on a locked Inspection.

**Primary:** “Add signature” for the next required role with clear signer identity selected *before* drawing; once all roles met, manager/admin can proceed to finalization.

**View:** required signatures present/missing; exact signer Party where required (landlord/tenant), signer name, date/status and drawing pad. Signature can be a drawn PNG or allowed PNG/JPEG file; wrong-format PDF/WebP should be evidence, not signature art.

**Gate:** only locked status; upload immutable signature version and register the exact version and role; reconciliation on lost ack must not create a duplicate active role signature. Distinguish “file stored” from “signature registered”.

**Unlock:** manager/admin-only deliberate exceptional action, separate from the principal signing CTA and with reason + explicit warning: **all active signatures are invalidated**. Re-lock requires new review and re-signing, never resurrect prior signatures.

**Inspector handoff:** If the role cannot finalize, show collected signatures / missing roles / “Awaiting manager to finalize”, not a clickable server-denied button.

### D6. Complete & report

**Goal:** authorized closure and retrieval of immutable outcome.

**Primary:** “Finalize inspection” to manager/admin only after locked and required active signers are proven. Confirmation explains irreversibility. After persisted finalization, primary becomes “Open final report” if available, or manager/admin “Generate report”.

**Gate:** finalize command transitions and creates exactly one unique FinalSnapshot atomically. PDF generation is idempotent and separate; presence of finalized state does not guarantee the report binary already exists. Historical final records are never modified.

**View:** canonical completed summary, active/invalidated signature history, exact final report DocumentVersion, Open/Download and readable “report not yet generated”. History may collapse; main status must not.

**Error:** if report generation fails after successful finalization, keep “Finalized; report pending” and a safe manager recovery action. Never offer to re-finalize and never imply a missing binary makes the snapshot disappear.

## D7. Localisation contract (de-CH)

The owner approved Swiss Standard German (`de-CH`) as the primary UI language. The business-stage vocabulary below is a **proposed UI copy contract**, not yet production localisation or a translation of the persisted domain enum:

| Stage | German user-facing label | Action wording (illustrative) |
| --- | --- | --- |
| Setup | Vorbereitung | Inspektion starten |
| Inspect | Räume prüfen | Speichern und weiter / Vorheriger Raum |
| Evidence | Fotos und Nachweise | Foto hinzufügen / Nachweise prüfen |
| Review & Sign | Prüfen und unterschreiben | Prüfung bestätigen und sperren / Unterschrift hinzufügen |
| Report | Bericht | Bericht öffnen / Bericht erstellen (only authorized actor) |

Use Swiss spelling (`ss`, not `ß`) in user-facing copy; choose terminology with a native de-CH reviewer before freezing all microcopy. Translate display strings via future i18n keys, **not** canonical API fields/status values. Real UAT must still verify wording, focus, mobile reading order and recovery instructions.

## E. Role / lifecycle action matrix

This is the expected **UX display policy**, constrained by inspected application commands; server must still re-evaluate each action and object ownership.

| Action | Inspector (assigned object only) | Manager | Admin | State/conditions |
| --- | --- | --- | --- | --- |
| Open assigned Inspection | Yes | According to server access | According to server access | Resource ownership read checks |
| Create Inspection | Within self-assignment limits | According to capability | According to capability | Published schema, valid Unit |
| Edit draft assignment/schedule | Only if server allows valid assignment (not cross-assignment) | Yes if permitted | Yes if permitted | Draft; lifecycle CAS |
| Start / answer section | Yes when assigned | If authorized | If authorized | Draft start; in_progress edits; section CAS |
| Add Finding / Evidence | Yes when assigned | If authorized | If authorized | in_progress, exact version and scope |
| Review and lock | Yes when assigned | If authorized | If authorized | Fresh complete canonical source |
| Draw/register signature | Yes when assigned | If authorized | If authorized | locked; signer policy / exact binary |
| Unlock | **No** | Yes | Yes | locked; reason; invalidate active signers |
| Finalize | **No** | Yes | Yes | locked, required signatures |
| Generate final PDF | **No** | Yes | Yes | finalized snapshot |
| Open report | Only if specifically authorized | If authorized | If authorized | Binary GET ownership/read policy; #127 fence |

The manager/admin cells indicate expected presentation for actors with corresponding capabilities, **not unrestricted cross-property permission**. Do not show inspector a general “all portfolio inspections” directory if server only exposes assigned objects. Inspectors can still access the current authorized Work view without a new navigation module.

## F. Visual low-fidelity layout contracts

### Desktop (>860 px indicative, design to test)

    +--------------------------------------------------------------+
    | Global sidebar | Property > Unit > Inspection     [status]   |
    |                | Current task / assigned / due               |
    |                | [Setup][Inspect][Review][Sign][Complete]    |
    |                |---------------------------------------------|
    |                | Rooms         | Active section              |
    |                | ✓ Hallway     | Questions / simple controls |
    |                | ! Kitchen     | [Add finding] [Add photo]    |
    |                | ...           | inline attached evidence   |
    |                |               | Saved ✓   [Continue]        |
    +--------------------------------------------------------------+

### Tablet (~768 px indicative)

    +-----------------------------------------------------------+
    | Compact nav | Property > Unit > Inspection / status      |
    | Task stage + overall progress                             |
    | Select room: Kitchen [2/4]                                 |
    | Active question panel; evidence preview beneath           |
    | Save status                              [Continue]       |
    +-----------------------------------------------------------+

### Mobile (320–430 px indicative)

    +------------------------------+
    | Context: Unit 301 / INS-...  |
    | Step 2 of 5 · Inspect        |
    | Room 3/4 [Choose room]       |
    |------------------------------|
    | Question 1                   |
    | [full-width control]         |
    | Question 2                   |
    | [full-width control]         |
    | [Add photo] [Add finding]    |
    | photo card [Open][Download]  |
    |------------------------------|
    | Saved / Saving / Conflict    |
    | [Continue to next room]      |
    +------------------------------+

On mobile, avoid showing the full dossier navigation + all steps + all forms above the active question. Reduce repeated navigation, not information needed for correct decisions. Keep button hit areas at least 44×44 px where practicable; avoid overlaying browser keyboard/camera or scrolling beyond a long sticky header.

## G. Async, error and save-state contract

| State | Trigger | Visible message | Allowed next action |
| --- | --- | --- | --- |
| CLEAN | Canonical item equals local form | “All changes saved” | Continue |
| DIRTY | User changed answer | “Unsaved changes” | Save now; guarded navigation |
| SAVING | PATCH in flight | “Saving…” | Wait for verified result; no concurrent conflicting action |
| SAVED | Matching PATCH acknowledged/merged | “Saved” | Continue |
| FAILED | Request rejected / safe failure | “Could not save; your answers are still here” | Retry same safe operation or correct validation |
| CONFLICT | Section revision differs | “Changed elsewhere; local answers kept” | Fresh reread and explicit reconcile/discard; no silent overwrite |
| AMBIGUOUS | Timeout/lost ack after possible commit | “Outcome not confirmed” | Canonical reread, stable-key recovery and safe resume |
| FORBIDDEN | Server denies action/read | “You do not have access to this action” | Navigate to permitted task / contact manager; no data leak |
| FINAL | Canonical finalized snapshot | “Completed; read-only” | Open available report; authorized generation if absent |
| INTERRUPTED | Refresh/back/device interruption | Restore exact route identity and fetch canonical state | Resume from saved state; do not promise unsaved local draft survival across full reload unless implemented |

Toast-only confirmation is insufficient for multi-step binary writes. Errors must identify whether **file storage**, **relation creation** or **final report generation** failed. Do not clear or reset draft on a rejected request. Do not expose raw technical exception or version IDs as the only recovery instructions.

## H. Interaction semantics and confirmations

- **Save now:** attempts to persist the current section; only “Saved” after acknowledged/merged canonical response. Never a proxy for lock.
- **Continue/Next:** navigates to next section or review; safe only after relevant unsaved state is resolved. It must not imply finalization.
- **Back:** navigation to prior room or task, not a status rollback; dirty guard always applies.
- **Review:** fetches current canonical data and computes saved required-field completeness; no mutation.
- **Confirm & lock:** mutates in_progress → locked after fresh canonical checks. Explain that edits stop and signatures begin.
- **Add signature:** uploads exact artwork and then registers signer relation; the success means both steps are canonically confirmed.
- **Unlock:** separate manager/admin exception; explicit typed reason and invalidation warning.
- **Finalize:** one irreversible snapshot transition; manager/admin only. Report generation follows separately.
- **Open / Download:** authenticated exact DocumentVersion read; no public storage URL or ownership bypass.

## I. Acceptance test cases for staged UX PRs

| Test | Preconditions | Expected proof |
| --- | --- | --- |
| UX-I01 Direct assigned deep link | Inspector assigned to synthetic Inspection, current room link | Refresh restores same Inspection/SectionInstance and user-readable Unit context |
| UX-I02 Wrong-owner deep link | Inspector A opens B Inspection/report URL | Server denies GET/binary, no preview leak or data from B |
| UX-I03 Draft and room save | In-progress Inspection, conditional response | DIRTY→SAVING→SAVED, correct PATCH semantics, progress derived from saved state |
| UX-I04 Dirty navigation | Unsaved field then Back/Next/global nav | Explicit confirmation or safe retention, no silent loss |
| UX-I05 Two-session CAS | Manager and Inspector edit same section | Reject stale write; both server and local versions preserved until conscious resolution |
| UX-I06 Late response | Switch Inspection A→B with A request pending | A result never overwrites B editor |
| UX-I07 Add photo happy path | Section-specific image (mobile camera or file) | Exact scoped version stored, exact link confirmed, contextual card previews and opens |
| UX-I08 Stored-only recovery | Upload succeeds, attach fails/ack lost | Explicit stored-only state, no false “Attached”, no blind duplicate binary upload |
| UX-I09 Forbidden photo | Exact version of unrelated Inspection | No Open/Download/thumbnail through server or UI |
| UX-I10 Stale review | Review loaded; second actor changes content | Confirm & lock blocked; fresh review required |
| UX-I11 Signatures/handoff | Assigned Inspector plus manager | Inspector may add allowed signature, cannot see operational Unlock/Finalize; manager can complete when required roles present |
| UX-I12 Controlled unlock | Manager unlocks locked signed Inspection | All active signatures invalidated; clear warning; rereview/relock/resign required |
| UX-I13 Final PDF lifecycle | Authorized finalize, report generation fails then retries | One FinalSnapshot, unchanged old versions, eventual final report exact Open/Download |
| UX-I14 Mobile & accessibility | 320/375/768 px; touch/keyboard/screen reader | No page-level overflow; reachable controls; clear focus, status, signer touch input |
| UX-I15 Slow/interrupted network | Delay, timeout and refresh | No false success; canonical recovery and explicit known/unknown distinction |
| UX-I16 Full regression | Established browser tests + API security + release gate | Existing route/CAS/ownership/immutable signature PDF tests unchanged and green |

Use synthetic fixtures, two separate real sessions for collision tests, and record **observed** HTTP results and canonical DB reads where applicable. Browser mock tests complement but do not substitute for hosted acceptance.

### Proposed usability measurement

Before UX implementation collect a baseline from three role personas on desktop and field device; record task path, number of page transitions, success without coaching, time-to-complete, error count and retries. Proposed target: >=90% unassisted completion for the defined task sample, evidence available in-context, at most one direct Work→Inspection navigation, no accidental loss, zero security/data regressions. These are **targets**; no current measurement is claimed.

## J. Implementation decomposition / no-surprise integration

1. Shared task header/status components — no command change.
2. Focused room/step presentation in UnitInspections — no route schema change by default.
3. Evidence card using authenticated binary action; guided upload→link state orchestration around existing commands.
4. Review/Sign/Final manager handoff presentation, preserving pre-lock reread and CAS.
5. Unit navigation/Work task entry reuse; separate module extensions only after observed benefit.

Each runtime PR must include a screenshot/flow explanation, affected code, explicit invariants, browser regression cases, hosted role-specific acceptance plan, and rollback strategy. A PR touching API/domain/storage must be split out and justified separately.

**Status:** owner approved the principal UX direction 2026-11-19. Implementation PRs, localisation rollout, physical device/screen-reader proof, and security/production acceptance remain independent and incomplete.
