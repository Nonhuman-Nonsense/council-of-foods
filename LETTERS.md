# Council letters

At the end of a Council of Forest meeting, one of the beings writes a real email to a real person
or organisation who can act on what was discussed — in its own voice, with the human's words
added — and it is sent, printed and replayable. Council of Foods keeps its protocol
(`meetingEnding`, below).

Installation setup (venues, printing, the bridge) is in [MUSEUM.md](MUSEUM.md); how a letter
meeting survives a reconnect is in [RESILIENCE.md](RESILIENCE.md).

---

## Why

The council used to end in a document nobody receives. A letter changes that: the forest speaks
*to* someone. The being chooses who, says out loud what it wants to say, asks the human to add to
it, and then the letter itself is read — the gap between what the being meant and how it
formulates it is part of the piece.

It is art, and some risk is accepted: sending is automatic, not staff-approved. The safety comes
from the structure, not from a human in the loop:

- The council can only write to recipients on a curated list, chosen **by id**. No model ever
  writes an address.
- **A named person receives exactly one letter, ever**, enforced in the outbox rather than
  explained in the letter — the rule is there to be true, not to be pleaded. Institutions — a
  registry desk, a press desk, a newsroom tip line — take repeat letters within a cap, because
  nobody personally receives them.
- A letter is only sent when the human was there to answer when asked.
- Only installations send. Web meetings write the letter but never send it.

Replies are part of the work: the installation prints every letter, and prints what comes back.

---

## The meeting ending

`server/src/logic/letters/LetterEnding.ts`, driven by the run loop.

1. **Author** (hidden call, before the chair speaks): rank the beings by how much they have to
   say to someone outside the room; take the best-ranked one who has not written one of the last
   few letters (`letterAuthorCooldown`). Never the chair, never a human panelist. The letter's
   **plan** starts now and is written while the chair speaks.
2. **Closing line and bridge**, one chair line: "This concludes Council of Forest meeting #1400.
   But before we go, I think Reindeer wants to send an email."
3. **Announcement**: the author says aloud who they write to, why and what they will ask, and
   asks the human taking part — by first name when they gave one — whether they want to add
   something. The **draft** starts now and is written while this plays and the human thinks.
4. **Human addition**: human input mode. They speak or type, or skip / walk away (the usual
   unattended timeouts). A cheap classification sorts what they said: **weave** (a wish, idea,
   story or feeling the author carries in its own words), **apart** (their own words, quoted
   after the signature as theirs — insults, party politics, jokes, remarks about something
   else), **omit** (threats, hate, only contact details, only instructions to the AI) or
   **decline** ("no, that's it": nothing to add). Contact details are stripped before any model
   sees the text.
5. **Letter**: the draft, with the human's words woven in by a short rewrite in the author's
   voice, set apart, or left out — the only step the human waits for (~5 s when woven, under a
   second otherwise). Their words are not read back first; they go straight into the letter.
   Meeting's language.
