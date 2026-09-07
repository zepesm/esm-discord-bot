const test = require('node:test');
const assert = require('node:assert');
const { parseSidHeader } = require('../src/sid-header');

/**
 * Build a synthetic PSID/RSID header, so these tests need no fixture at all
 */
function buildHeader({
  magic = 'PSID',
  version = 2,
  songs = 1,
  startSong = 1,
  initAddress = 0x1000,
  playAddress = 0x1006,
  flags = 0,
  title = 'Test Tune',
  author = 'Somebody',
  released = '2026 Elysium',
  length = 0x7c,
} = {}) {
  const buffer = Buffer.alloc(length);
  buffer.write(magic, 0x00, 'latin1');
  buffer.writeUInt16BE(version, 0x04);
  buffer.writeUInt16BE(0x7c, 0x06);
  buffer.writeUInt16BE(initAddress, 0x0a);
  buffer.writeUInt16BE(playAddress, 0x0c);
  buffer.writeUInt16BE(songs, 0x0e);
  buffer.writeUInt16BE(startSong, 0x10);
  buffer.write(title, 0x16, 'latin1');
  buffer.write(author, 0x36, 'latin1');
  buffer.write(released, 0x56, 'latin1');
  if (length >= 0x78) buffer.writeUInt16BE(flags, 0x76);
  return buffer;
}

test('parseSidHeader', async (t) => {
  await t.test('reads the text fields and trims NUL padding', () => {
    const header = parseSidHeader(buildHeader());
    assert.equal(header.title, 'Test Tune');
    assert.equal(header.author, 'Somebody');
    assert.equal(header.released, '2026 Elysium');
  });

  await t.test('decodes big-endian song counts', () => {
    const header = parseSidHeader(buildHeader({ songs: 0x0102, startSong: 0x0102 }));
    assert.equal(header.songs, 258);
    assert.equal(header.startSong, 258);
  });

  await t.test('keeps the default subtune from the header', () => {
    // This is the value loadSidBuffer would otherwise silently overwrite with 1
    const header = parseSidHeader(buildHeader({ songs: 12, startSong: 7 }));
    assert.equal(header.startSong, 7);
  });

  await t.test('clamps a start song outside the available range', () => {
    assert.equal(parseSidHeader(buildHeader({ songs: 3, startSong: 9 })).startSong, 3);
    assert.equal(parseSidHeader(buildHeader({ songs: 3, startSong: 0 })).startSong, 1);
  });

  await t.test('decodes ISO-8859-1 rather than UTF-8', () => {
    // 0xE9 is é in latin1, and an invalid lead byte in UTF-8
    const raw = buildHeader({ title: '' });
    raw.write('Bj\xF6rk', 0x16, 'latin1');
    assert.equal(parseSidHeader(raw).title, 'Björk');
  });

  await t.test('flags RSID tunes', () => {
    const header = parseSidHeader(buildHeader({ magic: 'RSID' }));
    assert.equal(header.isRsid, true);
    assert.equal(header.likelyNeedsRoms, true);
  });

  await t.test('flags BASIC tunes through the version 2 flags word', () => {
    assert.equal(parseSidHeader(buildHeader({ flags: 0x0002 })).needsBasic, true);
    assert.equal(parseSidHeader(buildHeader({ flags: 0x0000 })).needsBasic, false);
  });

  await t.test('flags tunes that run from ROM addresses', () => {
    assert.equal(parseSidHeader(buildHeader({ playAddress: 0xe000 })).likelyNeedsRoms, true);
    assert.equal(parseSidHeader(buildHeader({ initAddress: 0xa100 })).likelyNeedsRoms, true);
    assert.equal(parseSidHeader(buildHeader()).likelyNeedsRoms, false);
  });

  await t.test('ignores the flags word on version 1 headers', () => {
    const header = parseSidHeader(buildHeader({ version: 1, flags: 0x0002 }));
    assert.equal(header.needsBasic, false);
  });

  await t.test('rejects anything that is not a SID file', () => {
    assert.throws(() => parseSidHeader(buildHeader({ magic: 'MZ\0\0' })), /Not a SID file/);
    assert.throws(() => parseSidHeader(Buffer.alloc(16)), /too short/);
    assert.throws(() => parseSidHeader('not a buffer'), /too short/);
  });
});
