/**
 * PSID / RSID header parsing.
 *
 * Kept free of the emulator on purpose. It runs on the main thread before a
 * render is queued, so a file that is not a SID at all is rejected in
 * microseconds, and the reply embed can still carry the tune's metadata even
 * when rendering later fails.
 */

// Offsets from the PSID/RSID specification
const OFFSET_MAGIC = 0x00;
const OFFSET_VERSION = 0x04;
const OFFSET_DATA = 0x06;
const OFFSET_INIT = 0x0a;
const OFFSET_PLAY = 0x0c;
const OFFSET_SONGS = 0x0e;
const OFFSET_START_SONG = 0x10;
const OFFSET_TITLE = 0x16;
const OFFSET_AUTHOR = 0x36;
const OFFSET_RELEASED = 0x56;
const OFFSET_FLAGS = 0x76;

// A v1 header is 0x76 bytes; v2+ adds the flags word and a few fields
const MIN_HEADER_LENGTH = 0x76;
const TEXT_FIELD_LENGTH = 32;

/**
 * Read one of the fixed-width text fields.
 * The spec says ISO-8859-1, not UTF-8, and pads with NUL.
 * @param {Buffer} buffer - Whole file
 * @param {Number} offset - Field start
 * @returns {String} Trimmed field value
 */
function readTextField(buffer, offset) {
  return buffer
    .toString('latin1', offset, offset + TEXT_FIELD_LENGTH)
    .replace(/\0[\s\S]*$/, '')
    .trim();
}

/**
 * Addresses inside the BASIC or KERNAL ROM areas, which a tune can only use
 * when the real ROMs are present
 * @param {Number} address - 16-bit C64 address
 * @returns {Boolean} True if the address lives in ROM
 */
function isRomAddress(address) {
  return (address >= 0xa000 && address <= 0xbfff) || address >= 0xe000;
}

/**
 * Parse a SID file header
 * @param {Buffer} buffer - Complete .sid file contents
 * @returns {Object} Header fields, including the 1-based default subtune
 * @throws {Error} When the buffer is not a PSID/RSID file
 */
function parseSidHeader(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < MIN_HEADER_LENGTH) {
    throw new Error('Not a SID file - the header is too short to be PSID or RSID');
  }

  const magic = buffer.toString('latin1', OFFSET_MAGIC, OFFSET_MAGIC + 4);
  if (magic !== 'PSID' && magic !== 'RSID') {
    throw new Error('Not a SID file - expected a PSID or RSID header');
  }

  const version = buffer.readUInt16BE(OFFSET_VERSION);
  const songs = buffer.readUInt16BE(OFFSET_SONGS) || 1;
  const initAddress = buffer.readUInt16BE(OFFSET_INIT);
  const playAddress = buffer.readUInt16BE(OFFSET_PLAY);

  // startSong is 1-based in the file and can be out of range in the wild
  const rawStartSong = buffer.readUInt16BE(OFFSET_START_SONG);
  const startSong = Math.min(Math.max(rawStartSong || 1, 1), songs);

  // The flags word only exists from version 2 onwards
  const hasFlags = version >= 2 && buffer.length >= OFFSET_FLAGS + 2;
  const flags = hasFlags ? buffer.readUInt16BE(OFFSET_FLAGS) : 0;
  const needsBasic = Boolean(flags & 0x0002);

  const isRsid = magic === 'RSID';

  return {
    magic,
    version,
    isRsid,
    songs,
    startSong,
    dataOffset: buffer.readUInt16BE(OFFSET_DATA),
    initAddress,
    playAddress,
    needsBasic,
    // Only used to word a failure message - it is a hint, never a guarantee
    likelyNeedsRoms: isRsid || needsBasic || isRomAddress(initAddress) || isRomAddress(playAddress),
    title: readTextField(buffer, OFFSET_TITLE),
    author: readTextField(buffer, OFFSET_AUTHOR),
    released: readTextField(buffer, OFFSET_RELEASED),
  };
}

module.exports = {
  parseSidHeader,
  MIN_HEADER_LENGTH,
};
