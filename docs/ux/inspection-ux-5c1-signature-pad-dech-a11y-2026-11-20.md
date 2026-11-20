# Portfolio — UX-5C.1: de-CH signature pad and accessible instructions

Date: 2026-11-20 · Epic #124 · Base `main@172daf4f86168289d27ddbb3cdabfc017ea61e90`.

## Scope and rationale

The approved primary language is Swiss Standard German (`de-CH`), while the signature drawing pad was still English, including its canvas accessible name, controls and local guidance. The signing workflow is safety-critical: uploading the image and registering the signer are **separate** operations. Instructions should remain visible and discoverable by assistive technology even when a drawing error appears.

This is a deliberately **small first localization slice**, not an app-wide translation or a claim of completed hosted UAT.

## Change

- Localize **only** `InspectionSignaturePad` visible labels, canvas accessible name, inline errors, and drawing/retry guidance into Swiss spelling (no `ß`). Apply `lang="de-CH"` only to this localized subtree: the rest of the app still contains English.
- Give the canvas an `aria-describedby` reference to a persistent instruction. When a local drawing/export error exists, also point to the error; the instruction does not disappear.
- Explicitly distinguish local ink from binary upload and later exact signer registration. Continue to offer the existing PNG/JPEG file-upload alternative via the parent flow.
- Update the full browser lifecycle test to use the localized drawing CTA and assert the pad language, canvas accessible label, and readable instruction.

## Invariants and scope exclusions

Do **not** change the canonical Inspection lifecycle, tenant/landlord Party eligibility, Inspector assignment, Manager/Admin authority, CAS, signature upload idempotency/fingerprints, PNG bytes/canvas pointer handling, immutability, snapshot/PDF rendering or backend error contracts. The parent `InspectionFinalizationPanel`, general Work/Unit UX and other English labels are separate localization work.

## Acceptance and rollback

1. Exact-head TypeScript and unit tests pass.
2. Full browser lifecycle passes with the localized CTA, including ambiguous upload recovery, signature registration, unlock invalidation, re-lock, final snapshot/PDF and existing Evidence tests.
3. Browser verifies `lang="de-CH"`, explicit canvas accessible name, and persistent `aria-describedby` instruction. Keyboard/file-upload fallback remains available.
4. No DB/API/auth/storage changes or new dependencies.
5. Revert only this contained presentation slice if a regression occurs. Preserve the unchanged command and artifact contracts.

**Not demonstrated by CI:** actual iOS/Android finger/stylus drawing, mobile Safari focus/VoiceOver, Android TalkBack, separate hosted Inspector/Manager logins, native-language UX acceptance, complete de-CH localization, or operational monitor incident #139. Those gates remain open.
