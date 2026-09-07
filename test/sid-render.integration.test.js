const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const { renderSid, SidRenderError } = require('../src/sid-service');

/**
 * The dependency ships a 380-byte test tone, so no third-party SID file has to
 * be committed here. Resolving it can fail on a checkout without node_modules,
 * in which case the render tests skip rather than fail.
 */
function fixturePath() {
  try {
    return require.resolve('libsidplayfp-wasm/fixtures/test-tone-c4.sid');
  } catch {
    return null;
  }
}

test('renderSid rejects bad input before spawning a worker', async (t) => {
  await t.test('refuses a file that is not a SID', async () => {
    await assert.rejects(
      () => renderSid(Buffer.alloc(200)),
      (error) => error instanceof SidRenderError === false && /Not a SID file/.test(error.message)
    );
  });

  await t.test('refuses a file far too large to be a tune', async () => {
    const huge = Buffer.alloc(2 * 1024 * 1024);
    await assert.rejects(() => renderSid(huge), /far larger than any SID tune/);
  });
});

test('renderSid end to end', { timeout: 120000 }, async (t) => {
  const fixture = fixturePath();
  if (!fixture) {
    t.skip('libsidplayfp-wasm fixture not available');
    return;
  }

  const sid = fs.readFileSync(fixture);
  const result = await renderSid(sid, { seconds: 2, fadeSeconds: 1 });

  await t.test('reads the tune metadata from the header', () => {
    assert.equal(result.header.magic, 'PSID');
    assert.equal(result.header.title, 'Test Tone C4');
    assert.equal(result.header.songs, 1);
  });

  await t.test('produces audible audio rather than silence', () => {
    assert.equal(result.silent, false);
    assert.deepEqual(result.warnings, []);
  });

  await t.test('renders the requested duration', () => {
    assert.equal(result.meta.renderedSeconds, 2);
    assert.equal(result.meta.sampleRate, 44100);
    assert.equal(result.meta.channels, 2);
  });

  await t.test('returns a real MP3 bitstream', () => {
    assert.ok(Buffer.isBuffer(result.mp3));
    // MPEG audio frame sync: 11 set bits, then MPEG-1 Layer III
    assert.equal(result.mp3[0], 0xff);
    assert.equal(result.mp3[1] & 0xf0, 0xf0);
    // 2 seconds at 128 kbps is roughly 32 KB; allow generous slack
    assert.ok(result.mp3.length > 16 * 1024, `mp3 was only ${result.mp3.length} bytes`);
  });

  await t.test('keeps the event loop responsive while rendering', async () => {
    // The whole reason the render lives on a worker thread: libsidplayfp's
    // render loop contains no await, so on the main thread it would stall the
    // Discord gateway heartbeat for its entire duration.
    let worstDelay = 0;
    let last = Date.now();
    const timer = setInterval(() => {
      const now = Date.now();
      worstDelay = Math.max(worstDelay, now - last - 50);
      last = now;
    }, 50);

    try {
      await renderSid(sid, { seconds: 2, fadeSeconds: 1 });
    } finally {
      clearInterval(timer);
    }

    assert.ok(worstDelay < 500, `event loop stalled for ${worstDelay}ms`);
  });
});
