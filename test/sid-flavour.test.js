const test = require('node:test');
const assert = require('node:assert');
const flavour = require('../src/sid-flavour');

test('copy pools', async (t) => {
  await t.test('offer enough variety to not feel repetitive', () => {
    assert.ok(flavour.LOADING.length >= 10, `only ${flavour.LOADING.length} loading lines`);
    assert.ok(flavour.SILENCE.length >= 3);
    assert.ok(flavour.FAILURE.length >= 3);
  });

  await t.test('hold no duplicates', () => {
    for (const pool of [flavour.LOADING, flavour.SILENCE, flavour.FAILURE]) {
      assert.equal(new Set(pool).size, pool.length);
    }
  });

  await t.test('are non-empty single lines', () => {
    for (const pool of [flavour.LOADING, flavour.SILENCE, flavour.FAILURE]) {
      for (const line of pool) {
        assert.ok(line.trim().length > 0);
        assert.ok(!line.includes('\n'), `"${line}" spans lines`);
      }
    }
  });
});

test('pick', async (t) => {
  await t.test('always returns a member of the pool', () => {
    for (let i = 0; i < 200; i++) {
      assert.ok(flavour.LOADING.includes(flavour.loadingLine()));
      assert.ok(flavour.SILENCE.includes(flavour.silenceLine()));
      assert.ok(flavour.FAILURE.includes(flavour.failureLine()));
    }
  });

  await t.test('actually varies rather than always picking the first', () => {
    const seen = new Set();
    for (let i = 0; i < 300; i++) seen.add(flavour.loadingLine());
    // With 16 lines and 300 draws, seeing fewer than half would mean it is stuck
    assert.ok(seen.size > flavour.LOADING.length / 2, `only saw ${seen.size} distinct lines`);
  });

  await t.test('reaches both ends of the pool', () => {
    const seen = new Set();
    for (let i = 0; i < 2000; i++) seen.add(flavour.pick(flavour.LOADING));
    assert.ok(seen.has(flavour.LOADING[0]));
    assert.ok(seen.has(flavour.LOADING[flavour.LOADING.length - 1]));
  });
});

test('progressBar', async (t) => {
  await t.test('is empty at zero and full at one', () => {
    assert.match(flavour.progressBar(0, 10), /^`░{10}` 0%$/);
    assert.match(flavour.progressBar(1, 10), /^`█{10}` 100%$/);
  });

  await t.test('fills proportionally', () => {
    assert.match(flavour.progressBar(0.5, 10), /^`█{5}░{5}` 50%$/);
  });

  await t.test('keeps a constant width whatever the fraction', () => {
    for (const fraction of [0, 0.13, 0.5, 0.77, 1]) {
      const cells = flavour.progressBar(fraction, 14).match(/[█░]/g);
      assert.equal(cells.length, 14);
    }
  });

  await t.test('clamps values outside the range instead of overflowing', () => {
    assert.match(flavour.progressBar(-1, 10), /^`░{10}` 0%$/);
    assert.match(flavour.progressBar(4, 10), /^`█{10}` 100%$/);
  });
});
