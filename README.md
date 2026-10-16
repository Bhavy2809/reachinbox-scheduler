# ReachInbox: Full-stack Email Job Scheduler

**Live demo:** https://reachinbox-scheduler-xi-five.vercel.app · queue dashboard: https://reachinbox-scheduler-xi-five.vercel.app/admin/queues (after login)

This service schedules emails and sends them at a set time, with a dashboard to manage them. It is built for the ReachInbox SDE intern assignment.

- **Backend:** TypeScript, Express, BullMQ, Redis, PostgreSQL, Ethereal SMTP, Elasticsearch, Slack OAuth
- **Frontend:** Next.js 14 (App Router), TypeScript, Tailwind CSS, Google OAuth

```
reachinbox/
├── backend/            Express API + BullMQ worker
│   ├── src/
│   │   ├── server.ts        API process (optionally runs the worker too)
│   │   ├── worker.ts        standalone worker process
│   │   ├── app.ts           routes + Bull Board
│   │   ├── config.ts        every tunable comes from env
│   │   ├── db/              schema.sql, pool, migrate (advisory-locked)
│   │   ├── queue/           emailQueue.ts (producer), emailWorker.ts (consumer)
│   │   ├── services/        scheduler, rateLimiter (Redis Lua), mailer, search, slack
│   │   ├── repositories/    all SQL lives here
│   │   ├── routes/          auth, emails, slack
│   │   └── auth/            JWT session cookie + OAuth state helpers
│   └── scripts/loadTest.ts  schedules 1000+ emails at once
├── frontend/           Next.js dashboard
│   └── src/{app,components,components/ui,hooks,lib}
├── docker-compose.yml  Postgres, Redis (AOF), Elasticsearch
└── sample-leads.csv
```

---

## 1. Running it

### Prerequisites
- Node.js 18.18+ (20 LTS recommended)
- Docker Desktop. It is optional, but it is the easiest way to run Postgres, Redis and Elasticsearch.

### Infrastructure
```bash
docker compose up -d            # postgres:5432, redis:6379, elasticsearch:9200
```
Elasticsearch needs about 1 GB of RAM. If your machine can't spare that, run `docker compose up -d postgres redis`. Search then falls back to SQL automatically.

### Backend
```bash
cd backend
cp .env.example .env            # then fill in Google + Slack credentials (below)
npm install
npm run dev                     # API on http://localhost:4000
npm run dev:worker              # in a second terminal: the BullMQ worker
```
The tables are created automatically on boot. On first boot the API also creates `SENDER_COUNT` Ethereal accounts and stores them in the database.

You can also set `RUN_WORKER_IN_API=true` to run the API and the worker in one process.

### Frontend
```bash
cd frontend
cp .env.example .env.local      # NEXT_PUBLIC_API_URL=http://localhost:4000
npm install
npm run dev                     # http://localhost:3000
```

### Ethereal Email
Nothing to do: senders are created through Ethereal's API on first boot.

To use fixed accounts instead, create some at https://ethereal.email/create and set:
```
ETHEREAL_ACCOUNTS=user1@ethereal.email:pass1,user2@ethereal.email:pass2
```
Every sent email has a **preview** link in the Sent tab. It opens the captured message on Ethereal.

### Google OAuth (login)
1. In Google Cloud Console, open APIs & Services → OAuth consent screen. Set it to External, and add yourself as a test user.
2. Go to Credentials → Create OAuth client ID → Web application.
3. Add the authorized redirect URI: `http://localhost:4000/auth/google/callback`
4. Put the client ID and secret into `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`.

### Slack OAuth (rate-limit alerts)
1. On https://api.slack.com/apps, choose Create New App → From scratch.
2. Under OAuth & Permissions, add the bot scope **`incoming-webhook`**.
3. Slack requires an **HTTPS** redirect URL, so expose the backend with a tunnel:
   ```bash
   ngrok http 4000        # or: cloudflared tunnel --url http://localhost:4000
   ```
   Add the redirect URL `https://<your-tunnel>/api/slack/callback` in Slack. Then set:
   ```
   SLACK_CLIENT_ID=...
   SLACK_CLIENT_SECRET=...
   SLACK_REDIRECT_URI=https://<your-tunnel>/api/slack/callback
   ```
