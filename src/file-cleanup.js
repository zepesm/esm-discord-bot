const fs = require('fs');
const path = require('path');

// Configuration
const MAX_FILES = 100; // Maximum number of files to keep
const MAX_AGE_DAYS = 7; // Files older than this many days will be deleted

// Main cleanup function
function cleanupFiles() {
  const prgDir = path.join(__dirname, '../public/prg');
  
  // Ensure directory exists
  if (!fs.existsSync(prgDir)) {
    console.log('PRG directory not found, skipping cleanup');
    return;
  }
  
  try {
    // Get all .prg files in the directory
    const files = fs.readdirSync(prgDir)
      .filter(file => file.endsWith('.prg') || file.endsWith('.PRG'))
      .map(filename => ({
        filename,
        path: path.join(prgDir, filename),
        stats: fs.statSync(path.join(prgDir, filename))
      }))
      .sort((a, b) => b.stats.mtime.getTime() - a.stats.mtime.getTime()); // Sort by modification time (newest first)
    
    console.log(`Found ${files.length} .prg files`);
    
    // Delete files that exceed the maximum count
    if (files.length > MAX_FILES) {
      console.log(`Cleaning up old files (keeping ${MAX_FILES} newest files)`);
      
      for (let i = MAX_FILES; i < files.length; i++) {
        fs.unlinkSync(files[i].path);
        console.log(`Deleted ${files[i].filename} (exceeded max files limit)`);
      }
    }
    
    // Calculate cutoff date for age-based cleanup
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - MAX_AGE_DAYS);
    
    // Delete files older than the maximum age
    for (const file of files.slice(0, MAX_FILES)) {
      if (file.stats.mtime.getTime() < cutoffDate.getTime()) {
        fs.unlinkSync(file.path);
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
  
  console.log('File cleanup scheduled to run daily');
}

module.exports = {
  cleanupFiles,
  scheduleCleanup
}; 