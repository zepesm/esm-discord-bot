const test = require('node:test');
const assert = require('node:assert');
const {
  EMULATOR_EXTENSIONS,
  AUDIO_EXTENSIONS,
  ALL_EXTENSIONS,
  hasExtension,
  stripTimestamp,
} = require('../src/file-types');

test('hasExtension', async (t) => {
  await t.test('matches regardless of case', () => {
    assert.equal(hasExtension('Tune.SID', AUDIO_EXTENSIONS), true);
    assert.equal(hasExtension('DEMO.PRG', EMULATOR_EXTENSIONS), true);
    assert.equal(hasExtension('disk.D64', EMULATOR_EXTENSIONS), true);
    // The old .prg/.PRG check missed mixed case entirely
    assert.equal(hasExtension('Game.Prg', ALL_EXTENSIONS), true);
  });

  await t.test('keeps the file kinds apart', () => {
    assert.equal(hasExtension('tune.sid', EMULATOR_EXTENSIONS), false);
    assert.equal(hasExtension('demo.prg', AUDIO_EXTENSIONS), false);
  });

  await t.test('handles names with several dots', () => {
    assert.equal(hasExtension('my.tune.v2.sid', AUDIO_EXTENSIONS), true);
  });

  await t.test('rejects unrelated and missing names', () => {
    assert.equal(hasExtension('build.log', ALL_EXTENSIONS), false);
    assert.equal(hasExtension('', ALL_EXTENSIONS), false);
    assert.equal(hasExtension(undefined, ALL_EXTENSIONS), false);
  });

  await t.test('defaults to every known extension', () => {
    assert.equal(hasExtension('tune.sid'), true);
    assert.equal(hasExtension('demo.prg'), true);
    assert.equal(hasExtension('notes.txt'), false);
  });
});

test('stripTimestamp', async (t) => {
  await t.test('removes the upload suffix and keeps the extension', () => {
    // The extension has to survive now that three file kinds share one listing
    assert.equal(stripTimestamp('player-1788759111614.prg'), 'player.prg');
    assert.equal(stripTimestamp('Pumpkins_side1-1788759111614.d64'), 'Pumpkins_side1.d64');
    assert.equal(stripTimestamp('Commando-1788759111614.sid'), 'Commando.sid');
  });

  await t.test('keeps digits that belong to the name', () => {
    assert.equal(stripTimestamp('tune-2-1788759111614.sid'), 'tune-2.sid');
  });

  await t.test('leaves names without a timestamp alone', () => {
    assert.equal(stripTimestamp('plain.prg'), 'plain.prg');
    assert.equal(stripTimestamp(''), '');
  });
});
