# GSV Mart

The deployed site uses Cloudflare Workers, D1 and R2. See [Cloudflare hosting instructions](cloudflare/HOSTING.md) for the live URL and deployment commands. The Node.js/SQLite instructions below apply to the separate local server.

The storefront is served by a Node.js backend. Products, admin accounts and sessions are stored in SQLite. Node.js 24 or later is required; no npm dependencies are needed.

## Run locally

In a terminal in this project folder:

```powershell
npm run admin:create
npm start
```

The first command asks for your admin email and a password of at least 12 characters. Password input is hidden. It creates an admin account without public registration. Run it again to create another authorized admin with a different email.

Open http://localhost:3000 and select **Admin** in the footer to sign in. Do not open index.html directly: products now load from the API. Sign-in sessions last eight hours. Sign out ends the session immediately.

If Node.js is not on your PATH, the runtime available in this workspace can be used:

```powershell
& 'C:\Users\Lenovo\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' create-admin.js
& 'C:\Users\Lenovo\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' server.js
```

## Data

The database is created at `data/gsv.sqlite`. Back up the data directory using SQLite's backup facilities or with the server stopped. It must be on persistent storage when hosted. The sample catalogue is imported from `seed-products.json` only on the first startup; deleting all products does not reimport it. Sample marketplace links are search links and must be replaced with real listings.

Previously saved browser-only products are not imported automatically. Those remain in the browser's localStorage and can be added to the shared catalogue through the editor.

## Deployment configuration

A `Dockerfile` is included for providers that support Docker. Mount a persistent volume at `/app/data`, writable by container user `node` (UID 1000), and set `APP_ORIGIN` to your HTTPS domain. The image excludes local databases, uploaded photos and credentials. Data migration must be handled separately. Create the admin through `node create-admin.js` in the running container's interactive terminal.

The health check is `GET /healthz`. Production startup requires a valid HTTPS `APP_ORIGIN`. The app handles shutdown signals to close its database cleanly. `.env.example` documents configuration; it is not loaded automatically.

The server reads these environment variables:

| Variable | Default | Purpose |
| --- | --- | --- |
| PORT | 3000 | Listening port |
| HOST | 127.0.0.1 | Bind address; use 0.0.0.0 where the hosting platform requires it |
| APP_ORIGIN | http://localhost:3000 | Exact public URL, without a trailing slash; required for request origin validation |
| NODE_ENV | unset | Set to production on an HTTPS host to enable Secure cookies |
| DATA_DIR | project/data | Persistent database directory |

Serve production traffic through HTTPS, set APP_ORIGIN to the real website URL, set NODE_ENV=production, and retain the SQLite data directory across deployments. This backend is intended for one server instance. Login attempts are limited per connection IP; if a reverse proxy is used, requests share that proxy's limit. Configure the proxy's rate limiting appropriately before public launch.

Admin API endpoints enforce sessions, request origin validation and CSRF tokens. Passwords use scrypt with a random salt. Session tokens are hashed in the database. Only explicitly listed storefront assets are publicly served; database files, source code and admin setup scripts are not accessible over HTTP.

## Checks

```powershell
npm test
```

The integration check uses a temporary database and verifies protected writes, URL/category validation, CSRF protection, product persistence after restart and logout.

The product editor accepts an optional JPEG, PNG or WebP photo up to 10 MB. The browser resizes it to a maximum dimension of 1600 pixels and uploads a JPEG through an authenticated endpoint. Photos are stored under `data/uploads`; include this directory in backups and persistent hosting storage. Existing photos can be kept, replaced or removed. Products without a photo use the catalogue's placeholders. Uploaded files are retained when products are deleted to avoid breaking references; storage cleanup is manual for now.

Password reset emails and an admin user management screen are not implemented yet.
