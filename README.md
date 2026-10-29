# Plot to Ghar

Production property-purchase and construction finance tracker.

## What it covers
- Plot lock, registry, possession, mutation and complete construction journey
- Funding sources and loan disbursement tracking
- Bank/cash transfers that do **not** inflate project cost
- Actual expenses, contractor/vendor advances, advance adjustments and refunds
- Material quantity × rate purchases
- Vendors, contractors and material catalogue
- Phase/category reports
- Receipt/evidence attachments
- Offline-first IndexedDB
- End-to-end encrypted cross-device sync via Vercel Blob
- JSON backup/restore
- PWA + Android APK from the same codebase

## Financial integrity
The ledger derives balances; it does not store mutable calculated balances.

- Funding received: increases account + funding, not cost
- Bank → cash: transfer only, cost unchanged
- Expense: decreases account and increases cost
- Advance: decreases account but does not increase cost
- Advance adjustment: converts advance into recognised cost without another cash movement
- Refund: increases account and reduces recognised cost
- Direct lender payment: increases funding and project cost without passing through a personal account

## Stack
- React + TypeScript + Vite
- Dexie / IndexedDB
- Vercel Functions + Vercel Blob (encrypted payloads)
- vite-plugin-pwa
- Capacitor Android
- Vitest
- GitHub Actions
- Vercel Git deployment

## Local development
```bash
npm install
npm run test
npm run dev
```

## Web production build
```bash
npm run build
```

## Android release signing
The Android workflow always produces an installable debug APK. It also produces a stable signed release APK when these repository secrets are configured:

- `ANDROID_KEYSTORE_BASE64`
- `ANDROID_KEYSTORE_PASSWORD`
- `ANDROID_KEY_ALIAS`
- `ANDROID_KEY_PASSWORD`

Never commit the keystore or its passwords.

## Cloud sync security
A 256-bit sync key is generated on-device. Project snapshots and attachments are AES-GCM encrypted **before upload**. The server receives only ciphertext. The sync-key hash is used as an unguessable storage namespace. Vercel does not receive the decryption key.

Back up the sync key separately. Losing it makes the encrypted cloud copy unrecoverable.

## Free-tier design
The critical app works offline. There is no Redis, paid queue, paid LLM, or paid database dependency. Cloud sync and encrypted attachments use Vercel Hobby allowances; if cloud is unavailable, local accounting keeps working.
