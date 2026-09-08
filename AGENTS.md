# Working in this repository

Written from mistakes actually made here. Everything below cost something to
learn, so read it before changing code rather than after.

## Orientation

A Discord bot for a C64 demoscene group. It watches channels, picks up `.prg`,
`.d64` and `.sid` attachments, stores them in an external MinIO, and replies -
with an emulator link for programs, or a rendered MP3 for music.

```
src/index.js              startup, node version guard, Discord client, HTTP server
src/handlers/             one class per behaviour, see below
src/file-types.js         the single source of truth for extensions
src/minio-service.js      storage; listFiles is the choke point for everything
src/file-cleanup.js       retention - the most dangerous file in the repo
src/sid-header.js         PSID/RSID header parsing, pure, no emulator
src/sid-dsp.js            fade, deinterleave, peak - pure maths over PCM
src/sid-service.js        render queue, worker lifecycle, timeouts
src/sid-flavour.js        every line the bot says out loud about a tune
src/sid-render.worker.mjs the only ESM file, and the only place WASM runs
test/                     node:test, no framework
```

## The handler registry runs every matching handler

`HandlerRegistry.processMessage()` deliberately does not stop at the first
match, and it awaits handlers in priority order. Two consequences that have
already caused bugs:

- Two handlers can both claim one message and both reply. `PrgFileHandler`
  claims anything starting with the command prefix, so a `c64 <text>` message
  with a `.sid` attached hits both. Whenever you add a handler, work out what
  else claims the same message.
- A handler that deletes the original message can pull it out from under a
  later handler that is still working. Deletion ownership is explicit: nobody
  deletes a message carrying attachments another handler owns.

## Two module systems, on purpose

Everything is CommonJS except `src/sid-render.worker.mjs`. That file is ESM
because `libsidplayfp-wasm` and `@breezystack/lamejs` are both ESM-only and
cannot be `require`d.

This has bitten production once already. An npm `override` forced an ESM-only
package into a CommonJS dependency's `require()`, which worked on the
development machine because newer Node supports `require(esm)`, and killed the
bot on the host, which did not. **Before overriding any transitive dependency,
check its `"type"` field and whether its consumer is CommonJS.**

## Never put CPU work on the main thread

`renderSeconds()` in libsidplayfp is declared `async` but its inner loop
contains no `await`. On the main thread a 180-second render blocks the Discord
gateway heartbeat for its entire duration. That is why rendering lives in a
worker thread, and why `test/sid-render.integration.test.js` asserts the event
loop stays responsive during a render. If you move that work, the test is the
thing that will tell you.

## Retention deletes data and cannot be undone

`src/file-cleanup.js` runs at startup and daily. It has already destroyed ~178
files in production. Two rules:

- Anything that widens what `listFiles()` returns makes previously invisible
  objects eligible for deletion **all at once**. Check the deployed `MAX_FILES`
  against the real object count before such a change ships, not just the local
  `.env` - they are different files on different machines.
- `MAX_DELETIONS_PER_RUN` bounds a single run. Do not turn it back into an
  all-or-nothing refusal: refusing latches, because the overage only grows
  between runs, and the bucket then grows without limit.

The bucket has no versioning, so a mistake here is permanent.

## Tests

```
npm test        # node --test test/*.test.js
```

- The glob is scoped deliberately. Bare `node --test` also matches
  `test-discord-token.js` and `test-minio-connection.js` in the root, which
  **open real Discord and MinIO connections**. Never widen it.
- The glob is expanded by Node, not the shell, which is what makes it work
  under `cmd.exe`. That needs Node 21+; the bot itself needs only 20.
- No suite may depend on the ambient environment. Modules read their config once
  at load, so tests re-require them through a helper that sets and restores the
  variables (`handlerWithEnv`, `handlerWithFlag`, `cleanupWithEnv`). A suite that
  reads a top-level `require` will fail for whoever has that variable exported.
- Stub Discord messages with a real discord.js `Collection` for attachments;
  the handlers use `.some()`, `.size` and `.values()` on it.

## Line endings are mixed

Blobs in this repository are inconsistent: `src/file-cleanup.js` and
`.dockerignore` are CRLF, `README.md`, `src/index.js` and `package-lock.json`
are LF. With `core.autocrlf=true` a touched file gets rewritten wholesale and a
60-line change shows up as a 2600-line diff.

Match whatever the file already has. `git show origin/master:<path>` tells you.

## Verify against the real thing

This repository has broken in production twice from changes that passed locally.
Both times the local environment differed from the host in a way the change
depended on. So:

- Run the bot (`PORT=<free port> npm start`) and read the startup output.
- Build and run the container, do not just write the Dockerfile.
- When a change touches storage, count the objects before and after.
- A measurement in the pull request beats a claim.

`.env` holds live credentials for the group's real MinIO and a real Discord bot.
Anything you run against it is real.

## Discord details worth knowing

- Attachment names are attacker-chosen and reach message content. `allowedMentions`
  must be applied **after** the payload spread, or a payload silently overrides it -
  a file called `@everyone.sid` would otherwise ping the server.
- Message edits parse every mention type by default; `reply()` with an
  `allowedMentions` object that has no `parse` key does not.
- Discord renders an inline audio player from the `.mp3` file extension. Do not
  reference the attachment from the embed with `attachment://` - that suppresses it.
- Deleting a user's message needs the Manage Messages permission.

## Conventions

Comments explain why, not what, and they are worth writing where a reader would
otherwise change something back. Match the surrounding style rather than
importing a new one. Keep pull requests to one concern; the git history here is
the main record of why things are the way they are.
