# Testing philosophy

What deserves a test in this codebase, at what level, and — just as important — what does
not. This is the rubric for reviewing existing tests and for writing new ones. If you are an
agent adding a feature, read this before adding tests; if you are reviewing tests, every
keep/merge/delete verdict should be justifiable in terms of this doc.

This is a reference doc, not a plan: like [RESILIENCE.md](RESILIENCE.md), it describes the
durable policy. Work-in-progress documents (including test-review inventories) belong in
`docs/`.

## The one rule

> Test **behaviors at a module's boundary**, not implementations inside it.

A test earns its place if both are true:

1. It **fails when a contract-visible behavior breaks** — something a user, the other side of
   the socket protocol, or a calling module would notice.
2. It **survives a refactor** of the module's internals. A test that must be rewritten when
   the code is restructured (but behavior is unchanged) was testing the implementation.

Coverage percentage is a diagnostic for finding *untested behaviors*, never a goal. 100%
line coverage with implementation-mirroring tests is worse than 70% coverage of real
contracts, because the former actively resists refactoring.

## This app's risk profile

Council of Foods is a long-running, event-driven orchestration system — meeting lifecycle,
speaker selection, audio queueing, socket reconnect, resume/replay — that must run
**unattended in a museum** for days. The failure modes that actually hurt are stalls,
deadlocks, stale events, dropped intents, and reconnect races. Cosmetic UI regressions are
noticed and fixed in minutes; a kiosk deadlock at 10am on a Saturday is not.

That inverts the usual front-end testing instincts. The test suite's center of gravity is
state machines and protocol, not rendering.

## Value hierarchy

When deciding whether a test is worth writing (or keeping), rank it here:

1. **State-machine and protocol behavior** — highest value. Server: meeting lifecycle
   transitions, resume/replay, speaker selection, audio drain, hand raising, human input,
   realtime sessions. Client: the council machine (`useCouncilMachine`), pending-intent
   reconciliation (see [RESILIENCE.md](RESILIENCE.md)), autoplay coordination, socket
   reconnect. The integration tests that drive these over real socket.io + in-memory Mongo
   are the most valuable tests in the repo.
2. **Cheap contract checks** — validation schemas, asset integrity (icons, food
   images/videos), locale completeness, data-file shape. They look trivial but catch real
   breakage in a project where assets, prompts, and translations change often, and they cost
   milliseconds. Keep them.
3. **Component interaction behavior** — a menu that toggles, an overlay action that resumes
   playback, an input that submits. Test through user-visible effects (Testing Library
   queries, fired events), not internal state.
4. **Low value — do not write, delete on sight:**
   - "Renders correctly" tests and snapshot-shaped assertions on static markup.
     `toMatchSnapshot()` is lint-blocked in both `client/` and `server/` tests for this
     reason — it mirrors implementation and breaks opaquely on cosmetic refactors; assert
     the specific values instead.
   - Tests whose only assertion is that a mock was called with specific arguments, where
     those arguments just restate the implementation.
   - The same behavior re-proven at multiple levels "for safety". Pick the lowest level that
     can express the behavior and test it once.

`.only` on `it`/`test`/`describe` is also lint-blocked — with no CI running the suite, a
stray `.only` left in a commit would silently disable the rest of the file for anyone else
who runs it.

## The LLM and TTS boundary

Tests run against mocked OpenAI/ElevenLabs/Inworld by default. Assert **orchestration** —
who speaks next, which events fire, what gets persisted, how errors propagate — never prompt
wording, message phrasing, or details of a mocked response format that only exist because the
mock says so. Prompt content changes constantly; tests must not be the reason a prompt tweak
touches twenty files.

The server's `test:fast` / `test:full` modes (real API) exist to validate the integration
itself, not logic. Logic tests belong in mock mode.

## Conventions

- **One behavior per test.** The test name is a sentence stating the behavior
  (`'stays paused in web mode when hash overlay is dismissed'`), so a failure reads as a spec
  violation without opening the file.
- **Table-driven tests for matrices.** When a behavior is a grid (mode × trigger × expected
  outcome — e.g. auto-pause/auto-resume), write one parameterized test over a table of cases,
  not N prose copies of the same arrange/act/assert. Future cases are then a one-line row,
  and the full matrix is visible in one screen.
- **Search before you add.** Before writing a test, look for an existing file covering that
  module and an existing case covering that behavior. Extending a table or an existing
  `describe` beats creating a parallel file. One module should have one obvious home for its
  tests.
- **Deleting tests is encouraged.** A PR that replaces five narrow tests with one table, or
  deletes a test made redundant by a better one at a lower level, is a good PR. Tests are
  code; unmaintained duplication rots the same way.
- **Choose the lowest level that expresses the behavior.** Pure function → unit test of the
  function. Hook/state machine → hook test. Cross-component or socket wiring → integration
  test. Full user journey → e2e, of which we keep only a few happy-path smoke flows, because
  they are slow and flaky by nature.
- **Speed is a feature.** The mock-mode suites run on every change (by humans and agents).
  A test that adds seconds needs to earn them; prefer fake timers over real waits.
- **Fake timers whenever a behavior is gated by a real `setTimeout`/`setInterval` of
  ~1s or more.** `waitFor`'s default timeout is 1000ms; a test that leaves real timers running
  and waits on a debounce/delay at or above that (e.g. `FINISHING_QUIET_MS`,
  `BUTTON_BANNER_IDLE_MS`) is racing its own assertion and will flake under load even though it
  passes reliably on an idle machine. Use `vi.useFakeTimers({ shouldAdvanceTime: true })`, drive
  the delay explicitly with `vi.advanceTimersByTimeAsync(ms)`, and call `vi.useRealTimers()`
  afterward (or in `afterEach`) so it doesn't leak into other tests. Short real waits (tens of
  ms) to assert something did *not* happen are fine as-is — fake timers are for delays the test
  is actually depending on to reach the asserted state.

## When a change needs a new test

- **New behavior or contract** → yes, at the lowest level that expresses it.
- **Bug fix** → a regression test that fails before the fix and passes after. If the bug was
  a resilience failure (stall, race, stale event), the test belongs with the other
  state-machine tests, and RESILIENCE.md may need updating too.
- **Refactor** → no new tests. Existing tests should pass unchanged; if many had to be
  rewritten, they were implementation tests — fold that improvement into the refactor.
- **Prompt/copy/asset change** → usually no new test; the integrity and locale checks
  already cover the shape.

## Where tests live and how to run them

- **Server** — `server/tests/`, Vitest. `npm test` runs type-check + all tests in mock mode.
  DB-backed tests are split out (`test:unit` vs `test:integration` configs);
  `*.integration.test.*` files drive real HTTP + socket.io against `mongodb-memory-server`.
  `TEST_MODE=fast|full` switches to the real OpenAI API — see
  [server/README.md](server/README.md).
- **Client** — `client/tests/unit/` (Vitest + Testing Library, jsdom), `client/tests/foods/`
  (app-level wiring of routes/data), `client/tests/e2e/` (Playwright, needs
  `npm run e2e-server` in `server/`).
- **Shared** protocol/helpers (`shared/`) are tested from whichever side consumes them —
  don't create a third suite.
