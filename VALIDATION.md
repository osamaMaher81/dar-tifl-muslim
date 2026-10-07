# Validation — self-hosted export

- Original source: live Site version 12, commit 602759b80b7840c4eb1a39094b881b457e15ab34.
- Next.js 16.3.4 production build completed successfully on Node.js 24.19.0, including TypeScript checks and all routes.
- 196 HTTP integration checks passed against the actual Next.js server, SQLite and disk storage. Includes account
  approval, teaching roles, student isolation, learning records, payments, payroll locks, private portraits and
  phone-proof reuse rejection.
- Restart test passed: existing administrator logged in after server restart; student and record data remained
  available.
- Full synthetic database and media import into a fresh SQLite database completed successfully. No live user data was
  extracted or included.
- The export includes source, lockfile, public assets, migrations, Docker/Compose, reverse-proxy snippet, environment
  template, migration utilities and Arabic deployment instructions.
- Docker is configured but was not built or run here because Docker is unavailable in this environment. Remote server,
  DNS, TLS and live SMS delivery have not been tested.
- Export utility requires your existing administrator credentials in a private local .env; it has not been run against
  production. Do not send secrets in chat.

No node_modules, build caches, credentials, production database or uploaded user media are included in the source ZIP.
Install dependencies using the supplied lockfile before building.