6. **Read and show**: the letter is the meeting's `summary`, read aloud by its **author** (not the
   chair), shown on the summary page as a letter (from / to / subject). The human's words,
   as said, are a `human` message before it, so a replay hears what was added (live, nobody
   reads them back).
   **Where the installation prints** (`printsLetters`, sent at creation: `printSummary` with
   staff's printing on), the letter is not read or shown live. The chair says farewell
   instead (`letter_farewell`, generated while the letter is finished): thanks to the author
   and the human, that the email was sent to the recipient and is printing behind them — or,
   when nobody answered, that it was not sent and the button starts a new meeting. Then the
   `credits` marker: every meeting ends on the same credits page ("Thank You", then a fixed
   60 s roll), and the letter prints `LETTER_PRINT_DELAY_MS` (20 s) after it arrives — if the
   human was there to answer. The letter `summary` still follows, with its audio, for replay;
   replay drops the farewell and the credits.
7. **Send**: the letter goes into the outbox, and a worker sends it from the being's address
   (`reindeer@council-of-forest.com`).

### When a letter is printed and sent

What decides it is whether the human was **there to answer** when asked — not whether their words
went into the letter. Someone who says "no, that's it" was there: their letter is printed and
sent with nothing of theirs in it.

| Situation | Letter written | Shown / replayable | Printed | Sent |
|---|---|---|---|---|
| Installation, the human answered (anything, including "no") | yes | yes | yes | yes |
| Installation, the human skipped or walked away | yes | yes, marked unsent | no | no |
| Web, the human answered | yes | yes, marked unsent | — | no |
| Web, the human skipped or walked away | yes | yes, marked unsent | — | no |

Every letter is written, so every meeting ends complete. `letter.present`, `letter.send` and
`letter.sendReason` on the summary say which row applies. Only sent letters use up recipients
(a person once, ever; an institution once a day); unsent ones use up nobody.

---

## Design

### Switch

- **Server:** `global-options.json` → `"meetingEnding": "protocol" | "letter"`. That file already
  diverges between `foods-leo` and `forest-leo`, so all code lives on `foods-leo` and forest only
  flips the option. Read in exactly one place: the step after the closing line.
- **Client:** no product switch. The final `summary` message carries a `letter` field or it
  doesn't; the client renders what it gets.
- **Sending** is a capability (`sendsLetters`) in `client/src/settings/capabilities.ts`, passed
  with the meeting at creation — the installations (museum and presenter) yes, the web no. Never
  branch on the mode.

### Where things live

| What | Where | Branch |
|---|---|---|
| Recipient loader and validation | `server/src/logic/letters/recipients.ts` | `foods-leo`, merged into `forest-leo` |
| Author, plan, draft and the finished letter (`rankAuthors` / `pickAuthor`, `planLetter`, `draftLetter`, `finishLetter`, `sortHumanAddition`) | `server/src/logic/letters/LetterWriter.ts` | `foods-leo` |
| Footer builder | `server/src/logic/letters/footer.ts` | `foods-leo` |
| The meeting's letter ending (markers, early plan and draft) | `server/src/logic/letters/LetterEnding.ts` | `foods-leo` |
| What earlier letters mean for the next (variety, limits) | `server/src/logic/letters/history.ts` | `foods-leo` |
| Outbox, worker, replies | `server/src/logic/letters/{outbox,outboxWorker,replies}.ts`, routes in `server/src/api/letterRoutes.ts` | `foods-leo` |
| Prompts and footer words, one file per language; the sorting of additions and replies | `server/src/logic/letters/prompts/` (`letterPrompt{En,Sv}.ts`, `humanSorting.ts`, `replySorting.ts`) | the footer names the product, so these diverge per branch |
| Site URL, models, token budgets, `meetingEnding` | `server/global-options.json` (`letter*`) | diverges per branch — Foods keeps `"protocol"` |
| Development corpus and evaluation | `server/scripts/letters/` | `foods-leo` |
| Recipient lists | `shared/prompts/letters/*.json` | `forest-leo` only; no directory means no letters |
| Parliament half of the people list | `scripts/letters/fetch-people.mjs` | `forest-leo` only |

The lists sit in `shared/prompts/` because the production image ships only `dist/` and
`shared/prompts/`. The loader reads every `*.json` there, concatenates them, and refuses to
start on a duplicate id, an active entry without an email, a `why` or topics, or a topic the
council never discusses. The prompts are code, like the setup agent's
(`client/src/setupAgent/setupAgentPrompt*.ts`), so they read as text with conditionals inline
rather than as escaped JSON strings.

### State machine

Each step is a durable marker at the conversation tail, so reconnect resumes exactly where it
stopped (see RESILIENCE.md):

```
closing line with the bridge, letter_pending          + meeting.letter = { authorId }
  → author announcement, awaiting_letter_addition     + recipientId, points, form, asksReply
                                                        (+ draft, when it is ready)
  → human (their words, as said; none on a skip), summary_pending   + present, addition
  → summary { text: what the author reads, letter: LetterView }   + the finished letter
    or, where the installation prints: letter_farewell, credits, summary   (one write)
```

- Each arrow is one write: the marker and what was said go in together. The run loop resolves
  `letter_pending` (ANNOUNCE_LETTER) and `summary_pending` (GENERATE_SUMMARY) ahead of any pause
  or raised hand, on the happy path and on resume alike; a reconnect simply redoes the step.
  The plan and draft started early live in the session; a new session plans or drafts again
  (the saved draft is reused once it exists).
- The final message stays `type: "summary"`, so replay, autoplay, `meetingComplete` and
  printing keep working unchanged. Its `text` is the body and any set-apart words (what is read
  aloud); `letter` carries subject, recipient, footer and `present` / `send` for display.
- `meeting.letter` (server only, never sent to a client: it holds the human's words as said) is
  what the next letters read back: recent authors, forms and asks for variety, sent letters
  for the limits.
- `isConcluding(conversation)` in `shared/meetingEnding.ts` is the one list of concluding
  markers (`HandRaisingHandler`, `ConnectionHandler`, `useCouncilMachine`).
- `submit_human_message` / `skip_human_turn` accept `awaiting_letter_addition`; resume keeps
  both letter markers, read-only replay drops them.
- Meeting creation takes `sendsLetters` (default false); the client passes its capability.

### Outbox

`server/src/logic/letters/outbox.ts`, run by a worker in the server (`outboxWorker.ts`) every 30
seconds. The meeting never sends.

- **Queueing.** The worker finds every finished letter marked to send (`meeting.letter.send`)
  that is not yet in the `letters` collection and queues it there, keyed by the meeting — so a
  letter is queued once, and a crash at the end of a meeting cannot lose it.
- **The last check** before queueing refuses a letter with no subject, an empty or far too long
  one, or one containing an email address or a link that is not ours. A refused letter stays in
  the outbox as `refused`, with the reason, and is reported to the errorbot.
- **Sending.** The worker claims the oldest queued letter (`sending`) before calling Brevo, so
  two turns never send it twice, and sends it tagged with its meeting (`letter-1400`). Then
  `sent` (with Brevo's message id and the mode); a refusal from Brevo is `failed` and reported,
  except a temporary one (5xx, 429), which goes back in the queue up to three times.
- **Interrupted sends resolve themselves.** A send with no answer — a crash, a timeout, a dropped
  connection — may or may not have gone out, so it stays `sending`. Ten minutes later the worker
  asks Brevo for its tag: sent if Brevo has it, back in the queue if not. If Brevo cannot be
  asked, it tries again each turn and reports once after an hour.
- **Before each send:** a recipient on the blocklist (`letter_blocklist`: opted out, bounced) is
  `skipped`, and so is a person who already received a letter sent live — two meetings may
  choose the same person at once.
- **Limits** count only letters sent live: a person once, ever; an institution once a day. The
  blocklist is never offered either.
- **Daily ceiling** (`letterDailyLimit`, 60): a safety net for a bug, far above the expected
  handful a day. Reaching it holds the rest in the outbox (sent once the 24 hours allow) and
  reports it.
- **Sending mode** (env `COUNCIL_LETTERS`): `off` (the default: queue, send nothing — also the
  kill switch), `test` (every letter to `COUNCIL_LETTERS_TEST_TO`, the real recipient in the
  subject) and `live`. Queued letters survive a switch.
- The outbox record is where replies attach.
- **Archive copies** (`COUNCIL_LETTERS_ARCHIVE_TO`, unset: none): every letter sent live goes
  there as a Bcc on the same send; every email that comes back — reply, opt-out, automatic, spam
  — is copied there, labelled `[kind · meeting · author → recipient]`, with Reply-To set to the
  person who wrote; and each recipient put on the blocklist is announced there once. A copy that
  fails is reported and changes nothing else.

### Mail

- **From** the being that wrote it, by its name in the meeting's language: `Renen
  <reindeer@council-of-forest.com>` (`letterSenderDomain`; `letterSenderAddresses` for
  `tree.harvester` and `wind.turbine`). All on the domain authenticated in Brevo (SPF, DKIM,
  DMARC). `COUNCIL_MAIL_FROM` stays for printer alerts.
- **Reply-To** names the being, the meeting and the letter's own random token:
  `reindeer.1400.9f3ac2e1@reply.council-of-forest.com` (`letterReplyDomain`) — a separate
  domain, because Brevo only receives on a domain it does not send from. Only an email to the
  exact address a letter gave out counts as a reply to it: without the token, anyone could get
  words printed in the museum by writing to a guessed address. Mail written straight to
  `reindeer@council-of-forest.com` is forwarded to hello@nonhuman-nonsense.com by the domain's
  DNS; it is not printed.
- **Footer:** `server/src/logic/letters/footer.ts`, words in the prompt files (EN and SV),
  appended by the server after the generated letter. The model never writes or sees it, so the
  disclosure cannot be paraphrased away or dropped when a letter runs long. It says what wrote
  the letter, that a human added to it, where the meeting can be heard, and to reply to stop
  receiving them. Nothing in it argues.
- Plain text, no HTML.

### Receiving

`server/src/logic/letters/replies.ts`, routes in `server/src/api/letterRoutes.ts`.

- **Replies.** Brevo's inbound parsing receives every email to the reply domain and posts it
  to `POST /api/letters/brevo/inbound` (with `COUNCIL_LETTERS_WEBHOOK_SECRET` as its token),
  already split into the message, the signature and the quoted letter. The address names the
  meeting and carries the letter's token (`reindeer.1400.9f3ac2e1@…`), which finds the letter it
  answers; an email to no letter of ours, or to a guessed address, is dropped. Each is kept once
  (by its Message-ID) in `letter_replies`, with its contact details removed and the letter it
  answers, and sorted:
  - **spam** — Brevo's spam score 6 or more;
  - **automatic** — headers (`Auto-Submitted`, `X-Autoreply`, `Precedence`), a mailer daemon, or
    an out-of-office subject;
  - otherwise the classifier model: **reply**, **opt-out** or **automatic**.
- **Opt-outs** put the recipient on the blocklist, and are printed like any reply.
- **Printing.** The museum page asks the bridge once a minute for replies to its venue's
  letters not yet printed (`/v1/installation/letter-replies`; the bridge asks the server's
  `/api/installation/letter-replies` with the installation key), renders each in the letter's
  language — who wrote back, to which being, what they wrote — prints it once under its own
  job key, and tells the server. A reply whose letter had no venue prints at any venue.
  Automatic replies and spam are kept, never printed. A printed reply shows its sender's name
  and address, as a letter shows its recipient's.
- **Delivery events.** Brevo's transactional webhook posts to
  `POST /api/letters/brevo/events`: a hard bounce, an invalid address, a block, a spam
  complaint or an unsubscribe of a letter sent live puts its recipient on the blocklist — only
  when the event is about that letter's own recipient, since the webhook reports every email
  the Brevo account sends (Foods, printer alerts). Letters carry their meeting as a tag
  (`letter-1400`), which finds them.

### Setting up Brevo

1. **Sending domain.** *Senders, Domains & Dedicated IPs → Domains → Add a domain*:
   `council-of-forest.com`. Add the records Brevo shows (the `brevo-code` TXT, DKIM, and
   `_dmarc` TXT `v=DMARC1; p=none; …`). Brevo sends with its own bounce address and signs with
   the domain's DKIM, which is what makes DMARC pass; the domain's SPF need not include Brevo.
   Brevo's *authorised IPs*, if on, must list the server's outgoing IP, or every send is refused.
2. **Senders**, one per being: `reindeer@`, `bumblebee@`, `tree.harvester@`, `salmon@`,
   `mountain@`, `pine@`, `wind.turbine@`, `lichen@` council-of-forest.com.
3. **API key** (*SMTP & API → API Keys*) → `COUNCIL_BREVO_API_KEY` on the server.
4. **Forwarding.** A catch-all `*@council-of-forest.com` → `hello@nonhuman-nonsense.com`
   (registrar forwarding or Cloudflare Email Routing), for mail written straight to a being.
5. **Reply domain.** Add `reply.council-of-forest.com` as a domain in Brevo, and in DNS:
   `reply` MX 10 `inbound1.sendinblue.com.` and MX 20 `inbound2.sendinblue.com.`.
6. **Webhooks**, once the server runs with `COUNCIL_LETTERS_WEBHOOK_SECRET` set, both with
   *Token* authentication and the secret as the token (Brevo sends it as
   `Authorization: Bearer …`):
   - **Delivery events**, in Brevo's UI (*Transactional email* events): URL
     `https://council-of-forest.com/api/letters/brevo/events`, events Hard Bounced, Invalid,
     Blocked, Complaint and Unsubscribed.
   - **Replies**, only through the API (a webhook of type `inbound` for the reply domain):

   ```bash
   curl -X POST https://api.brevo.com/v3/webhooks -H "api-key: $COUNCIL_BREVO_API_KEY" -H "Content-Type: application/json" \
     -d '{"type":"inbound","events":["inboundEmailProcessed"],"domain":"reply.council-of-forest.com","url":"https://council-of-forest.com/api/letters/brevo/inbound","auth":{"type":"bearer","token":"<secret>"},"description":"Council of Forest replies"}'
   ```

7. **Test** with `COUNCIL_LETTERS=test` and `COUNCIL_LETTERS_TEST_TO`: run a museum meeting,
   check the sender, reply-to and SPF/DKIM/DMARC (*Show original*), reply to the letter and see
   the reply print. Then `COUNCIL_LETTERS=live`.
8. **The museum bridge** must run a version that passes replies on to the page.

### What varies between letters

Letters hang side by side, so the server varies them on purpose rather than hoping the model does:

- **Author** — the best-ranked member who has not written one of the last five letters.
- **Recent asks** — the plan sees what the latest letters asked (the last 24 asks) and asks for
  something else, or comes at the same matter from another side.
- **Recipients offered** — filtered by topic, then one from each category in turn (an MP, an
  agency, a company, a municipality, a researcher, a newsroom, a Sámi community …), at most
  `letterMaxCandidates` (16). The plan sees only what each decides on and why; their record is
  shown when the letter is written.
- **Form** — what the letter leans towards (requests, appeal, questions, invitation,
  recognition, note), the one used longest ago next.
- **Reply** — about half the letters end by asking the recipient to write back.

The plan starts from the meeting — what was said here that someone outside most needs to hear —
and the letter tells the recipient what was said and by whom. Every letter is an open letter:
written to the recipient, but printed and published with the meeting, so it explains what it
refers to. Beings whose speech is far from prose (Mountain, Wind Turbine) have a note on how their
voice holds in a letter.

### Letter safety

- The human's text is passed to the letter call as quoted content, not instructions, with
  contact details removed first.
- The recipient is validated against the list server-side; an unknown id fails the letter
  rather than guessing.
- Only what is on record may be said about a recipient: each carries sourced `facts` (MP votes
  from the Riksdag record, institutions from `shared/prompts/facts_and_sources.md`).
- No separate moderation check.

---

## Developing the prompts

The loop is: edit the prompts in `server/src/logic/letters/prompts/`, run the evaluation, read
the report.

- **Corpus** — `npm run letters:corpus` (in `server/`) generates 16 full-length meetings with
  today's prompts and production settings: two per topic, four in Swedish, 3–6 beings each,
  rotated so every being appears several times, and a human question in about three in four
  — ordinary, personal, industry, childlike, strange, rude, off-topic, campaigning and a
  prompt injection (`scripts/letters/humanLines.ts`). Each meeting runs through the server's
  real `MeetingManager` with audio off; questions go in through `raise_hand` and
  `submit_human_message`, as from a client. Meetings are stored in the local database, tagged
  `devCorpus.tag = "letters"`. About 45 seconds a meeting, four at a time.
- **Evaluation** — `npm run letters:eval` runs the letter steps on every tagged meeting, with one
  human addition each, rotated through the same mix (including empty, personal data and an
  injection), and writes `scripts/letters/reports/<time>.html` and `.json`. The report has a
  summary — authors, recipients, people vs institutions, flags — and a card per letter with the
  transcript, the exact prompts sent and the raw answers. Automatic checks flag what can be
  checked mechanically: wrong language, over length, no subject, markdown, meeting number
  missing, the human's words missing or wrongly present, and failures for an injected address,
  copied personal data or party campaigning. `--samples 3` reruns each meeting to see how stable
  the choices are; `--label` names a run; `--replay` reuses an earlier run's choices.

### What the evaluations settled (October 2026)

Eleven rounds on the same 16 meetings shaped the design above. What they decided, so it is not
undone by a prompt tweak:

- **Models.** The council itself stays on its conversation model; the plan and the letter are
  written by `letterModel` and the human's words woven in by `letterWeaveModel` (both Sonnet 5.5
  now; Opus 5.5 at first, which was more than letters need). Mistral Large 3 got facts about
  recipients wrong and invented quotes; the stronger model used the facts precisely.
- **Authors rotate in code, not in the prompt.** Prompt wording only moved the bias from one
  being to another; ranking every candidate and resting each author for five letters gives
  everyone turns, Tree Harvester and Wind Turbine included.
- **The human's words are sorted before the letter** (weave / apart / omit / decline). A single
  prompt cannot both "quote faithfully" and "leave out abuse".
- **Letters start from the meeting.** When the plan was fed long recipient records and argued
  `why` lines, letters drifted to whatever was on every recipient's record (the forestry law's
  notice period in 6 of 16). Recipients are now offered without their record, asks are one short
  sentence, and the letter says what was said at the meeting and by whom.
- **Always a letter.** Salutation, "you" and a signature; forms are what a letter leans towards
  inside that frame, not replacements for it. Openings without a greeting stopped reading as
  letters.
- **Beings keep their voice** — Bumblebee's z-speech, Mountain's stone-speech — with a note for
  the two furthest from prose on staying readable.
- **No injected "rethink" angles.** A rethink belongs in the meeting's own prompts, not added at
  the end.
- **Length** settles around 1,200 characters, which is accepted.

---

## Recipients

### Principles

The council exists because nobody is responsible for the sum: every mine, felling and turbine
passes its own permit. A letter puts that sum on the desk of someone responsible for one part.

1. **Can act.** The recipient decides, permits, owns, sets policy on, or reports on something
   the council discusses.
2. **One concrete ask within their remit.** That is what makes a reply possible, and replies
   are half the wall.
3. **Every side.** Agencies, companies, parliament, civil society, newsrooms. Allies alone give
   a comfortable wall; ministers alone give a silent one. Who answers, who doesn't, and who
   sends a form letter is the work.

### Two kinds of recipient

| | Institution | Person |
|---|---|---|
| What it is | registry desk, press desk, committee inbox, newsroom tip line | a named person at a public role address |
| Limit | one letter a day | **exactly one, ever** |
| Why | nobody personally receives it; it is registered and distributed | one letter is a letter; forty is a campaign |
| Footer | disclosure, link to the meeting, opt-out | the same |

Why not one-ever for everything: the show runs about 80 open days and may send hundreds of
letters. A pure one-ever rule spends its strongest recipients — Skogsstyrelsen, the ministry,
Sveaskog, LKAB — on the opening weekend, leaving later visitors the leftovers. Arrival order
would decide the artwork. Institutions keep the strong recipients available for the whole run;
people make the other half of the letters singular.

### Decisions

- **Public role addresses.** Institutions: registry, press and newsroom desks. People: public
  professional addresses that belong to a role (riksdagen.se, a university, a municipality) —
  never a private address. Swedish authorities have a duty to answer (Förvaltningslagen 6 §)
  and letters to them become allmän handling.
- **The list is committed to the public repo.** The addresses are already public, and a visible
  list of who the forest may write to fits showing the prompts in the exhibition.
- **Sámi recipients** — Sametinget, SSR and the samebyar — are on the list. Asking the side
  carrying the burden to act inverts a letter, so how a letter to them should read is still open
  (below).
- **Journalists are in**, as newsroom desks: the regional papers, SVT Västerbotten and
  Norrbotten, and Sameradion & SVT Sápmi. They are the most likely to reply, and a story about
  the letters is an acceptable outcome.
- **No heads-up letter** to institutions before the first letter; the footer explains and offers
  the opt-out. The partners (the biosphere reserve, Havremagasinet) are informed first.
- **MPs are matched by committee and constituency, never by party.** Otherwise the beings pick
  sides and break the prompts' own "characters never campaign" rule (see
  `shared/prompts/facts_and_sources.md` §2). Asking a decision-maker for a policy is advocacy;
  endorsing a party is campaigning. The letters do the first and never the second.

