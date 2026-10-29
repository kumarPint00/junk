# Plot to Ghar

Production mobile-first property acquisition and building-construction finance manager.

## Canonical source

- `plot-to-ghar/web` — Next.js PWA + authenticated API
- `plot-to-ghar/android` — Android WebView shell
- `.github/workflows/ci.yml` — financial tests, TypeScript and production web build
- `.github/workflows/android-apk.yml` — installable Android APK build

## Production architecture

- Web/API hosting: Vercel Hobby
- Canonical ledger database: Neon Postgres
- Private receipts/photos/PDFs: Neon Object Storage
- Android builds: GitHub Actions
- App authentication: private household PIN + HMAC HttpOnly session
- Offline transaction retry queue in the PWA

The accounting engine keeps funding, transfers, advances and recognized expenses separate. Bank-to-cash transfers and loan credits never inflate project cost.

The Vercel project is `plot-to-ghar` and the production alias is `https://plot-to-ghar.vercel.app`.

See `plot-to-ghar/README.md` for implementation and operating details.
