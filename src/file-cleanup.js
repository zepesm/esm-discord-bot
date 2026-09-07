const fs = require('fs');
const path = require('path');
const minioService = require('./minio-service');

// Helper function to get environment variables with fallbacks
const getEnv = (key, defaultValue = '') => process.env[key] || defaultValue;

// Configuration
const MAX_FILES = parseInt(getEnv('MAX_FILES', '100')); // Maximum number of files to keep
const MAX_AGE_DAYS = parseInt(getEnv('MAX_AGE_DAYS', '7')); // Files older than this many days will be deleted

/**
 * Both limits are used as slice bounds, and slice() treats NaN as 0 - so a
 * typo in either variable would select every file for deletion rather than
 * none. Refuse to run instead.
 * @param {String} name - Variable name, for the message
 * @param {Number} value - Parsed value
 * @returns {Boolean} True when the limit is usable
 */
function isUsableLimit(name, value) {
  if (Number.isFinite(value) && value > 0) return true;
  console.error(
    `❌ ${name} is not a positive number (got "${getEnv(name)}") - skipping cleanup entirely. ` +
    `Fix the value before files can be managed again.`
  );
  return false;
}

// Main cleanup function
async function cleanupFiles() {
  try {
    // A bad limit must never be interpreted as "delete everything"
    if (!isUsableLimit('MAX_FILES', MAX_FILES) || !isUsableLimit('MAX_AGE_DAYS', MAX_AGE_DAYS)) {
      return;
    }

    // Get all files from MinIO. Files are sorted newest first by listFiles.
    const files = await minioService.listFiles();

    console.log(`Found ${files.length} managed files in MinIO`);

    // Calculate cutoff date for age-based cleanup
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - MAX_AGE_DAYS);

    // Work out everything that would go BEFORE deleting anything, so a run that
    // is about to remove a lot of files says so first. Widening the set of
    // extensions listFiles reports makes previously invisible files eligible for
    // cleanup all at once, and that must never happen silently.
    const overLimit = files.slice(MAX_FILES);
    const tooOld = files
      .slice(0, MAX_FILES)
      .filter(file => file.lastModified.getTime() < cutoffDate.getTime());

    if (overLimit.length + tooOld.length > 0) {
      console.warn(
        `⚠️  Cleanup will delete ${overLimit.length + tooOld.length} file(s): ` +
        `${overLimit.length} over the MAX_FILES=${MAX_FILES} limit, ` +
        `${tooOld.length} older than MAX_AGE_DAYS=${MAX_AGE_DAYS} days.`
      );
      if (overLimit.length > 0) {
        console.warn(`   Oldest over the limit: ${overLimit[overLimit.length - 1].filename}`);
      }
    }

    // Delete files that exceed the maximum count
    for (const file of overLimit) {
      await minioService.deleteFile(file.filename);
      console.log(`Deleted ${file.filename} (exceeded max files limit)`);
    }

    // Delete files older than the maximum age
    for (const file of tooOld) {
      await minioService.deleteFile(file.filename);
      console.log(`Deleted ${file.filename} (older than ${MAX_AGE_DAYS} days)`);
    }

    console.log('File cleanup completed successfully');
  } catch (error) {
    console.error('Error during file cleanup:', error);
  }
}

// Schedule cleanup to run daily
function scheduleCleanup() {
  // Run once at startup
  cleanupFiles();
  
  // Schedule to run daily
  const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;
  setInterval(cleanupFiles, TWENTY_FOUR_HOURS);
  
  console.log(`File cleanup scheduled to run daily (MAX_FILES: ${MAX_FILES}, MAX_AGE_DAYS: ${MAX_AGE_DAYS})`);
}

module.exports = {
  cleanupFiles,
  scheduleCleanup
}; 