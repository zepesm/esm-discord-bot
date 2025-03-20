const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const util = require('util');

const execPromise = util.promisify(exec);

// Helper function to get environment variables with fallbacks
const getEnv = (key, defaultValue = '') => process.env[key] || defaultValue;

/**
 * Service for generating screenshots from C64 PRG files using VICE emulator
 */
class ScreenshotService {
  /**
   * Capture a screenshot from a PRG file
   * @param {string} prgFilePath - Path to the PRG file
   * @param {Object} options - Screenshot options
   * @returns {Promise<string>} Path to the generated screenshot
   */
  async captureScreenshot(prgFilePath, options = {}) {
    // Get the screenshot delay from environment variable
    const defaultDelay = parseInt(getEnv('SCREENSHOT_DELAY', '2000'));

    const {
      delay = defaultDelay, // Delay in ms before taking screenshot
      outputDir = os.tmpdir(),
      width = 384,
      height = 272
    } = options;

    try {
      // Create unique output filename
      const timestamp = Date.now();
      const basename = path.basename(prgFilePath, '.prg');
      const screenshotPath = path.join(outputDir, `${basename}-${timestamp}.png`);

      // Build the Xvfb command
      const display = `:${Math.floor(Math.random() * 100) + 1}`;
      const xvfbCmd = `Xvfb ${display} -screen 0 1024x768x24 &`;
      
      // Run Xvfb
      await execPromise(xvfbCmd);
      
      // Build the x64 command (VICE emulator)
      const x64Cmd = `DISPLAY=${display} x64 -silent -autoload -autostart-warp -autostartprgmode 1 -VICIIborders 0 -VICIIfilter 0 -timeout 5 -exitscreenshotname "${screenshotPath}" "${prgFilePath}"`;
      
      console.log(`Capturing screenshot for ${basename} with delay ${delay}ms`);
      
      // Execute x64 command
      await execPromise(x64Cmd);
      
      // Wait for screenshot to be taken
      await new Promise(resolve => setTimeout(resolve, delay));
      
      // Kill the Xvfb display
      await execPromise(`pkill -f "Xvfb ${display}"`);
      
      // Check if screenshot exists
      if (fs.existsSync(screenshotPath)) {
        console.log(`Screenshot generated: ${screenshotPath}`);
        return screenshotPath;
      } else {
        throw new Error('Screenshot file was not created');
      }
    } catch (error) {
      console.error('Error capturing screenshot:', error);
      throw error;
    }
  }
}

module.exports = new ScreenshotService(); 