# Portfolio — Inspection mobile & accessibility audit (UX-0B)

**Date:** 2026-11-18  
**Epic:** [#124](https://github.com/dusanmiladinovicVNM/Portfolio/issues/124) · **PR:** [#131](https://github.com/dusanmiladinovicVNM/Portfolio/pull/131)  
**Pinned source:** main at \`316544ec0f76baee94efbeed7d344939f4b81f0e\`  
**Scope:** static review of React/CSS, the WebDriver browser suite and accessibility unit guardrails. **No physical touch/VoiceOver/TalkBack session or new browser run was performed.** Do not treat hypotheses as observed production failures.

See [architecture/task map](portfolio-ux-architecture-2026-11-18.md) and [Inspection wireflow](inspection-wireflow-2026-11-18.md).

## 1. Executive decisions

The codebase already contains substantive responsive and accessibility safeguards; a wholesale UI rewrite is not warranted. However, the field Inspection flow has two concrete **P1 code-level accessibility gaps**, several P1 operator-flow issues and an Inspection-specific mobile acceptance coverage gap. Fix **accessible form naming and save-state announcements before cosmetic layout work**. Retain pointer/touch signature drawing, keyboard focus styles, 44px mobile touch rules, accessible links, deep links, dirty guards and canonical recovery.

### Proof categories

- **CONFIRMED CODE** = a condition directly demonstrable from inspected source/markup.
- **CONFIRMED TEST COVERAGE** = a test assertion is present in source; this audit did not rerun it.
- **UX RISK / HYPOTHESIS** = supported by UI structure but needs actual viewport/assistive-technology observation.
- **ACCEPTANCE GAP** = a particular production/mobile test has not been proven; not a confirmed deployed defect.

### Inspection-specific findings

| ID | Priority | Evidence level | Code / test evidence | Impact | Minimal correction and proof |
| --- | --- | --- | --- | --- | --- |
| MA-01 | **P1 accessibility** | **CONFIRMED CODE** | [UnitInspections.tsx lines 353–496](https://github.com/dusanmiladinovicVNM/Portfolio/blob/316544ec0f76baee94efbeed7d344939f4b81f0e/apps/web/src/dossier/UnitInspections.tsx#L353-L496) renders generic input/select/textarea controls without \`id\`, \`aria-label\` or \`aria-labelledby\`. The visible item label is a **separate sibling** at [lines 1520–1544](https://github.com/dusanmiladinovicVNM/Portfolio/blob/316544ec0f76baee94efbeed7d344939f4b81f0e/apps/web/src/dossier/UnitInspections.tsx#L1520-L1544), not a control wrapper or a \`htmlFor\` association. | Schema question not programmatically associated with its answer control; repeated “Comment” fields also lack question context. | Stable per-Inspection/SectionInstance/Item IDs; \`label htmlFor\` or \`aria-labelledby\` for single controls; \`fieldset/legend\` for multiselect groups; question-scoped comment names; invalid + description association. Test accessible name for all supported schema types. |
| MA-02 | **P1 accessibility** | **CONFIRMED CODE** | The \`autosaveStatus\` computed in [UnitInspections.tsx lines 813–830](https://github.com/dusanmiladinovicVNM/Portfolio/blob/316544ec0f76baee94efbeed7d344939f4b81f0e/apps/web/src/dossier/UnitInspections.tsx#L813-L830) is rendered in plain spans at [1464–1470](https://github.com/dusanmiladinovicVNM/Portfolio/blob/316544ec0f76baee94efbeed7d344939f4b81f0e/apps/web/src/dossier/UnitInspections.tsx#L1464-L1470) and [1574–1584](https://github.com/dusanmiladinovicVNM/Portfolio/blob/316544ec0f76baee94efbeed7d344939f4b81f0e/apps/web/src/dossier/UnitInspections.tsx#L1574-L1584), without a live region. Save errors separately use \`role=alert\`. | Screen-reader users have no explicit announcement guarantee for saving/saved/unsaved transitions. | One canonical \`role=status\` / \`aria-live=polite\` announcer; visually duplicate messages can be \`aria-hidden\` to prevent double speech; assert announced text on controlled state changes and no false “Saved” on rejected/ambiguous writes. |
| MA-03 | **P1 navigation UX / accessibility** | **CONFIRMED CODE + UX RISK** | [App.tsx lines 101–120](https://github.com/dusanmiladinovicVNM/Portfolio/blob/316544ec0f76baee94efbeed7d344939f4b81f0e/apps/web/src/App.tsx#L101-L120) computes focus key from Unit and **tab**, not \`inspectionId\` or \`inspectionSectionInstanceId\`. [App.tsx lines 149–160](https://github.com/dusanmiladinovicVNM/Portfolio/blob/316544ec0f76baee94efbeed7d344939f4b81f0e/apps/web/src/App.tsx#L149-L160) focuses an h1 when this key changes; [UnitInspections.tsx lines 1400–1460](https://github.com/dusanmiladinovicVNM/Portfolio/blob/316544ec0f76baee94efbeed7d344939f4b81f0e/apps/web/src/dossier/UnitInspections.tsx#L1400-L1460) changes sections through route links. | After selecting another Inspection/room, logical focus placement and screen-reader context are not intentionally managed; a removed focused link may leave focus in an unhelpful location. | On user-initiated section/Inspection navigation, transfer focus to the new task/section heading or the first control *after* canonical content mounts; retain focus appropriately for background autosave; do not force focus after every asynchronous response. Test keyboard next/previous and screen-reader announcement. |
| MA-04 | **P1 field-flow UX risk** | **CONFIRMED CODE + UX HYPOTHESIS** | [UnitDossier.tsx lines 103–162](https://github.com/dusanmiladinovicVNM/Portfolio/blob/316544ec0f76baee94efbeed7d344939f4b81f0e/apps/web/src/dossier/UnitDossier.tsx#L103-L162) always renders full dossier navigation before the active module. At [styles.css lines 529–532](https://github.com/dusanmiladinovicVNM/Portfolio/blob/316544ec0f76baee94efbeed7d344939f4b81f0e/apps/web/src/styles.css#L529-L532) its four groups stack one per row; the global sidebar also stacks at <=520 px. | Three layers of navigation may place the active field task several screen-heights below the viewport on a phone. The exact travel/scroll burden is not measured. | Focused Inspection mobile shell with compact context, an expandable dossier navigation and a direct “Back to Unit/Work” affordance. Test from Work click until first editable field: number of scrolls and taps at 320/375/390 px. |
| MA-05 | **P1 mobile acceptance** | **CONFIRMED TEST COVERAGE + ACCEPTANCE GAP** | [browser-workflow.mjs](https://github.com/dusanmiladinovicVNM/Portfolio/blob/316544ec0f76baee94efbeed7d344939f4b81f0e/apps/web/test/browser-workflow.mjs) explicitly sets 390 px (line ~804) and 320 px (line ~900), with some 320 px checks for Meters/Assets (~3774/4177), then returns to 1440 px. **Inspection tests start after ~5880, with no later \`setWindowRect\` call**. Signature canvas test sends synthetic \`PointerEvent(pointerType="pen")\` (~278–295, 7753–7767), not hardware finger/touch. | Existing responsive browser assertions do **not** establish Inspection usability at mobile widths or real camera/touch keyboard. | Add dedicated 320/375/390/768 px Inspection browser assertions: no clipped actionable element, stable sticky controls, room navigation, signature, evidence upload/link; separate physical Android/iOS touch/photo UAT with measured results. |
| MA-06 | **P2 accessibility / alternative input** | **CONFIRMED CODE + UX RISK** | [InspectionSignaturePad.tsx lines 77–138](https://github.com/dusanmiladinovicVNM/Portfolio/blob/316544ec0f76baee94efbeed7d344939f4b81f0e/apps/web/src/dossier/InspectionSignaturePad.tsx#L77-L138) handles pointer drawing; [lines 180–216](https://github.com/dusanmiladinovicVNM/Portfolio/blob/316544ec0f76baee94efbeed7d344939f4b81f0e/apps/web/src/dossier/InspectionSignaturePad.tsx#L180-L216) renders a labeled canvas but no \`tabIndex\`/keyboard drawing control. Crucially [InspectionFinalizationPanel.tsx around 1184–1212](https://github.com/dusanmiladinovicVNM/Portfolio/blob/316544ec0f76baee94efbeed7d344939f4b81f0e/apps/web/src/dossier/InspectionFinalizationPanel.tsx#L1184-L1212) **already provides a PNG/JPEG file fallback**. [styles.css 2544](https://github.com/dusanmiladinovicVNM/Portfolio/blob/316544ec0f76baee94efbeed7d344939f4b81f0e/apps/web/src/styles.css#L2544) correctly sets \`touch-action: none\`. | Drawing itself is pointer-only, but there is an existing alternative. The issue is accessibility and discoverability of the file route; not absence of every alternative to drawing. | Make upload alternative clearly available and keyboard/AT-operable, with signer identity and accepted file guidance. Preserve pointer capture, PNG export and retry identity. Validate touch stroke, cancel, finger scroll outside canvas and alternative file flow. |
| MA-07 | **P2 mobile discoverability** | **CONFIRMED CODE + UX RISK** | [InspectionWorkflowStepper.tsx](https://github.com/dusanmiladinovicVNM/Portfolio/blob/316544ec0f76baee94efbeed7d344939f4b81f0e/apps/web/src/dossier/InspectionWorkflowStepper.tsx) renders a noninteractive \`nav > ol\` progress display. [styles.css lines 2960–3003](https://github.com/dusanmiladinovicVNM/Portfolio/blob/316544ec0f76baee94efbeed7d344939f4b81f0e/apps/web/src/styles.css#L2960-L3003) enables horizontal stepper scrolling with 585px min-width. | Mobile user may not discover hidden steps or realize the stepper is an indicator, not a navigation control; not measured. | Compact current-step label + progress or discoverable step navigation; meaningful \`aria-current=step\` preserved. Do not create fake clickable transitions to illegal lifecycle states. |
| MA-08 | **P2 robustness hypothesis** | **CONFIRMED CODE + ACCEPTANCE GAP** | [styles.css lines 106–112](https://github.com/dusanmiladinovicVNM/Portfolio/blob/316544ec0f76baee94efbeed7d344939f4b81f0e/apps/web/src/styles.css#L106-L112) sets \`.workspace { overflow: hidden; }\`. Stepper has its own scroll, sticky toolbar top and save bar bottom. Tests compare only **documentElement** scrollWidth/clientWidth at mobile widths, not nested content clipping. | A passing page-level overflow assertion can coexist with clipped controls inside an overflow-hidden ancestor. No actual clipping is established by this audit. | Measure bounding boxes and scrollWidth/clientWidth for each interactive form/list; ensure visible interactive controls aren't clipped or hidden behind sticky UI/keyboard; avoid a global CSS overflow rewrite without reproduction. |
| MA-09 | **P2 field action affordance** | **CONFIRMED CODE + UX HYPOTHESIS** | [UnitInspections.tsx lines 1401–1470](https://github.com/dusanmiladinovicVNM/Portfolio/blob/316544ec0f76baee94efbeed7d344939f4b81f0e/apps/web/src/dossier/UnitInspections.tsx#L1401-L1470) has Next/Previous links in sticky top toolbar, a separate sticky Save now at bottom and a later Review section; next is navigational, not save. | Operator may mistake “Next” as committing pending answers; mobile keyboard may obscure sticky bottom bar. Dirty blockers correctly exist, but operator intent needs more explicit wording. | Keep explicit autosave and native dirty guard; make one clear “Save & continue” or an equally unambiguous safe sequence only after proving CAS success. Do not turn Next into a silent write. Test pending/failed autosave with keyboard open. |
| MA-10 | **P2 density / a11y UX** | **CONFIRMED CODE + UX HYPOTHESIS** | [InspectionFindingsEvidence.tsx lines ~880–1100](https://github.com/dusanmiladinovicVNM/Portfolio/blob/316544ec0f76baee94efbeed7d344939f4b81f0e/apps/web/src/dossier/InspectionFindingsEvidence.tsx#L880-L1100) renders Findings list + Create Finding form + Evidence list + upload form + Advanced; separate attach form follows at ~1273. At <=760px evidence grids collapse to one column. | A single room's secondary tasks can dominate mobile scroll and obscure the next section. The upload/attach split makes “stored” vs “attached” confusing (already UX01/02 in architecture audit). | Collapse add forms until triggered, put verified evidence preview/Open/Download in the room; show explicit Uploading→Linking→Attached states, preserving exact version ownership and safe recovery. |
| MA-11 | **P2 test depth** | **CONFIRMED TEST COVERAGE** | [accessibility.test.ts](https://github.com/dusanmiladinovicVNM/Portfolio/blob/316544ec0f76baee94efbeed7d344939f4b81f0e/apps/web/test/accessibility.test.ts) asserts a few shared contrast colors and presence of skip-link/focus CSS; browser suite also checks Work focus and mobile navigation touch height. No per-schema-input accessible-name assertion in inspected tests. | Existing green accessibility guardrails cannot certify generated Inspection field semantics. | Add accessible-name contract tests for text/number/date/textarea/select/boolean/multiselect and question-specific comments, form errors and live save status. |

## 2. Preserve what already works

**Confirmed safeguards in source (do not regress):**
- \`.inspection-signature-canvas { touch-action: none; }\`, Pointer Events and pointer capture with graceful fallback in synthetic browsers.
- Mobile rules at <=760 px for 44px nav/button targets; at <=860 px the room/editor layout becomes one column; at <=520 px shell/dossier nav stack.
- Existing skip link, focus-visible outlines, workspace anchor links, keyboard-operable native select/input/button/details elements.
- \`App.tsx\` has intentional focus management for major route/tab changes; refine **nested** task focus rather than removing it.
- Pending write and dirty-navigation guards, exact-section CAS, \`role=alert\` for errors, pre-lock canonical reread, stable upload keys and explicit final read-only state.
- Existing PNG/JPEG signature-file alternative, accepted photo MIME filter/camera capture hint and large-photo resize/compression logic.
- Browser tests already verify 320/390 shell and limited module layouts; do **not** claim “no responsive tests exist”.

Do not remove valid defensive checks to simplify presentation.

## 3. Proposed minimal implementation contract

### A. Schema field naming (first targeted change)

Create an ID prefix from actual Inspection ID + SectionInstance ID + Item ID; each repeated room's items need unique DOM IDs. Component \`Field\` should accept an accessible label ID / input ID (not derive ambiguous duplicate IDs from only a schema item ID).

For single-value widgets, render either:
- \`<label htmlFor={inputId}>{item.label}</label>\` and \`<input id={inputId} ... />\`; or
- \`<span id={labelId}>...</span>\` with \`aria-labelledby={labelId}\` on the control.

For \`multiselect\`: group all choices under \`<fieldset><legend>{item.label}</legend>...\`; each checkbox retains its own readable option label. Preserve existing \`DraftEntry\`, \`touched\`, per-item itemId, normalized answer and section PATCH semantics.

For question comments use names like “Comment for [question label]”, not only repeated “Comment”. Associate required/invalid status and error messages through \`aria-describedby\`, \`aria-invalid\` when appropriate; do not pretend missing required values have been saved.

### B. Save status announcer

Introduce **one** screen-reader live status source. Avoid repeating speech for identical top toolbar and bottom save-bar text. Only use \`Saved\` after matching canonical PATCH acknowledgement; \`Saving\` while in flight; \`Unsaved\` during dirty changes; \`Conflict\` / \`Save failed\` when appropriate. Error detail remains \`role=alert\`, without concurrent duplicate announcements.

Do not turn save status into server authority for lock: canonical pre-lock review remains required.

### C. Focus and keyboard

On **user-initiated** route navigation into a different Inspection/SectionInstance, place focus in the new task heading or first relevant field after it renders. Do not force focus on every render, autosave confirmation or progress update. Existing navigation blocker must still run and remain the only authority about leaving unsaved data.

Use actual heading hierarchy for task and section. A “Next room” link is not a sign/save action; an explicit save & continue orchestration must await safe save confirmation and cannot swallow CAS conflict.

### D. Small-screen context

Keep canonical Unit routing and the existing grouped dossier navigation. On selected Inspection mobile view, avoid rendering an expanded global nav plus full dossier nav as the only route to work; provide compact task-first entry/context. The design must still let staff escape to Property/Unit/Work without browser history and without unsafe draft loss.

Avoid invasive CSS changes before reproducing clipping on actual 320px/375px/390px/768px viewports.

## 4. UX-2/UX-3 test matrix (proposed, not already executed)

| ID | Technique | Expected acceptance |
| --- | --- | --- |
| A11Y-01 | Browser accessible-name checks for every schema item type (including conditional and repeated-room) | Question label is programmatically associated; no anonymous editable controls. |
| A11Y-02 | Keyboard-only complete section, comments, Next/Previous and Review/Fix | Visible focus, logical destination after task switch, no unexpected focus move on autosave. |
| A11Y-03 | Screen reader (NVDA/VoiceOver/TalkBack as applicable) | Announces current room, field label, required state, save state, conflict and disabled actions intelligibly. |
| A11Y-04 | Controlled autosave, failed PATCH and 409 | Exactly one intelligible announcement; local draft preserved; no false saved/completed state. |
| MOB-01 | WebDriver at 320, 375, 390 and 768 CSS px | Current Inspection/room/primary action reached without accidental clipping/hidden controls; check each actionable element's box, not only body scrollWidth. |
| MOB-02 | Real touch input (finger/stylus) | Canvas captures stroke without page scroll during stroke; page scroll works outside canvas; Clear/Draw/Submit accessible. |
| MOB-03 | Keyboard-only signer alternate | No drawing required to use accessible PNG/JPEG file fallback; signer role and identity clearly selected. |
| MOB-04 | Real mobile camera upload and permissions | Correct MIME/size handling and safe explicit outcome when browser denies camera or unsupported HEIC is selected. |
| MOB-05 | Upload success, attach failure/timeout, then refresh | No “Attached” before canonical relation; no duplicate binary; safely resume exact version when server-side discovery permits. |
| MOB-06 | Soft keyboard, sticky header/footer | Focused input and buttons remain visible/reachable and scrollable; no overlay blocks consent/confirmation. |
| MOB-07 | Long dynamic schema: multiple rooms/conditional requirements | One active room, progress semantics correct, can repair missing required responses and return to Review. |
| SEC-01 | Inspector A versus B exact Inspection/photo/report | 403/forbidden as dictated by server; no cross-assignment text, preview, download or stale async leak; preserve PR #127 tests. |
| LIFE-01 | Locked/Finalized, controlled unlock and report | Only permitted actions visible; immutable history/snapshot unchanged; no unapproved lifecycle edits. |

Evidence fields: tested commit and deployed SHA, device/browser/assistive technology, actual viewport, persona/actor, selected synthetic Inspection/SectionInstance, steps, observed result, screenshot/video and optional read-only canonical verification. Keep private customer data/tokens out of PR artifacts.

## 5. Work ordering and PR boundaries

1. **UX-2A (first runtime PR):** accessible label wiring and single save-state announcement; *no layout overhaul*, domain/API change, or rewrite of autosave logic. Unit/browser tests for all item types, saved/dirty/error/conflict.
2. **UX-2B:** focused-section focus handling and small reusable task/status primitives; existing navigation blocker/CAS safe. Keyboard/deep-link tests.
3. **UX-3:** mobile Inspection task shell, compact nav, room focus and progressive disclosure. Full 320/375/390/768 browser checks.
4. **UX-4:** Evidence preview/actions and upload-link user task; exact version + binary auth recovery.
5. **UX-5:** Signer handoff/role controls and finalization; real touch / screen reader UAT and broad negative regression.

Keep the implementation PRs as narrow as their proof. The production [risk-based acceptance register](../uat/risk-based-production-acceptance-2026-11-18.md) remains independent; new code tests are not a substitute for previously unperformed hosted role/device/recovery tests.

## 6. Review gate

**Approve first:** MA-01/02 correction contracts, nested focus semantics and non-negotiable security/CAS guardrails. **Measure before asserting:** actual screen-height scroll burden, clipped controls, touch signature reliability and participant task success. These observations are not established by static inspection alone.

**No runtime modifications are included in this UX-0B document.**
