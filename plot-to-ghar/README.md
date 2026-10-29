# Plot to Ghar

Production monorepo for a private plot-purchase-to-construction finance manager.

## Apps
- `web/`: Next.js PWA/API deployed on Vercel Hobby.
- `android/`: native Android WebView shell for the same production app.

## Financial invariants
- Funding is not expense.
- Bank→cash is a transfer, not expense.
- Advances become cost only when adjusted.
- Refunds reduce cost.
- Corrections are reversal entries, not destructive edits.

## Production services
- Vercel: hosting/API.
- Vercel Blob (private): project state, immutable transactions, audit trail, receipts/PDFs.
- GitHub Actions: tests + APK artifacts.

No paid service is required for the core application.
