# Public web production smoke — 2026-09-24

## Scope

This record captures the first public Vercel production acceptance for Portfolio. It is evidence for the browser-hosting boundary only; it does not close the separate production policy items for abuse/rate limits, backup scheduling, secondary binary backup, or OAuth operations.

## Deployed source

- Repository: `dusanmiladinovicVNM/Portfolio`
- Frontend source commit: `57859316938dc5d918d257d2cc3d1d883b08fa06`
- GitHub commit status: `Vercel = success`
- Vercel Production domain: `https://portfolio-iota-wine-47.vercel.app`
- Supabase project ref: `fiowxgamyjjcondlheqg`
- API base: `https://fiowxgamyjjcondlheqg.supabase.co/functions/v1/api`

The Vercel Production build uses these browser-safe build-time variables:

```text
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
VITE_API_BASE_URL
```

Vercel requires variables with a public framework prefix such as `VITE_` to use Config visibility rather than Secret visibility.

## Acceptance evidence

### Production frontend and authentication

The Production domain served the Vite application instead of the configuration guard after the three required `VITE_*` variables were added and the Production deployment was rebuilt.

Supabase Auth accepted the browser sign-in. The browser then issued the dashboard preflight and canonical read:

```text
OPTIONS /reporting/dashboard?asOf=2026-09-24 -> 204
GET     /reporting/dashboard?asOf=2026-09-24 -> 200
```

The dashboard rendered hosted canonical data, including one Property and one Unit from the smoke dataset.

### Deep route and SPA fallback

The browser directly loaded and refreshed this canonical Unit inspection route:

```text
/properties/60754ba0-182a-4439-be41-ccf210636090/units/1da56ed7-f0c9-44f5-8fda-8cded0252a0e
  ?tab=inspections
  &inspectionId=ea6ec23b-ecb2-47d5-a36e-e7832cdd1d4a
  &asOf=2026-09-24
```

After the hard refresh, the SPA restored the same Unit dossier and selected inspection.

Hosted API evidence included:

```text
GET /units/1da56ed7-f0c9-44f5-8fda-8cded0252a0e                         -> 200
GET /units/1da56ed7-f0c9-44f5-8fda-8cded0252a0e/inspections             -> 200
GET /inspections/ea6ec23b-ecb2-47d5-a36e-e7832cdd1d4a                  -> 200
GET /inspection-schemas                                                  -> 200
GET /inspection-staff                                                    -> 200
GET /inspections/assigned-to-me                                          -> 200
GET /documents                                                           -> 200
```

The selected canonical data was:

```text
Property:   SMOKE-001 / Hosted Smoke Property
Unit:       SMOKE-U-001 / Unit 1
Inspection: SMOKE-INSP-SIG-001
Status:     finalized
Lifecycle:  v4
Content:    r2
Snapshot:   v1
```

### Final-report reuse and idempotency

Before the browser command, the canonical final report was:

```text
Document ID:
4d7ea04b-ae88-45c0-be0f-93e0f120c4b4

DocumentVersion ID:
87428d4c-0749-46eb-b616-722f902ba190

versionNumber: 1
byteSize:      5622
sha256:        d983d00ef7028b154b05f8fea218d2dcd7a426dbde085945194a589b0c71558e
finalizedAt:   2026-09-24 07:38:29.526+00
```

The Production browser invoked:

```text
POST /inspections/ea6ec23b-ecb2-47d5-a36e-e7832cdd1d4a/final-report -> 200
```

A canonical DB reread after the POST returned the same Document ID, DocumentVersion ID, version number, byte size, SHA-256, and `finalizedAt`. No version 2 was created.

This proves public-host final-report reuse is idempotent for the hosted signed inspection.

### CORS boundary

The Production API secret is configured with the single allowed browser origin:

```text
https://portfolio-iota-wine-47.vercel.app
```

The production origin completed preflight and authenticated API reads successfully.

A different Vercel deployment origin:

```text
https://portfolio-mrdusanmiladinovic-6391.vercel.app
```

was deliberately used as the negative control. The browser surfaced `Dashboard unavailable / Failed to fetch`, while hosted Edge logs recorded:

```text
OPTIONS /reporting/dashboard?asOf=2026-09-24 -> 403
OPTIONS /reporting/dashboard?asOf=2026-09-24 -> 403
```

The foreign origin therefore cannot cross the Portfolio API CORS boundary.

## Result

```text
Public Vercel production deployment     PROVEN
Production Vite configuration           PROVEN
Supabase Auth                            PROVEN
Production-origin CORS positive path    PROVEN
Foreign-origin CORS rejection           PROVEN
Dashboard canonical read                PROVEN
Deep SPA route                           PROVEN
Hard refresh on deep route              PROVEN
Unit dossier / inspection read          PROVEN
Immutable final snapshot visibility     PROVEN
Final-report generation/reuse            PROVEN
Final-report idempotency                 PROVEN
```

The public browser-hosting acceptance is complete.

The following remain separate production-readiness work and are not claimed by this smoke:

- edge/platform request, upload, abuse, and concurrency limits;
- PostgreSQL backup destination, schedule, restore evidence, and retention;
- secondary binary backup policy;
- Google OAuth production publishing/verification and credential-rotation ownership;
- broader multi-user concurrency/load coverage;
- production observability and alerting.
