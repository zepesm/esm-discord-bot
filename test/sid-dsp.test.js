const test = require('node:test');
const assert = require('node:assert');
const { peakAmplitude, applyFadeOut, deinterleave } = require('../src/sid-dsp');

test('peakAmplitude', async (t) => {
  await t.test('is zero for silence', () => {
    assert.equal(peakAmplitude(new Int16Array(1000)), 0);
  });

  await t.test('finds the loudest sample', () => {
    assert.equal(peakAmplitude(Int16Array.from([10, -4200, 300])), 4200);
  });

  await t.test('handles the negative extreme of the range', () => {
    assert.equal(peakAmplitude(Int16Array.from([-32768, 5])), 32768);
  });

  await t.test('is zero for an empty buffer', () => {
    assert.equal(peakAmplitude(new Int16Array(0)), 0);
  });
});

test('applyFadeOut', async (t) => {
  const sampleRate = 100;
  const channels = 2;

  const fullScale = (frames) => {
    const pcm = new Int16Array(frames * channels);
    pcm.fill(1000);
    return pcm;
  };

  await t.test('drives the last frame to silence', () => {
    const pcm = applyFadeOut(fullScale(100), { channels, sampleRate, fadeSeconds: 0.5 });
    assert.equal(pcm[pcm.length - 1], 0);
    assert.equal(pcm[pcm.length - 2], 0);
  });

  await t.test('leaves everything before the fade untouched', () => {
    const pcm = applyFadeOut(fullScale(100), { channels, sampleRate, fadeSeconds: 0.5 });
    // 100 frames, 50 fade frames, so frame 49 is the last untouched one
    assert.equal(pcm[49 * channels], 1000);
  });

  await t.test('ramps linearly through the fade', () => {
    const pcm = applyFadeOut(fullScale(100), { channels, sampleRate, fadeSeconds: 0.5 });
    // Frame 75 sits halfway through a 50-frame fade starting at frame 50
    const expected = Math.round(1000 * ((100 - 1 - 75) / 50));
    assert.equal(pcm[75 * channels], expected);
  });

  await t.test('fades both channels alike', () => {
    const pcm = applyFadeOut(fullScale(100), { channels, sampleRate, fadeSeconds: 0.5 });
    assert.equal(pcm[75 * channels], pcm[75 * channels + 1]);
  });

  await t.test('clamps a fade longer than the audio instead of writing out of bounds', () => {
    const pcm = applyFadeOut(fullScale(10), { channels, sampleRate, fadeSeconds: 60 });
    assert.equal(pcm.length, 20);
    assert.equal(pcm[pcm.length - 1], 0);
    // Degenerate but safe: the ramp simply covers the whole buffer, so even the
    // first frame is already slightly attenuated
    assert.equal(pcm[0], Math.round(1000 * (9 / 10)));
  });

  await t.test('is a no-op for empty audio or a zero fade', () => {
    assert.equal(applyFadeOut(new Int16Array(0), { channels, sampleRate, fadeSeconds: 1 }).length, 0);
    const untouched = applyFadeOut(fullScale(10), { channels, sampleRate, fadeSeconds: 0 });
    assert.equal(untouched[untouched.length - 1], 1000);
  });
});

test('deinterleave', async (t) => {
  await t.test('splits LRLR into two channels', () => {
    const { left, right } = deinterleave(Int16Array.from([1, 2, 3, 4, 5, 6]));
    assert.deepEqual([...left], [1, 3, 5]);
    assert.deepEqual([...right], [2, 4, 6]);
  });

  await t.test('produces empty channels for empty input', () => {
    const { left, right } = deinterleave(new Int16Array(0));
    assert.equal(left.length, 0);
    assert.equal(right.length, 0);
  });
});
