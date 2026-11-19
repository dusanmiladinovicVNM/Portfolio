# Portfolio — UX-4C: authorized on-demand Evidence previews

Date: 2026-11-19 · Epic #124 · Base: `main@5ef3a65a437cc9c2d98cddd39007fe330384db88`

## Security verification

The canonical Inspection bundle includes Evidence relations with **exact** `documentVersionId`, but no trusted filename/MIME metadata. The existing `GET /document-versions/:id/content` endpoint already returns buffered binary through `getDocumentVersionContentQuery`:

- Requires authenticated `documents:read` capability.
- For Inspector, additionally resolves the owning Document and checks Inspection-level read access via `assertDocumentReadable`.
- Validates stored binary metadata/integrity and enforces the buffered binary delivery ceiling.
- Responds `private, no-store`, `nosniff` and safe `attachment` disposition.

Therefore UX-4C reuses **only** `PortfolioApi.getBinary(documentVersionContentPath(exactRelation.documentVersionId))` on a **real user click**. No storage URL, unsigned public download, new endpoint, proxy or global Documents lookup.

## Design decision

- Add one operator-selected viewer within the all-room Evidence overview, not 100+ eagerly mounted per-photo binary fetchers.
- Each `Foto ansehen / Datei öffnen` button belongs to an **existing canonical Evidence relation** in the owner-validated Inspection bundle. Selecting it passes only its immutable exact DocumentVersion to the authorized binary read; never a guessed document ID or latest version.
- No automatic image GET on initial Inspection load, stage switch, or room navigation.
- Preview only known-safe raster types: JPEG, PNG, WebP, GIF. Never insert untrusted SVG, HTML or script MIME in an inline viewer. Other types retain **download** functionality after authorized read, with no implicit inline render.
- Image bytes remain a Blob in the mounted viewer, displayed through a short-lived `blob:` URL. Abort outstanding read and revoke its object URL on selection change, phase hiding or unmount. A new selection replaces the prior component and its binary. Downloads create a separate short-lived object URL which is revoked after browser handoff; no persistent cache.
- Missing/403/integrity/binary errors are shown as accessible alerts, with no image preview; the operator can close and retry by explicitly selecting the same relation.
- Focus moves to the selected viewer's close control; close restores focus to the invoking Evidence card. Escape closes while focus is inside the preview. This is an **inline region**, not a modal; it does not trap the keyboard.
- Download names derive from a safely sanitized caption and the **server-returned Blob MIME type**, never from untrusted path characters or client-supplied metadata. No raw IDs exposed in clickable hrefs.

## Limits / acceptance

- This PR is the **on-demand gallery/preview and download slice**, not an offline media library, infinite gallery, fullscreen lightbox, camera-capture UI, or background thumbnail prefetch. Automatic thumbnails are deliberately avoided until binary volume and device performance are measured.
- Server-side role authorization is the source of truth; a frontend CTA never grants document access. No business lifecycle, CAS, Evidence attach, stored-only recovery, idempotency key, PDF or role capability changes.
- [ ] Typecheck + unit tests for MIME allowlist and filename sanitization.
- [ ] Browser: no binary requests while browsing central cards; simulated 403 shows error without leaking image; explicit second click returns Blob-backed image and download control.
- [ ] Browser: preview close restores focus, phase switch releases viewer, return to Evidence does not refetch.
- [ ] Browser: all existing Evidence owner/room/SectionInstance, upload duplicate, CAS, signatures, PDF and backup/restore gates pass.
- [ ] Mobile 320/375/390/768: preview and actions visible without page-wide overflow.
- [ ] Manual hosted Safari/Chrome/Firefox and real-phone touch + VoiceOver/TalkBack UAT is separate. No production deployment claim without verification.

### Adjacent work

UX-5 should independently resolve capability-aware Inspector vs Manager/Admin Unlock, Sign, Finalize and Report actions. A new `de-CH` localization pass remains a separate PR.
