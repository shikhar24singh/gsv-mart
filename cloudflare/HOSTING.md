# Cloudflare hosting

Live website: https://gsv-mart.shikhar24-singhh.workers.dev

The site runs as a Cloudflare Worker, with D1 (`gsv-mart-db`) for product records, admins, sessions and login limits, and an R2 bucket (`gsv-mart-photos`) for product photos. The existing admin email and password hash were migrated. Products and photos were not imported, as requested. Local development data is independent of the hosted database.

## Updating the site

```powershell
npm ci
npm run cf:deploy
```

Wrangler must be signed in to the owning Cloudflare account. `cf:deploy` copies only the public storefront assets before deploying the Worker; it does not replace D1 records or R2 objects.

For a schema change, add an ordered SQL migration under `cloudflare/migrations`, then run:

```powershell
npx wrangler d1 migrations apply gsv-mart-db --remote
```

Do not use a static-only upload of the project root: the site requires the Worker, and the root contains backend files. The static asset directory is generated at `cloudflare/public` from a strict list of public files.

## Local Cloudflare testing

```powershell
npx wrangler d1 migrations apply gsv-mart-db --local
npm run cf:dev
```

The local D1 and R2 emulator data is separate from production. The cloud runtime integration check uses disposable in-memory test data:

```powershell
node cloudflare/worker.test.cjs
```

## Admin access and storage

Use the existing admin credentials in the live site's Admin login. No active local sessions were migrated. Product changes and uploaded photos are stored in Cloudflare and survive code deployments. Passwords retain their existing scrypt hashes. Session cookies use HttpOnly, SameSite=Strict and Secure over HTTPS. Login limits are persisted in D1 per client IP rather than shared across proxy clients.

The Worker validates request origins against its canonical URL. When using a custom domain, set `APP_ORIGIN` to that exact HTTPS origin (without a trailing slash) in Wrangler's variables or the Worker dashboard to restrict admin changes to that domain.

## Free allowances and backups

The Worker and D1 use the account's plan allowances. R2 was already enabled on the account, and a separate Standard bucket was created. Its free allowance is shared with the account's other buckets; R2 can bill usage beyond that allowance. No subscription upgrade was made. Review usage in the Cloudflare dashboard.

Official references:

- https://developers.cloudflare.com/workers/platform/pricing/
- https://developers.cloudflare.com/d1/platform/pricing/
- https://developers.cloudflare.com/r2/pricing/

Database backups can be exported with `wrangler d1 export gsv-mart-db --remote --output <private-backup-path>`. Keep backups private because they include admin emails and password hashes. D1 export does not include R2 photos; back up those separately. Uploaded files are retained when products are deleted; storage cleanup is manual.

The local SQLite admin creation command targets the local database only. Creating additional live admins requires an explicit D1 account setup/migration; it does not happen through a public registration endpoint.
