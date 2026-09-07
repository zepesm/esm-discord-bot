const path = require('path');
const { Worker } = require('worker_threads');
const { parseSidHeader } = require('./sid-header');

// Helper function to get environment variables with fallbacks
const getEnv = (key, defaultValue = '') => process.env[key] || defaultValue;

// Same falsy handling as ALLOW_BOT_UPLOADS, so operators get one convention
const DISABLED_VALUES = new Set(['false', '0', 'no', 'off']);
const readFlag = (key, fallback = 'true') =>
  !DISABLED_VALUES.has(getEnv(key, fallback).trim().toLowerCase());

const readInt = (key, fallback) => {
  const value = parseInt(getEnv(key, String(fallback)), 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
};

const SID_ENABLED = readFlag('SID_ENABLED');
const RENDER_SECONDS = readInt('SID_RENDER_SECONDS', 180);
const MP3_BITRATE = readInt('SID_MP3_BITRATE', 128);
const RENDER_TIMEOUT_MS = readInt('SID_RENDER_TIMEOUT_MS', 60000);
const QUEUE_LIMIT = readInt('SID_QUEUE_LIMIT', 8);
const MAX_INPUT_BYTES = readInt('SID_MAX_INPUT_BYTES', 1024 * 1024);
const MAX_MP3_BYTES = readInt('SID_MAX_MP3_BYTES', 8 * 1024 * 1024);
const MAX_FILES_PER_MESSAGE = readInt('SID_MAX_FILES_PER_MESSAGE', 4);
const SID_ENGINE = getEnv('SID_ENGINE', 'sidlite');

// A fade longer than half the render would swallow the tune
const FADE_SECONDS = Math.min(readInt('SID_FADE_SECONDS', 5), Math.floor(RENDER_SECONDS / 2));

const ROM_PATHS = {
  kernal: getEnv('SID_KERNAL_ROM'),
  basic: getEnv('SID_BASIC_ROM'),
  chargen: getEnv('SID_CHARGEN_ROM'),
};

const WORKER_PATH = path.join(__dirname, 'sid-render.worker.mjs');

/**
 * A failure with a message that is safe and useful to show in Discord
 */
class SidRenderError extends Error {
  constructor(message, { code = 'render-failed' } = {}) {
    super(message);
    this.name = 'SidRenderError';
    this.code = code;
  }
}

// Renders run one at a time. The work is CPU-bound on a small box, and running
// two at once only makes both slower while stealing scheduler time from the
// gateway thread.
let queue = Promise.resolve();
let queueDepth = 0;

/**
 * Run a task once every earlier task has finished
 * @param {Function} task - Async function to run
 * @returns {Promise} Result of the task
 */
function enqueue(task) {
  const run = queue.then(() => task());
  // Keep the chain alive regardless of how this job ends
  queue = run.then(() => {}, () => {});
  return run;
}

/**
 * Run one render on its own thread, with a hard time limit.
 * A wedged WebAssembly loop cannot be interrupted from the inside, so
 * terminate() is the only way to get the capacity back.
 * @param {Object} payload - Worker input
 * @returns {Promise<Object>} Worker result
 */
function runWorker(payload) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(WORKER_PATH, { workerData: payload });
    let settled = false;

    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      worker.terminate();
      fn(value);
    };

    const timer = setTimeout(() => {
      finish(reject, new SidRenderError(
        `rendering timed out after ${Math.round(RENDER_TIMEOUT_MS / 1000)}s`,
        { code: 'timeout' }
      ));
    }, RENDER_TIMEOUT_MS);

    worker.on('message', (message) => {
      if (message.ok) finish(resolve, message.result);
      else finish(reject, new SidRenderError(message.message));
    });

    worker.on('error', (error) => finish(reject, new SidRenderError(error.message)));

    worker.on('exit', (code) => {
      if (!settled) {
        finish(reject, new SidRenderError(`render worker stopped unexpectedly (exit ${code})`));
      }
    });
  });
}

/**
 * Render a SID tune to MP3.
 *
 * Cheap rejections - not a SID, too large - happen here on the main thread so
 * junk never occupies a queue slot.
 *
 * @param {Buffer} buffer - Complete .sid file
 * @param {Object} options - Overrides, mainly for tests
 * @returns {Promise<Object>} { header, mp3, meta, warnings, silent }
 */
async function renderSid(buffer, options = {}) {
  const seconds = options.seconds || RENDER_SECONDS;
  const fadeSeconds = options.fadeSeconds !== undefined ? options.fadeSeconds : FADE_SECONDS;

  if (buffer.length > MAX_INPUT_BYTES) {
    throw new SidRenderError(
      `the file is ${(buffer.length / 1024 / 1024).toFixed(1)} MB, which is far larger than any SID tune`,
      { code: 'too-large' }
    );
  }

  // Throws for anything that is not a PSID/RSID file, before a thread is spawned
  const header = parseSidHeader(buffer);

  if (queueDepth >= QUEUE_LIMIT) {
    throw new SidRenderError('too many tunes are rendering right now - try again in a minute', {
      code: 'busy',
    });
  }

  queueDepth++;
  let result;
  try {
    result = await enqueue(() => runWorker({
      // A copy, so the caller's buffer is never shared across threads
      sid: Uint8Array.from(buffer),
      // loadSidBuffer takes a 0-based index and overwrites the header otherwise
      startSong: header.startSong - 1,
      seconds,
      fadeSeconds,
      bitrate: options.bitrate || MP3_BITRATE,
      engine: options.engine || SID_ENGINE,
      roms: ROM_PATHS,
    }));
  } finally {
    queueDepth--;
  }

  if (result.silent) {
    return { header, silent: true, warnings: result.warnings, mp3: null, meta: null };
  }

  const mp3 = Buffer.from(result.mp3);
  if (mp3.length > MAX_MP3_BYTES) {
    throw new SidRenderError(
      `the render came out at ${(mp3.length / 1024 / 1024).toFixed(1)} MB, over the ` +
      `${(MAX_MP3_BYTES / 1024 / 1024).toFixed(0)} MB limit - lower SID_RENDER_SECONDS`,
      { code: 'output-too-large' }
    );
  }

  return { header, silent: false, warnings: result.warnings, mp3, meta: result.meta };
}

module.exports = {
  renderSid,
  parseSidHeader,
  SidRenderError,
  SID_ENABLED,
  RENDER_SECONDS,
  FADE_SECONDS,
  MAX_INPUT_BYTES,
  MAX_FILES_PER_MESSAGE,
};
