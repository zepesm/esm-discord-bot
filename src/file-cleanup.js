const fs = require('fs');
const path = require('path');
const minioService = require('./minio-service');

// Helper function to get environment variables with fallbacks
const getEnv = (key, defaultValue = '') => process.env[key] || defaultValue;

// Configuration
const MAX_FILES = parseInt(getEnv('MAX_FILES', '100')); // Maximum number of files to keep
const MAX_AGE_DAYS = parseInt(getEnv('MAX_AGE_DAYS', '7')); // Files older than this many days will be deleted

// Main cleanup function
async function cleanupFiles() {
  try {
    // Get all files from MinIO
    const files = await minioService.listFiles();
    
    console.log(`Found ${files.length} .prg files in MinIO`);
    
    // Delete files that exceed the maximum count
    if (files.length > MAX_FILES) {
      console.log(`Cleaning up old files (keeping ${MAX_FILES} newest files)`);
      
      // Files are already sorted by lastModified (newest first) from the listFiles function
      for (let i = MAX_FILES; i < files.length; i++) {
        await minioService.deleteFile(files[i].filename);
        console.log(`Deleted ${files[i].filename} (exceeded max files limit)`);
      }
    }
    
    // Calculate cutoff date for age-based cleanup
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - MAX_AGE_DAYS);
    
    // Delete files older than the maximum age
    for (const file of files.slice(0, MAX_FILES)) {
      if (file.lastModified.getTime() < cutoffDate.getTime()) {
        await minioService.deleteFile(file.filename);
        console.log(`Deleted ${file.filename} (older than ${MAX_AGE_DAYS} days)`);
      }
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