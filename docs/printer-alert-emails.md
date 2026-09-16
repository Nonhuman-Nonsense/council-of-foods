# Printer alert emails: plan

Status: plan, not implemented. When it ships, move the lasting parts into
[MUSEUM.md](../MUSEUM.md), [server/README.md](../server/README.md) and
[button/bridge/README.md](../button/bridge/README.md), then delete this file.

## Goal

When the museum printer can't print protocols (out of paper, jammed, off, or just not
printing), email museum staff so they can fix it, and email again when it's fixed. The
protocols print by themselves once the printer works.

Sending is built so it can be reused later to **email protocols to visitors**. That
feature is not part of this work, but it decides where sending lives.

## Decisions

| Question | Answer |
|---|---|
| Where sending lives | Council server, `MailService` on Brevo's transactional API. It'll be reused for protocol emails later. |
| Sender | Per product domain: `council@council-of-foods.com` / `council@council-of-forest.com` |
| Recipients | Museum staff only, picked per **venue** on `#staff` from a list in the server config (below) |
| Team copy | Every alert also goes to errorbot as a `warning` |
| Timings | 2 min grace, 10 min "not printing", reminders every 4 h **during the venue's opening hours only** |
| Language | English |
| Opening hours | One weekly window per venue (days + from/to). No holidays or closed weeks: the worst case is a reminder on a closed day. e.g. Wed–Sun 12:00–16:00. |

## Architecture

```
#staff page ──pick venue──► bridge (museum Mac) ──X-Bridge-Key──► council server ──► Brevo
            ◄─venue list──  watches printer                         venues config     └► errorbot
                            alert state machine                     MailService
```

The browser only talks to the bridge, and only the bridge talks to the server, using a
key. There's no public endpoint that lists venues or sends email.

### Venues: who gets emailed

One installation can travel between museums, so the recipients can't be tied to the Mac.
The server config holds a list of **venues**, and staff choose the current one on `#staff`:

```
COUNCIL_VENUES=[
  {"id":"example-museum","name":"Example Museum","alertEmails":["staff@example.org"],
   "timezone":"Europe/Stockholm","openingHours":{"days":["wed","thu","fri","sat","sun"],"from":"12:00","to":"16:00"}}
]
```

- Staff can only pick from this list, so no email can be sent to an address that isn't
  in the server config. Adding a museum is a config change and redeploy on our side.
- The staff page gets the list from the bridge. The bridge fetches it from the server
  (`GET /api/bridge/venues`, key required) and shows names plus masked addresses
  (`s***@museum-x.org`), so staff can see who will be emailed.
- The choice is saved on the bridge (`print/alerts-config.json`), because the bridge
  sends alerts even when no browser is open. The staff page sets it with
  `PUT /v1/alerts/venue {venueId}`, which accepts only ids that exist in the server's
  list. The worst a rogue page in the CORS allowlist could do is switch to another
  whitelisted venue.
- Opening hours and timezone come with the venue, so the bridge knows when reminders
  may go out.
- No venue chosen means no alerts. The staff page shows **Alerts: choose a venue**.

### Why the bridge still watches the printer

It's the only piece that sees the printer and the queue, and it runs all the time
under launchd whether or not a browser is open. The bridge decides **when** an alert is
due. The server decides **who** receives it and **sends** it.

**Key:** one bridge key per deployment (`COUNCIL_BRIDGE_KEY` on the server,
`BRIDGE_SERVER_KEY` on the Mac). It can only reach whitelisted venue addresses, and it's
rate-limited. If it leaks, rotate it and update the Macs.

**Not covered:** if the Mac, the bridge or the internet connection is down, no alert
can be sent. The server is already watched by errorbot. The Mac belongs to the host
watchdog in `docs/museum-kiosk-resilience-plan.md`.

## What counts as a problem (bridge)

Two independent signals, because many USB printers never report "out of paper" to
CUPS: they just stop taking jobs.

