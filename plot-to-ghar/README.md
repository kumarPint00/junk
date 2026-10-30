# Plot to Ghar

Production monorepo for a private plot-purchase-to-building-completion finance and evidence manager.

## Applications
- `web/`: Next.js PWA + API deployed to Vercel Hobby.
- `android/`: hardened native Android WebView shell pointed at the stable Vercel production domain.

## Production architecture
- **GitHub**: source control and CI.
- **GitHub Actions**: financial integrity checks, TypeScript/build validation and Android APK artifacts.
- **Vercel Hobby**: web/PWA hosting and server API.
- **Neon Postgres free tier**: durable project configuration, immutable transactions, audit trail, login throttling and restore points.
- **Private S3-compatible object storage**: receipts, PDFs and construction evidence.
- **Browser local storage + service worker**: offline snapshot and transaction outbox.

Core operation does not require a paid service.

## Financial invariants
- Funding is never an expense.
- Bank → cash is a transfer and never increases project cost.
- Contractor advances remain advances until explicitly adjusted.
- Refunds reduce recognized project cost.
- Loan repayments reduce available cash but do not inflate construction cost.
- Corrections are appended as reversal entries; original financial records are never destructively edited.
- Duplicate transaction protection runs before cloud posting.
- Backup restore creates a server-side restore point first.

## Current lifecycle
The app starts at **Plot Locked / Registry Pending** and continues through:
1. Registry and acquisition.
2. Possession and mutation.
3. Design/pre-construction.
4. Phase-wise building construction.
5. Materials, vendors and contractors.
6. Finishing and project completion.

## Android release signing
The CI workflow always creates an installable APK. For a stable production signature across upgrades, configure these GitHub Actions secrets:

- `ANDROID_KEYSTORE_BASE64`
- `ANDROID_KEYSTORE_PASSWORD`
- `ANDROID_KEY_ALIAS`
- `ANDROID_KEY_PASSWORD`

Without these secrets the release APK is intentionally signed with the Android debug key and is suitable for direct testing, not long-term store/update distribution.

## Production environment
Server credentials stay in Vercel project environment variables/integration credentials and are never committed to GitHub.

Required application variables:
- `DATABASE_URL`
- `APP_PIN`
- `SESSION_SECRET`

Object storage variables:
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `AWS_ENDPOINT_URL_S3`
- `AWS_REGION`
- `AWS_SESSION_TOKEN` when required
- `OBJECT_STORAGE_BUCKET`

## Health
`GET /api/health` returns database/storage configuration status and application version without exposing credentials.