### The lists

Three files in `shared/prompts/letters/` (forest only), concatenated by the loader:

- **`institutions.json`** — agencies, the ministry registries, county boards and regions, the
  biosphere municipalities and a few more, companies, certification and industry bodies, civil
  society and research, newsrooms, tourism. Some organisations have no public address and are
  inactive until one is found.
- **`people-parliament.json`** — members of the Riksdag and Swedish members of the European
  Parliament, generated by `scripts/letters/fetch-people.mjs` from `data.riksdagen.se` and
  `data.europarl.europa.eu`. Regenerate it; never hand-edit it. Topics come from committee remit
  and from the four northern constituencies (Västerbotten, Norrbotten, Jämtland, Västernorrland),
  never from party; members with nothing to be asked for are left inactive.
- **`people.json`** — hand-collected: researchers (SLU, Umeå University), regional politicians,
  the two county governors, municipal executive board chairs.

### Entry shape

`id, name, kind (institution|person), category, email, language, remit, why, topics (forest
topic ids), limits, active, addressCheck, source, notes`.

Two fields carry the reason, and they do different work:

- **`remit`** — what they decide on or study, factual and neutral. Used to filter and to explain
  the entry to whoever curates the list.
- **`why`** — one sentence that finishes "we write to you because …". The author being sees it
  when choosing, so a recipient is told early why this arrived and not somewhere else.

Every active entry has both. For MPs and MEPs the script composes `why` from constituency and
committee. The author is only shown recipients tagged with the meeting's topic that are still
available; a custom topic sees the whole list.

---

## Open questions

Carried over from the design doc; none blocks sending.

- Letters to Sámi communities tend to hand them tasks. Tell the author that such a letter
  listens and stands beside them, and asks nothing on the council's behalf?
- Some recipients' `why` lines argue a case rather than state a role; rewrite them as plain roles
  if letters lean on them.
- Letters repeat the topic prompts' claim that the Church of Sweden "is stopping" lodgepole pine
  as "has stopped" — check the wording in the topic prompts.
- MEPs have no `facts` (no EU vote export), so letters to them say nothing about their record.
- Re-run `fetch-people.mjs` once the new Riksdag's committees are appointed (the file uses the
  previous term's committees), and add the new government's ministers.
- Confirm the institution addresses found only through search on each organisation's own site
  before activating them.
- Later: sent state and replies on the replay page; letters for Council of Foods.
