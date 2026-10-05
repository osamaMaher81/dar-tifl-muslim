# Phone verification deployment

Existing accounts continue signing in with their phone and password. New accounts require a unique username and a PNG/JPEG/WebP portrait up to 2 MiB, supplied with a white background; the app does not remove backgrounds. Portraits are private disk files accessed through an authenticated API.

Configure these server environment secrets in the private .env file or server environment (never in source or browser code):
- TWILIO_ACCOUNT_SID
- TWILIO_AUTH_TOKEN
- TWILIO_VERIFY_SERVICE_SID
- OTP_CHANNEL: sms (default), or whatsapp for an enabled Verify channel.

Without a configured provider, single-account registration remains available, and shared-number registration is blocked. No codes are simulated. With the provider configured, all new registrations require successful Verify confirmation. Approval by the circle teacher or administration remains a separate step. A number supports up to 10 accounts, distinguished by unique usernames. Phone login with ambiguous credentials asks for the username.

Test delivery, region permissions, service billing and channel setup using an authorized test recipient before announcing availability. Credentials are currently not configured; real delivery has not been tested. Limits apply per phone, IP and globally. Confirmation grants expire in ten minutes and can create only one account.

Migration 0006 normalizes Egyptian numbers and replaces phone uniqueness with username uniqueness and a database guard against unverified shared numbers. Back up SQLite and uploads together before migrating to another host. The application's encrypted JSON export contains file metadata, not uploaded file contents or OTP grants.

Do not commit .env files, .dev.vars, tokens, credentials, database dumps, uploaded portraits or user backups. Tests use isolated SQLite storage and an inserted test proof, never live SMS.
