/**
 * Single source of truth for the file extensions the bot understands.
 *
 * This knowledge used to be duplicated across the handlers, the MinIO listing,
 * the file server and the cleanup job, and the copies had already drifted apart:
 * listFiles only ever reported .prg, so .d64 uploads were invisible to the file
 * browser and, more importantly, to retention.
 */

// Loaded into the vc64web emulator
const EMULATOR_EXTENSIONS = ['.prg', '.d64'];

// Rendered to audio so they can be played back directly
const AUDIO_EXTENSIONS = ['.sid'];

// Everything the bot stores and is therefore responsible for cleaning up
const ALL_EXTENSIONS = [...EMULATOR_EXTENSIONS, ...AUDIO_EXTENSIONS];

/**
 * Check whether a filename carries one of the given extensions
 * @param {String} name - File name to test
 * @param {String[]} extensions - Extensions to accept, defaults to every known type
 * @returns {Boolean} True if the name ends with one of the extensions
 */
function hasExtension(name, extensions = ALL_EXTENSIONS) {
  const lower = String(name || '').toLowerCase();
  return extensions.some(extension => lower.endsWith(extension));
}

/**
 * Remove the -<epoch millis> suffix that uploads get, keeping the extension so
 * the three file types stay distinguishable in listings
 * @param {String} filename - Stored object name, e.g. "tune-1788759111614.sid"
 * @returns {String} Display name, e.g. "tune.sid"
 */
function stripTimestamp(filename) {
  // Anchored to the 13 digits of an epoch-millis stamp on purpose. A looser
  // \d+ would also eat legitimate version numbers, turning level-42.d64 into
  // level.d64 for a file that was never timestamped.
  const match = String(filename || '').match(/^(.*)-\d{13}(\.[^.]+)$/);
  return match ? `${match[1]}${match[2]}` : filename;
}

module.exports = {
  EMULATOR_EXTENSIONS,
  AUDIO_EXTENSIONS,
  ALL_EXTENSIONS,
  hasExtension,
  stripTimestamp,
};
