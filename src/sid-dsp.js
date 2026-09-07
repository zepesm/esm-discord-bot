/**
 * Pure audio maths for the SID render pipeline.
 *
 * Separated from the worker so it can be tested against synthetic PCM without
 * booting WebAssembly, and imported by the ESM worker through CommonJS interop.
 */

/**
 * Largest absolute sample in a buffer.
 * Used to tell a real render from silence, which is how a tune that needs the
 * C64 ROMs shows up - libsidplayfp initialises it but never advances it.
 * @param {Int16Array} pcm - Interleaved samples
 * @returns {Number} Peak absolute amplitude, 0 for pure silence
 */
function peakAmplitude(pcm) {
  let peak = 0;
  for (let i = 0; i < pcm.length; i++) {
    // Math.abs on -32768 stays in range as a Number, so no clamping needed here
    const value = Math.abs(pcm[i]);
    if (value > peak) peak = value;
  }
  return peak;
}

/**
 * Fade the tail to silence, in place.
 *
 * SID tunes loop forever, so a fixed-length render always stops mid-phrase. A
 * linear amplitude ramp is what trackers and DAWs use for a musical tail; a
 * squared curve would duck the last seconds to near-nothing, which is wrong for
 * a tune whose ending is often the point.
 *
 * @param {Int16Array} pcm - Interleaved samples, modified in place
 * @param {Object} options - Stream description
 * @param {Number} options.channels - Interleaved channel count
 * @param {Number} options.sampleRate - Samples per second per channel
 * @param {Number} options.fadeSeconds - Length of the fade
 * @returns {Int16Array} The same buffer, for chaining
 */
function applyFadeOut(pcm, { channels, sampleRate, fadeSeconds }) {
  if (!pcm.length || fadeSeconds <= 0) return pcm;

  // The engine can return a short buffer when a tune stops early, so the fade
  // is always measured against what actually came back
  const frames = Math.floor(pcm.length / channels);
  const fadeFrames = Math.min(Math.round(fadeSeconds * sampleRate), frames);
  if (fadeFrames <= 0) return pcm;

  const fadeStart = frames - fadeFrames;

  for (let frame = fadeStart; frame < frames; frame++) {
    const gain = (frames - 1 - frame) / fadeFrames;
    const base = frame * channels;
    for (let channel = 0; channel < channels; channel++) {
      pcm[base + channel] = Math.round(pcm[base + channel] * gain);
    }
  }

  return pcm;
}

/**
 * Split interleaved stereo into the two separate arrays the MP3 encoder wants.
 * @param {Int16Array} pcm - Interleaved LRLR samples
 * @returns {{left: Int16Array, right: Int16Array}} Per-channel samples
 */
function deinterleave(pcm) {
  const frames = Math.floor(pcm.length / 2);
  const left = new Int16Array(frames);
  const right = new Int16Array(frames);

  for (let frame = 0; frame < frames; frame++) {
    left[frame] = pcm[frame * 2];
    right[frame] = pcm[frame * 2 + 1];
  }

  return { left, right };
}

module.exports = {
  peakAmplitude,
  applyFadeOut,
  deinterleave,
};