4. In the dashboard, click **Connect Slack**, approve, and pick a channel. A confirmation message is posted right away.

### Environment variables (backend)

| Variable | Default | Meaning |
|---|---|---|
| `WORKER_CONCURRENCY` | 5 | Jobs one worker process runs in parallel |
| `MIN_DELAY_BETWEEN_SENDS_MS` | 2000 | Minimum gap between two sends **from the same sender** |
| `MAX_EMAILS_PER_HOUR_PER_SENDER` | 200 | Hourly cap per sender, shared across all workers |
| `SEND_MAX_ATTEMPTS` | 3 | SMTP retries (exponential backoff from 5s) before an email is marked `failed` |
| `SEND_LOCK_TTL_MS` | 60000 | How long a crashed worker's claim on an email blocks a takeover |
| `SENDER_COUNT` | 3 | Ethereal accounts to create |
| `RUN_WORKER_IN_API` | false | Run the worker inside the API process |

All limits come from env vars. None are hard-coded.

---

## 2. Architecture

```
 Browser (Next.js) ──cookie JWT──▶ Express API ──(1) INSERT rows in one txn──▶ PostgreSQL  (source of truth)
                                        │
                                        └─(2) addBulk delayed jobs, jobId = email-<id>──▶ Redis / BullMQ
                                                                                             │
                                  Worker(s) ◀──────────────── delayed job becomes due ───────┘
                                     │  (a) gap slot      ─▶ Redis Lua
                                     │  (b) hourly limits ─▶ Redis Lua ── limit hit ─▶ reschedule + Slack
                                     │  (c) claim row     ─▶ Postgres UPDATE ... RETURNING
                                     │  (d) send          ─▶ Ethereal SMTP
                                     └─ (e) mark sent     ─▶ Postgres + Elasticsearch
```

### How scheduling works (no cron)
- `POST /api/emails/schedule` takes subject, body, recipients, start time, delay between emails and hourly limit.
- In **one transaction** it creates a `campaigns` row and one `emails` row per recipient. Email *i* gets these values:
  - `scheduled_at = start + i × delay`
  - `sender = senders[i mod N]` (round robin across Ethereal accounts)
- After the commit it adds **one BullMQ delayed job per email**, with `delay = scheduled_at − now`. Nothing polls and there is no cron. Redis holds the jobs in a sorted set keyed by due time, and BullMQ promotes each one when it is due.
- The jobId is deterministic (`email-<dbId>`). BullMQ ignores an `add` with an existing jobId, so re-enqueuing the same email can never create a second job.

### How persistence on restart is handled
- **API or worker restart:**
  - Delayed jobs live in Redis, not in process memory, so they are untouched.
  - A restarted worker simply keeps consuming them at their original times. Nothing restarts from the beginning, because each job is one email and finished emails are `sent` in the DB.
  - Shutdown is graceful: `worker.close()` lets in-flight jobs finish.
- **Redis restart:** Redis runs with AOF (`appendonly yes`, fsync every second), so the delayed set is reloaded from disk.
- **Crash between DB commit and enqueue, or a lost job:**
  - Postgres is the source of truth. On every worker start, `reconcileQueue()` scans all `scheduled`/`sending` rows.
  - Any row without a live job gets its job re-added.
  - This is safe because of the deterministic jobId and the claim step below.
- **Worker killed in the middle of a job:** BullMQ's stalled-job check gives the job back to another worker, and the claim step decides whether it may send.

