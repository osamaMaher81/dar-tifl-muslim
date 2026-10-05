# دار الطفل المسلم

Arabic RTL academy application. The supplied logo is preserved unchanged.

## Self-hosted runtime
See ../README.md and ../DEPLOYMENT.md for current setup. Next.js runs on Node.js 24 with SQLite and private disk uploads. Create the first administrator through the server CLI, or import the existing database before creating accounts. ChatGPT headers are not trusted for authorization.

`db/store.ts` is the database boundary. `app/api/app/route.ts` enforces role and circle access. Password hashes and session handling remain compatible with the original version. `runtime/storage.mjs` executes batches in atomic SQLite transactions with foreign keys and WAL enabled. HTTPS sessions use Secure HttpOnly SameSite cookies; local HTTP cookies omit Secure. APP_ORIGIN is enforced on mutations.

`records` holds typed domain events with explicit foreign keys, dates, status, amounts and validated per-kind JSON fields. Historical circle transitions and every mutation are recorded. SQL constraints protect capacity, duplicate attendance and salary runs, overpayments and immutable financial/audit records. A finalized salary is a snapshot; corrections belong in a subsequent month's adjustment. Expenses already included in a salary cannot be paid again.

## Operational modules
- Phone registration, approval/rejection/suspension/reactivation and manual administrator password recovery.
- Students, guardian details, circle assignment/transfers, history and consent.
- Circle schedules, capacity, multiple assigned Sheikhs, waitlists, Ramadan schedule override.
- Student attendance and departure, new memorization, revision, plans, task completion, assessments and notes.
- Subscriptions, partial manual payments, balances, optional configurable academic-access restriction.
- Sheikh attendance/hours/sessions, hourly/session/monthly/mixed salary configuration, expense receipts and approval, finalized statements.
- In-app direct, circle and academy messages and academic/finance notifications.
- Dashboards, attendance/revenue charts, report filtering, CSV export and browser PDF printing.
- CMS for about/program/news/activity/achievement/Sheikh/gallery/contact sections; student-linked publication checks consent on every read.
- Encrypted database backup downloads and bounded additive recovery (up to 5,000 records, never overwrites current records). R2 file bytes are separate and are not included in the database backup.

## Explicit boundaries
Payments are recorded manually, not collected through a payment gateway. SMS, WhatsApp and OTP delivery require an external provider and are not connected. Public content is authored by the administrator rather than fabricated. No automatic recurring backup job is configured. Restoring existing records to an earlier snapshot, and restoring R2 bytes, require a separate operational restore procedure. The present implementation uses a shared typed event table rather than a separate table for every educational event. PostgreSQL/MySQL in the brief was an optional architecture recommendation; D1 is the platform-supported relational store.

## Verification
`node tests/integration.mjs` runs the compiled Worker against isolated Miniflare D1/R2 instances, applies all migrations and exercises the canonical account, educational, finance, payroll, waitlist, RBAC and backup flows. Test data does not enter the deployed database. Build with the Sites plugin's `build-site.mjs`. WebMCP navigation uses feature detection; its browser-specific registration has not been validated in a supported WebMCP browser.

## Connected portals
`/portals` lists `/admin`, `/sheikh`, `/student`, and `/parent`. The saved authenticated role determines access; navigating to another portal never changes a role. The Sheikh home exposes assigned students and session actions; student home exposes assignments and feedback; parent home selects one linked child at a time.

The admin-only `connect_account` operation activates and links in one D1 batch. It can create a student profile from a reviewed registration, connect existing students/parents, and assign Sheikh circles. It records the previous and new associations in the audit trail. Cross-session data refreshes on focus and every 30 seconds while the page is visible. Name-only teacher directory entries are returned only for accessible circles and record attribution. Private messages remain private even when a circle ID is present.


## Circle registration approvals
Students and parents choose an active circle and its branch at signup. Requests persist as registration records and follow current circle assignments. Active assigned teachers receive an internal notification; administrators handle circles without an assigned teacher. The review queue is scoped server-side to the teacher's circles. Approval requires identity confirmation and links an existing active pupil in the requested circle; student accounts may instead create a new pupil subject to capacity. Parents cannot create pupil profiles through review. A database trigger prevents repeated decisions and validates current reviewer assignment and pending account status inside the atomic batch. Rejected/pending accounts cannot sign in. Existing administrator activation tools remain available; requests for accounts already handled by administration are shown without review actions. Historical accounts without a circle request remain administrator-managed.


## Circle-based staff attendance and payroll
New staff attendance requires an active assigned circle. One entry per teacher, circle and Cairo calendar day; checkout counts one session automatically. Absence counts zero. Session payroll uses the session rate effective on each attendance date and saves a per-attendance breakdown. Open sessions block payroll closing. Closed payroll months reject staff attendance mutations, including concurrent writes through database guards. Existing salary methods and locked statements are preserved; administrators select the default session method and its effective date for attendance-based payment. Historical attendance without circle IDs retains its recorded count.