| Signal | Source | Examples |
|---|---|---|
| **Printer reports a problem** | `lpstat -l -p`: `Alerts:` reasons, or the queue is stopped | `media-empty-error`, `media-jam-error`, `door-open-error`, `offline-report`, `toner-empty-error` |
| **Protocols aren't printing** | Oldest job waiting too long, in the spool's `pending/` or the CUPS queue (`lpstat -o <printer>`) | a protocol has waited more than 10 min |
| **No printer** | `lpstat -d` finds no default printer, or `lpstat` keeps failing | printer removed |

- A problem must last a **grace period (2 min)** before it counts. Printers report
  `media-needed` for a few seconds while they pull a sheet.
- `*-warning` reasons (such as `toner-low-warning`) don't send alerts in this version.

## Alert lifecycle (bridge)

A pure state machine, `printAlerts.ts`: `(state, observation, now) → { state, alerts[] }`.

```
ok ──problem──► pending ──still there after grace──► alerting   → "needs attention"
 ▲                 │                                    ├─ every 4 h while unresolved → reminder
 └──────gone───────┘                                    ├─ reason changes (paper → jam) → "needs attention"
                                                        └─ gone for grace period → ok  → "fixed"
```

- **Opening hours:** reminders only go out while the venue is open. If a problem is
  still unresolved at opening time, one reminder goes out then. The first "needs
  attention" and the "fixed" email go out at any time.
- The state is saved to `print/alerts-state.json`, so a restart or crash loop doesn't
  send the same alert again.
- If an alert can't be delivered (server unreachable), the bridge keeps it and retries
  with backoff. Only the newest undelivered alert is kept: "fixed" replaces an unsent
  "needs attention".

## Server

**`server/src/services/MailService.ts`**
- `sendEmail({ to, subject, text, html?, attachments? })` calls
  `POST https://api.brevo.com/v3/smtp/email`.
- `attachments` isn't used yet; it's there for protocol emails later.
- Failures are reported to errorbot.
- `TEST_MODE`/test runs use an in-memory fake that records sent emails.

**Env** (`EnvValidation.ts`, `example.env`):
```
COUNCIL_BREVO_API_KEY=…
COUNCIL_MAIL_FROM=Council of Foods <council@council-of-foods.com>
COUNCIL_BRIDGE_KEY=…
COUNCIL_VENUES=[…]   # see Venues above, validated with zod at startup
```
Everything is optional: without them the bridge endpoints answer 503 and nothing else
changes.

**`api/bridgeRoutes.ts`**, all requiring `X-Bridge-Key` (compared in constant time,
401 otherwise):
- `GET /api/bridge/venues`: id, name, masked addresses, timezone and opening hours.
- `POST /api/bridge/printer-alerts`:
  - Body (zod): `{ venueId, kind: "problem" | "reminder" | "resolved" | "test",
    reason, since, printer, waiting, host }`.
  - Unknown venue → 400.
  - Rate limit per venue (e.g. 12 per hour).
  - The server writes the email text, so the wording can change without reinstalling
    bridges:
    ```
    Subject: Council of Foods printer: out of paper

    The Council of Foods printer at Museum X needs attention.

    Problem: out of paper (since 14:32)
    Printer: Museum_Printer
    Protocols waiting: 3. They print by themselves once the printer is fixed.
    ```
  - Sends to the venue's `alertEmails`, plus the errorbot copy (`warning`, context
    `printer museum-x`).

## Bridge configuration

- `/usr/local/lib/council-button-bridge/alerts.env`: root-owned, mode 600. Kept across
  reinstalls like `print/`, removed on uninstall.
  ```
  BRIDGE_SERVER_URL=https://council-of-foods.com
  BRIDGE_SERVER_KEY=…
  ```
- If it's missing, the installer asks for the bridge key (and the server, defaulting to
  `https://council-of-foods.com`) by reading from `/dev/tty`, which also works under
  `curl | sudo bash`. With no terminal, or an empty answer, it writes the file with
  alerts off and prints how to fill it in later. The plist points at it with
  `BRIDGE_ALERTS_FILE`.
- The venue choice lives in `print/alerts-config.json`, set from the staff page.