### Idempotency: an email is never sent twice
1. **Create:** the frontend sends an `Idempotency-Key` header, one per compose session. `UNIQUE(user_id, client_request_id)` means a double click or a retried POST returns the same campaign. `UNIQUE(campaign_id, to_email)` stops a duplicate address in one upload.
2. **Enqueue:** deterministic jobIds, so there is one job per email.
3. **Send:** before touching SMTP, the worker runs this:
   ```sql
   UPDATE emails SET status='sending', locked_at=now(), attempts=attempts+1
    WHERE id=$1 AND (status='scheduled' OR (status='sending' AND locked_at < now() - ttl))
   RETURNING *;
   ```
   Postgres row-locks and re-checks the `WHERE`, so **exactly one** caller gets the row back. This was tested with 30 concurrent claims on one row: one winner. A row that is already `sent` is a no-op.
4. **The one window left:** a crash *after* SMTP accepted the message but *before* `status='sent'` is written. After `SEND_LOCK_TTL_MS` the email is retried. This is the classic at-least-once gap, and no SMTP system can close it fully. It is narrowed by sending a **deterministic `Message-ID`** (`<email-<id>@domain>`), so the receiving side can de-duplicate a resend.

### How rate limiting and concurrency are implemented
Every counter lives in **Redis** and is changed by **Lua scripts**. Redis runs a script atomically, so any number of workers on any number of machines see one consistent count. Nothing is counted in memory.

**Concurrency:**
- `WORKER_CONCURRENCY` jobs run in parallel per worker process. You can also start several worker processes.
- Parallel jobs are safe because of the atomic claim (idempotency, step 3) and the atomic Redis scripts.

