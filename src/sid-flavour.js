/**
 * Scene-flavoured copy for the SID handler.
 *
 * Everything the bot says out loud while working on a tune lives here, so the
 * wording can be tweaked without touching the render pipeline. Kept separate
 * and pure so it is trivially testable.
 */

// Shown while a tune is being rendered
const LOADING = [
  'LOAD "$",8,1',
  'Spinning up the 1541...',
  'Warming up the 6581...',
  'Decrunching...',
  'Counting raster lines...',
  'Waiting for the vertical blank...',
  'Teaching the SID to sing...',
  'Charging the filter caps...',
  'Dusting off the breadbin...',
  'Three voices, one filter, no mercy.',
  'Asking the SID nicely...',
  'Winding the tape, hold tight...',
  'Letting the oscillators settle...',
  'Poking 54272 until it sings...',
  'Borrowing a few cycles from the border...',
  'Cueing up the tape counter...',
];

// Shown when a tune renders but produces no sound
const SILENCE = [
  'Not a peep out of it.',
  'Total silence on all three voices.',
  'Dead air.',
  'The SID stayed quiet.',
  'Nothing but the hum of the power supply.',
];

// Shown when something goes wrong on the way
const FAILURE = [
  'Guru meditation.',
  'The loader choked.',
  'Something went wrong on track 18.',
  'Crashed into the border.',
  'That one refused to load.',
  'SYS 64738.',
];

/**
 * Pick one line at random
 * @param {String[]} lines - Pool to choose from
 * @returns {String} One of the lines
 */
function pick(lines) {
  return lines[Math.floor(Math.random() * lines.length)];
}

/**
 * Draw a progress bar in a style that suits a C64 loader
 * @param {Number} fraction - Progress from 0 to 1
 * @param {Number} width - Number of cells
 * @returns {String} Bar with a trailing percentage
 */
function progressBar(fraction, width = 14) {
  const clamped = Math.min(Math.max(fraction, 0), 1);
  const filled = Math.round(clamped * width);
  return `\`${'█'.repeat(filled)}${'░'.repeat(width - filled)}\` ${Math.round(clamped * 100)}%`;
}

module.exports = {
  LOADING,
  SILENCE,
  FAILURE,
  pick,
  progressBar,
  loadingLine: () => pick(LOADING),
  silenceLine: () => pick(SILENCE),
  failureLine: () => pick(FAILURE),
};
