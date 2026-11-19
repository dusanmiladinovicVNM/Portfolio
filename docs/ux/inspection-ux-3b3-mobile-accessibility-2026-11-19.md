# Portfolio — UX-3B.3 mobile and accessibility hardening

Date: 2026-11-19  
Epic: #124  
Base: UX-3B.2 merged as `77ad184ed57bf9788bc67363f5feaeea15e294eb`.

## Findings and fixes

1. **Late workflow phases offscreen on narrow phones.** The stepper uses five columns and deliberate horizontal overflow. On lock/finalize the selected phase becomes #4/#5 and may be completely outside the scroll viewport. Keep its button inside the stepper's horizontal visible area on canonical lifecycle changes, explicit stage changes, and viewport resize. Adjust only the stepper's `scrollLeft`, never document scroll, and never move keyboard focus as a side effect of horizontal alignment.
2. **Selected phase unclear when horizontal content is clipped.** Display `Schritt n von 5 · {phase}` outside the scrollable viewport, with one polite announcement of phase changes. On narrow screens display a succinct horizontal-scroll affordance. This is the current *presentation stage*, not evidence of validated/completed workflow steps.
3. **Grid intrinsic sizing risk.** Constrain the Inspection editor to `minmax(0, 1fr)` and the stepper to `min-width:0;width:100%;max-width:100%`; preserve the local horizontal stepper scroll. Do not make the page itself scroll sideways.
4. **Review correction targeting the already selected room.** A Review `Fix` to the same SectionInstance URL previously left the user in the still-visible Review phase because navigation did not change the route. Explicitly select Inspect for this action and defer focus until the exact owner/section and visible Inspect heading match. Preserve the existing `navigate` call and its dirty/routing guards; do not change the SectionInstance canonical URL contract.
5. **Focus lost after lifecycle command removes a form.** On genuine canonical `draft→in_progress`, `in_progress→locked`, `locked→in_progress`, or `locked→finalized` status change, focus the new visible task heading. Never focus it on data PATCH, review reread, ordinary rerender, or a fresh deep-link load where the application shell already owns focus. Keep React hooks unconditional even if lifecycle becomes `cancelled`.

## Boundaries

- No new API, database, lifecycle status, role capabilities, documents or alternate authorization decision.
- Inactive field/Evidence/Review forms stay mounted; their `hidden` semantics and recoverable client state from UX-3B.2 stay unchanged.
- Current Evidence remains contextual to one selected SectionInstance; UX-4 consolidates it across rooms.
- Product-wide de-CH localization and capability-aware Unlock/Finalize hiding remain separate work.

## Automated acceptance

- [ ] Full typecheck and unit suite.
- [ ] Existing browser full lifecycle (Save & Continue, CAS 409, stale Review, exact Evidence version retry, signatures, immutable final PDF).
- [ ] New browser keyboard activation of Evidence stage and focus on active heading.
- [ ] 320/375/390/768 CSS px phase navigation stays in the viewport and has a visible summary + usable tap targets.
- [ ] Locked step #4 and finalized step #5 automatically visible at 320 px without page overflow.
- [ ] Same-section Review Fix reveals Inspect and preserves exact URL and focus.
- [ ] Full backup and restore release rehearsal.
- [ ] Independent real mobile touch and VoiceOver/TalkBack testing still required; browser CI is not device UAT.

**Review and merge gate:** all CI steps pass; no regression in canonical ownership/security or write recovery. Production deployment is a separately verified fact, not inferred from GitHub merge.