**Delay between emails.** There are two layers:
- *Per campaign:* the user's "delay between emails" spaces out `scheduled_at` (start + i × delay).
- *Per sender (provider throttling):* `MIN_DELAY_BETWEEN_SENDS_MS`, default **2 seconds** between sends from the same sender. How it works:
  - Each job **reserves** the next free slot: `slot = max(now, lastSlot + gap)`, set atomically in Lua using Redis' own clock.
  - A job whose slot is in the future moves itself to the delayed set until that slot (`job.moveToDelayed` + `DelayedError`, which doesn't count as a failed attempt).
  - So 1000 simultaneous jobs get slots 0s, 2s, 4s, … in order. They don't all wake every 2 seconds to retry.
  - Different senders throttle independently, which is what makes concurrency useful.

**Emails per hour.**
- Two limits are checked together:
  - `MAX_EMAILS_PER_HOUR_PER_SENDER` (env)
  - the campaign's "hourly limit" from the compose form
- The keys are `ratelimit:sender:<id>:<hourWindow>` and `ratelimit:campaign:<id>:<hourWindow>`, using fixed clock-hour windows.
- One Lua script checks **all** the limits and increments **all** of them only if every check passes. Two workers can never both take the last slot (tested: 200 parallel calls against a limit of 50 gave exactly 50 allowed).
- **When the limit is hit, the job is never dropped or failed:**
  - It takes a numbered place in an overflow line for that window: `INCR ratelimit:overflow:<scope>:<window>`.
  - Place *p* is rescheduled to window `current + 1 + floor(p / limit)`, at offset `(p mod limit) × gap`.
  - Overflowed emails keep their relative order and spread across the following hours instead of all waking at hh:00:00 and racing.
  - The row's `scheduled_at` and `rate_limited_count` are updated, so the dashboard shows the new time.
- **Slack:** the first job to hit a limit in a given window (`SET NX` per scope + window) posts one message to the campaign owner's Slack, so you don't get hundreds. The connection is read from the DB on each alert:
  - Not connected: nothing is sent, and nothing crashes.
  - Connected later: alerts start immediately, with no redeploy.
  - Webhook revoked (Slack returns 404/410/403): the connection is removed.

### Behaviour under load (1000+ emails at the same time)
`npm run load-test -- 1000 50 you@gmail.com` schedules 1000 emails due *now* with an hourly limit of 50. Pass your own Google email so they show up on your dashboard.
- **Insert:** a single `INSERT ... SELECT FROM unnest(...)` statement, then `addBulk` in chunks of 500.
- **First hour:** the first 50 send, 2s apart per sender.
- **The rest:** jobs 51–1000 are rescheduled into hours +1 to +19, 50 per hour and in order. You can watch them in Bull Board under *Delayed*. Nothing is in *Failed*.
- **Slack:** exactly one message for that campaign's window.

### Search (Elasticsearch)
- Emails are indexed when scheduled and re-indexed whenever their status or time changes.
- `GET /api/emails/search?q=` runs a `multi_match` over recipient, subject and body, filtered to the current user. Results are then loaded from Postgres, so status is always current.
- Elasticsearch is a **secondary index, never the source of truth**. If it is down, scheduling still works and search falls back to SQL `ILIKE`. The UI shows which backend answered.

### Live queue dashboard
Bull Board is at **http://localhost:4000/admin/queues**, for logged-in users only. It shows delayed, waiting, active, completed and failed jobs, with each job's data.

---

## 3. Features implemented

| Area | Feature | Where |
|---|---|---|
| Backend | Schedule API, campaign + rows in one transaction | `services/scheduler.ts`, `routes/emails.ts` |
| Backend | BullMQ delayed jobs, no cron | `queue/emailQueue.ts` |
| Backend | Persistence across restarts + startup reconciler | `services/scheduler.ts#reconcileQueue`, Redis AOF |
| Backend | Idempotency (key header, unique constraints, jobIds, atomic claim) | `schema.sql`, `repositories/emailRepo.ts#claimForSending` |
| Backend | Configurable worker concurrency | `queue/emailWorker.ts`, `WORKER_CONCURRENCY` |
| Backend | Min delay per sender (slot reservation) | `services/rateLimiter.ts#reserveSendSlot` |
| Backend | Hourly limits per sender + per campaign, Redis-backed, roll over to next window | `services/rateLimiter.ts` |
| Backend | Multiple Ethereal senders, round robin | `services/mailer.ts` |
| Backend | SMTP retries with exponential backoff, then `failed` | `queue/emailWorker.ts` |
| Backend | Elasticsearch indexing + search, SQL fallback | `services/search.ts` |
| Backend | Bull Board live dashboard | `app.ts` |
| Backend | Slack OAuth v2, alert on limit hit, disconnect/reconnect, test message | `services/slack.ts`, `routes/slack.ts` |
| Frontend | Built to the provided Figma: login card, sidebar inbox, email detail view, full-page compose | `app/*`, `components/Sidebar.tsx` |
| Frontend | Real Google OAuth login; user card (name, email, avatar) with logout menu | `app/page.tsx`, `components/Sidebar.tsx` |
| Frontend | Scheduled / Sent views with live counts, search (Elasticsearch), filter, refresh, load more | `app/dashboard/page.tsx`, `components/EmailRow.tsx` |
| Frontend | Compose: recipient chips + **Upload List** (CSV/text, count + duplicates shown), subject, delay, hourly limit, rich-text editor | `app/compose/page.tsx`, `components/RecipientInput.tsx`, `components/RichTextEditor.tsx` |
| Frontend | **Send Later** popover: date/time picker + presets → schedules the campaign | `components/SendLaterPopover.tsx` |
| Frontend | Email detail page: sender, recipient, delivery status, Ethereal preview link, sanitized HTML body | `app/email/[id]/page.tsx`, `lib/sanitize.ts` |
| Frontend | Slack connect / test / disconnect and queue-dashboard link in the sidebar | `components/SlackCard.tsx` |
| Frontend | Loading states, empty states, toasts, inline validation | `components/ui/*` |

---

## 4. Assumptions, shortcuts and trade-offs

- **PostgreSQL over MySQL.** Both are allowed. `UPDATE ... RETURNING` makes the atomic claim a single round trip.
- **Fixed hour windows, not sliding.** Simple and cheap: one counter per window. The trade-off is a possible burst at a boundary, up to 2× the limit across 10:59 → 11:00. A sliding log (a Redis sorted set of timestamps) would fix that at higher memory cost.
- **The hourly counter is consumed before the SMTP call.** A send that then fails still counts against the hour, the same way most providers count attempts.
- **At-least-once at the SMTP boundary** (see Idempotency, step 4). Exactly-once isn't achievable with SMTP. The window is only "SMTP accepted, then the process died before one UPDATE".
- **Sender SMTP credentials are stored in plain text in the DB.** That is acceptable for throwaway Ethereal accounts. In production they belong in a secrets manager.
- **Session:** a JWT in an httpOnly, SameSite=Lax cookie. `localhost:3000` and `:4000` count as the same site, so this works in development. A cross-domain deployment would need `SameSite=None; Secure`, or proxying the API through Next.
- **Slack needs an HTTPS redirect**, hence the tunnel. The OAuth `state` is a signed JWT carrying the user id, because the callback comes in on the tunnel domain, which doesn't have the localhost cookie.
- **Bull Board** is protected by the same session cookie, with no separate admin role.
- **Polling, not WebSockets.** The dashboard refreshes every 4–5 seconds, which is simpler and enough for this scale.
- **Figma:** the UI follows the provided Figma frames (login, inbox, detail, compose + Send Later). The email/password fields on the login card are visual only; sign-in is Google OAuth as the brief requires. Attachments (paperclip) and archive/delete on the detail page are shown but disabled - they are outside the assignment's scope.
- **Email body is HTML** from the rich-text editor and is sent as the HTML part with a plain-text fallback; the detail view sanitizes it before rendering.

---

## 5. Demo script (≤ 5 min)
1. Log in with Google. The header shows your name, email and avatar.
2. **Compose:** Upload List → `sample-leads.csv` ("8 emails detected · 1 duplicate removed"). Delay 5, hourly limit 5, then **Send Later → In 1 minute → Done**.
3. The **Scheduled** tab shows the rows. Open **/admin/queues**: the jobs are under *Delayed*.
4. **Restart:** stop the worker and API with Ctrl+C before the start time, then start both again. The emails still go out at their scheduled times, and nothing is sent twice. Check the Sent tab and the Ethereal preview links.
5. **Rate limit:** the limit of 5 means emails 6–8 move to the next hour (marked "rate-limited"), and **Slack** receives one alert.
6. *(Bonus)* `npm run load-test -- 1000 50 you@gmail.com`, then show Bull Board: 50 sending and the rest delayed into later hours.

---

## 6. Deployment (how the live demo runs)

| Piece | Where | Notes |
|---|---|---|
| Frontend (Next.js) | Vercel, root `frontend/` | `NEXT_PUBLIC_API_URL=same-origin`, `BACKEND_ORIGIN=<railway url>` |
| API + BullMQ worker | Railway, root `backend/` | `RUN_WORKER_IN_API=true` (one always-on service; split into two services by running `npm run start:worker` separately) |
| PostgreSQL, Redis | Railway (private network) | `DATABASE_URL=${{Postgres.DATABASE_URL}}`, `REDIS_URL=${{Redis.REDIS_URL}}`; ioredis uses `family: 0` for Railway's IPv6 network |
| Elasticsearch | not hosted | no free managed ES; the live demo uses the built-in SQL search fallback (ES is shown working locally in the demo video) |

**One origin for the browser.** Next.js rewrites `/auth/*`, `/api/*` and `/admin/*` to the Railway backend
(`frontend/next.config.mjs`). The browser only ever talks to the Vercel domain, so the session cookie is first-party
(no third-party-cookie blocking) and the Google/Slack OAuth redirect URIs all live on that one domain:

- Google: `https://<vercel-domain>/auth/google/callback`
- Slack: `https://<vercel-domain>/api/slack/callback`

The worker never sleeps (Railway, not a free tier that idles), because a sleeping process cannot send a scheduled email on time.