## Staff page

In the **Bridge** panel, while Print summaries is on:

- A **Venue** picker (from the bridge's venue list, with masked recipients). The
  choice is saved on the bridge.
- A chip: **Alerts: On / Choose a venue / Not configured / Failing**.
- In the details: the current problem and since when, when the last alert was sent,
  and the last delivery error.
- A **Send test alert** button, which calls the bridge's `POST /v1/alerts/test`. That
  sends `kind: "test"` through the whole chain (bridge → server → Brevo → the venue's inbox)
  and is rate-limited on both sides.

## Development without a printer or real email

- **Mock printer:** new `paper-out` and `stuck` modes on `/v1/test/printer`.
- **Server:** without `COUNCIL_BREVO_API_KEY`, and in tests, `MailService` logs the
  email and keeps it in memory instead of sending. A real send to yourself uses a
  Brevo key in `server/.env`.
- **Bridge:** in dev, `BRIDGE_SERVER_URL=http://localhost:3001` plus the local
  `COUNCIL_BRIDGE_KEY`, and a test venue in the local `COUNCIL_VENUES`.
- The whole chain can be tested locally: mock printer in `paper-out` → bridge alert →
  local server → email logged.

## Tests

- **Bridge `printAlerts` table** (with a fake clock across opening hours):
  - a short blip sends nothing
  - start, reminder interval, changed reason
  - clearing needs the grace period too
  - no reminder while closed, one reminder at opening, first alert and "fixed" at any time
  - restart with saved state sends nothing new
  - an undelivered alert is retried, and "fixed" replaces an unsent "needs attention"
- **Bridge parsing:** `lpstat -o` on captured output.
- **Bridge integration:** fake server; `paper-out` longer than the grace period posts
  one alert; `ok` posts "fixed"; `/health` never contains the key.
- **Server integration:** wrong key → 401; unknown venue → 400; valid → one email to
  that venue's addresses only, plus the errorbot copy; the venue list masks addresses;
  rate limit; missing config → 503.
- **Client:** Staff alert chip, details, and the test button.

## Chunks

1. **Server mail:** `MailService` (Brevo), env schema, venues config, the
   `/api/bridge/*` endpoints, and tests. Can be checked with curl before the
   bridge exists, and becomes the base for protocol emails.
2. **Bridge detection:** `lpstat -o`, queue age, mock `paper-out`/`stuck` modes, and a
   "needs attention" reason in `/health` and on the staff page.
3. **Bridge alerts:** state machine with opening hours, delivery to the server with
   retry, `alerts.env`, venue list and choice, `/v1/alerts/test`, and the `/health`
   alerts block.
4. **Staff page, install and docs:** venue picker, alert chip and test button, installer handling of
   `alerts.env`, and the docs.

## Brevo setup (one-time, per product domain)

1. **Brevo → Senders, Domains & Dedicated IPs → Domains → Add a domain:**
   `council-of-foods.com`. Choose to authenticate it yourself.
2. Brevo shows DNS records: a `brevo-code` TXT, two DKIM CNAMEs
   (`brevo1._domainkey`, `brevo2._domainkey`), and a DMARC TXT (`_dmarc`) if the domain
   has none. Add them at the DNS host. In Cloudflare, set the CNAMEs to **DNS only**
   (grey cloud).
3. Back in Brevo, press **Authenticate**. DNS can take a few minutes.
4. **Senders → Add a sender:** `Council of Foods <council@council-of-foods.com>`. No
   inbox is needed on an authenticated domain.
5. **SMTP & API → API keys → Generate a new API key** (e.g. `council-foods-server`),
   and put it in the server env as `COUNCIL_BREVO_API_KEY`.
6. **Security → Authorised IPs:** if it's switched on, add the server's IP, or API calls
   are refused.
7. Repeat steps 1–4 for `council-of-forest.com`. One API key can send from both.

## Open questions

1. **Real printer reasons:** once the printer is on site, remove the paper and check
   `lpstat -l -p <printer>`. The "not printing" signal covers printers that report
   nothing.
