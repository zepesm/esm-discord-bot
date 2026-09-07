/**
 * SID render worker.
 *
 * Runs on its own thread because libsidplayfp-wasm's render loop never yields:
 * renderSeconds is declared async but its inner `while` contains no await, so
 * calling it on the main thread would block the Discord gateway heartbeat for
 * the whole render. Both dependencies are ESM-only, which is the other reason
 * this file is .mjs.
 */
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { parentPort, workerData } from 'node:worker_threads';

import { SidAudioEngine } from 'libsidplayfp-wasm';
import lamejs from '@breezystack/lamejs';

// The pure maths lives in CommonJS so the test suite can reach it directly
const require = createRequire(import.meta.url);
const { applyFadeOut, deinterleave, peakAmplitude } = require('./sid-dsp.js');

// MPEG frame size the encoder expects per call
const MP3_BLOCK_SAMPLES = 1152;

// Smallest progress advance worth telling the parent about
const PROGRESS_STEP = 0.05;

// Below this peak the render is silence for our purposes, which is what a tune
// that needs the real C64 ROMs produces
const SILENCE_PEAK_THRESHOLD = 64;

/**
 * Load the optional C64 ROM images, if the operator configured any
 * @param {Object} roms - Paths keyed by rom name
 * @returns {Promise<Object>} Loaded images keyed the same way
 */
async function loadRoms(roms) {
  const loaded = {};
  for (const name of ['kernal', 'basic', 'chargen']) {
    if (!roms || !roms[name]) continue;
    loaded[name] = new Uint8Array(await readFile(roms[name]));
  }
  return loaded;
}

/**
 * Encode interleaved PCM to MP3
 * @param {Int16Array} pcm - Interleaved samples
 * @param {Object} options - Encoder settings
 * @returns {Buffer} Complete MP3 bitstream
 */
function encodeMp3(pcm, { channels, sampleRate, bitrate }) {
  const encoder = new lamejs.Mp3Encoder(channels, sampleRate, bitrate);
  const parts = [];

  const push = (chunk) => {
    // lamejs hands back a view into a buffer it reuses on the next call, so
    // this copy is load-bearing rather than defensive
    if (chunk && chunk.length) parts.push(Buffer.from(chunk));
  };

  if (channels === 2) {
    const { left, right } = deinterleave(pcm);
    for (let i = 0; i < left.length; i += MP3_BLOCK_SAMPLES) {
      push(encoder.encodeBuffer(
        left.subarray(i, i + MP3_BLOCK_SAMPLES),
        right.subarray(i, i + MP3_BLOCK_SAMPLES)
      ));
    }
  } else {
    for (let i = 0; i < pcm.length; i += MP3_BLOCK_SAMPLES) {
      push(encoder.encodeBuffer(pcm.subarray(i, i + MP3_BLOCK_SAMPLES)));
    }
  }

  push(encoder.flush());
  return Buffer.concat(parts);
}

async function render() {
  const { sid, startSong, seconds, fadeSeconds, bitrate, engine: sidEngine, roms } = workerData;
  const sidBytes = new Uint8Array(sid);
  const warnings = [];

  const engine = new SidAudioEngine({ engine: sidEngine });

  try {
    const romImages = await loadRoms(roms);
    if (romImages.kernal || romImages.basic || romImages.chargen) {
      await engine.setSystemROMs(romImages.kernal, romImages.basic, romImages.chargen);
      // A failed injection is only a console warning inside the library, so the
      // caller would otherwise mistake a built-in-ROM approximation for the real thing
      if (!engine.getRomStatus().active) warnings.push('rom-inactive');
    }

    // startSong is passed explicitly because loadSidBuffer patches the header's
    // own value to 1 whenever the argument is omitted, silently ignoring the
    // tune's default subtune
    await engine.loadSidBuffer(sidBytes, startSong);

    const info = engine.getTuneInfo();
    const sampleRate = engine.getSampleRate();
    const channels = engine.getChannels();

    // Report progress in coarse steps. The callback fires once per emulated
    // chunk, which is far too often to forward to Discord.
    const expectedSamples = seconds * sampleRate * channels;
    let lastReported = 0;
    const onProgress = (samplesWritten) => {
      const fraction = Math.min(samplesWritten / expectedSamples, 1);
      if (fraction - lastReported < PROGRESS_STEP) return;
      lastReported = fraction;
      parentPort.postMessage({ type: 'progress', phase: 'render', fraction });
    };

    const pcm = await engine.renderSeconds(seconds, undefined, onProgress);

    if (!pcm.length || peakAmplitude(pcm) < SILENCE_PEAK_THRESHOLD) {
      return { silent: true, warnings };
    }

    // The engine returns a short buffer when a tune stops early, so report what
    // was actually produced rather than what was asked for
    const renderedSeconds = Math.round(pcm.length / channels / sampleRate);
    if (renderedSeconds < seconds) warnings.push('truncated');

    applyFadeOut(pcm, { channels, sampleRate, fadeSeconds });

    // Encoding is the slower half and has no callback of its own, so the
    // parent is told the phase changed rather than being left at 100%
    parentPort.postMessage({ type: 'progress', phase: 'encode', fraction: 1 });
    const mp3 = encodeMp3(pcm, { channels, sampleRate, bitrate });

    return {
      silent: false,
      warnings,
      mp3,
      meta: {
        renderedSeconds,
        sampleRate,
        channels,
        bitrate,
        engine: await engine.getEngineName(),
        sidChips: info ? info.sidChips : 1,
        clock: info ? info.clock : null,
        format: info ? info.format : null,
      },
    };
  } finally {
    // The C++ context is not garbage collected
    engine.dispose();
  }
}

render().then(
  (result) => {
    // Deliberately not using a transfer list: Buffer.concat can return a view
    // into Node's shared pool for small results, and transferring that would
    // detach memory belonging to unrelated buffers. A structured clone of a few
    // megabytes is nothing next to a multi-second render.
    parentPort.postMessage({ type: 'done', result });
  },
  (error) => {
    parentPort.postMessage({
      type: 'error',
      message: error && error.message ? error.message : String(error),
    });
  }
);
