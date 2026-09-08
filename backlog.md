# Backlog

Things worth doing that were deliberately not done, with enough measurement
attached that the decision can be revisited without repeating the work.
Newest first.

---

## 2026-09-08 — SID emulation fidelity: engine and chip model

**Status:** open. Affects how every `.sid` upload sounds.

The bot never sets a SID chip model. The effective render configuration is:

```
sidModel: "MOS8580"    forceSidModel: false
c64Model: "PAL"        forceC64Model: false
digiBoost: true        samplingMethod: RESAMPLE_INTERPOLATE
```

`forceSidModel: false` means libsidplayfp takes the model from the PSID header
when a tune declares one (flags word, bits 4-5), and falls back to **8580** when
it says `UNKNOWN`. A lot of older HVSC material declares nothing and was written
on a **6581**, whose filter has a completely different character. `digiBoost` is
also an 8580-oriented setting.

**The larger problem: the default engine ignores the model entirely.** Measured
by forcing both models on the same tune:

```
engine=sidlite
  6581 -> peak 4550  rms 2540
  8580 -> peak 4550  rms 2540      differs: false

engine=residfp
  6581 -> peak 8313  rms 2790
  8580 -> peak 4240  rms 2058      differs: true
```

SIDLite accepts the setting and does nothing with it - identical to the digit.
reSIDfp models it, nearly 2x in peak, and that is on a plain test tone; a tune
that actually uses the filter will differ far more. The library's own README
frames it the same way: reSIDfp reproduces "chips as faithfully as it can",
SIDLite is "fast, clean playback".

`sidlite` was chosen as the default for throughput - 28x realtime against 3.8x -
because rendering happens in-process alongside the Discord gateway. For a
demoscene group that is arguably the wrong trade: it saves around 40 seconds of
CPU per tune at the cost of the chip character, which is the part that matters.

**Proposed, in order:**

1. Default `SID_ENGINE` to `residfp`. The render timeout already scales with
   requested length, so roughly 47s of emulation for a 180s tune fits.
2. Expose `SID_MODEL` as an explicit override.
3. Change the `UNKNOWN` fallback from 8580 to 6581, and turn `digiBoost` off
   with it.

**Before doing any of it:** render the same tune both ways and listen. This is a
change to how things sound, not a correctness fix, so it belongs to whoever owns
the music.

---

## 2026-09-08 — Deferred technical debt

**`downloadFile` in `prg-file-handler.js` is unhardened.** The copy in
`sid-file-handler.js` was fixed during review: it listens for write-stream
errors (an ENOSPC mid-pipe otherwise becomes an unhandled event and kills the
process), drains the socket on a non-200, and times out after 30s. The `.prg`
path still has all three weaknesses. Left alone at the time to keep a PR's blast
radius contained; it should be brought in line, ideally by sharing one
implementation.

**MinIO has no bucket versioning.** This turned an operational mistake into
permanent data loss on 2026-09-07 - roughly 178 files. Enabling versioning makes
that class of failure recoverable. It is a change to the storage, not this repo.

**`.png` objects and the `screenshots/` prefix are invisible to cleanup.**
`ALL_EXTENSIONS` does not include them, so they accumulate untouched. Currently
6 objects, so it is not urgent, but it is the same shape of problem that caused
the `.d64` incident: something in the bucket that nothing is responsible for.

**`/api/files` emits `playUrl: null` for music.** A deliberate choice - a
present-but-null field keeps the records uniform and makes "no emulator link"
explicit. Undocumented on purpose, to avoid presenting an internal JSON shape as
a stable contract while nothing external consumes it. Document it if anything
starts to.

**No container healthcheck.** The bot exits non-zero when Discord login fails,
so the restart policy covers the obvious case, but a gateway that silently stops
delivering messages looks healthy. A `/healthz` reporting client readiness would
close that, at the cost of wiring the Discord client into the file server.

---

## 2026-09-08 — Feature ideas for demo development

Sketched against what the bucket actually contains: 272 distinct build names, of
which **76 are uploaded repeatedly** - `bigtech.prg` 87 times, `z-bars.prg` 83
(12.9 KB grown to 59.8 KB), `side1.d64` 61, `maze.prg` 44 (60.6 KB down to
45.4 KB, presumably after crunching). The bot receives a development diary and
currently does nothing with it.

**Build tracker.** Report load address, size and the delta against the previous
upload of the same name, plus detection of a byte-identical rebuild:

```
bigtech.prg   $0801-$FFD2   63 442 B   +1 243 B  (build 87)
```

The first two bytes of a `.prg` are the load address; everything else is
arithmetic over data already in MinIO. No new dependencies. Note that a demo
filling all of memory and running under the ROMs is normal - the newest
`bigtech.prg` spans `$0801-$FFD2` - so this must inform rather than warn, or it
will cry wolf on every build.

**Disk directory for `.d64`.** Parse track 18 and print the directory the way a
C64 would, with a launch button per file rather than one for the whole image.
The format is fully documented and it is pure sector arithmetic.

**Screenshot or short GIF of the first seconds.** The highest payoff and the
highest risk: a headless C64 emulator in WebAssembly, run N frames, dump the
pixel buffer. Feasible in Node without native binaries, but it needs C64 ROMs -
audio got away without them, video will not - and a demo with its own loader may
not show anything useful in a few frames. Would want a proof of concept before
any integration.
