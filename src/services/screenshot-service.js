const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const util = require('util');
const https = require('https');

const execPromise = util.promisify(exec);

// Helper function to get environment variables with fallbacks
const getEnv = (key, defaultValue = '') => process.env[key] || defaultValue;

/**
 * Service for generating screenshots from C64 PRG files using VICE emulator
 */
class ScreenshotService {
  constructor() {
    // URL for a default C64 screenshot to use if generation fails
    this.defaultScreenshotUrl = 'https://upload.wikimedia.org/wikipedia/commons/4/48/C64_startup_animiert.gif';
  }

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
      height = 272,
      timeout = 10000, // Overall timeout for the screenshot process
      useDefaultIfFailed = true // Whether to use a default screenshot if generation fails
    } = options;

    try {
      // Check if VICE is installed
      try {
        await execPromise('which x64 || command -v x64');
      } catch (error) {
        console.error('VICE emulator (x64) not found. Screenshots will be disabled.');
        if (useDefaultIfFailed) {
          return await this.getDefaultScreenshot(outputDir);
        }
        throw new Error('VICE emulator not installed');
      }

      // Check if Xvfb is installed
      try {
        await execPromise('which Xvfb || command -v Xvfb');
      } catch (error) {
        console.error('Xvfb not found. Screenshots will be disabled.');
        if (useDefaultIfFailed) {
          return await this.getDefaultScreenshot(outputDir);
        }
        throw new Error('Xvfb not installed');
      }

      // Create unique output filename
      const timestamp = Date.now();
      const basename = path.basename(prgFilePath, '.prg');
      const screenshotPath = path.join(outputDir, `${basename}-${timestamp}.png`);

      // Build the Xvfb command with a unique display number
      const displayNum = Math.floor(Math.random() * 100) + 100;
      const display = `:${displayNum}`;
      const xvfbCmd = `Xvfb ${display} -screen 0 1024x768x24`;
      
      // Start Xvfb in the background
      console.log(`Starting Xvfb on display ${display}`);
      const xvfbProcess = require('child_process').spawn('Xvfb', [display, '-screen', '0', '1024x768x24'], {
        detached: true,
        stdio: 'ignore'
      });
      
      // Give Xvfb time to start
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Create a timeout promise
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Screenshot generation timed out')), timeout);
      });

      try {
        // Build the x64 command (VICE emulator)
        console.log(`Capturing screenshot for ${basename} with delay ${delay}ms on display ${display}`);
        
        // Use Promise.race to implement timeout
        await Promise.race([
          execPromise(`DISPLAY=${display} x64 -silent -autoload -autostart-warp -autostartprgmode 1 -VICIIborders 0 -VICIIfilter 0 -exitscreenshotname "${screenshotPath}" "${prgFilePath}"`),
          timeoutPromise
        ]);
        
        // Wait for screenshot to be taken
        await new Promise(resolve => setTimeout(resolve, delay));
      } finally {
        // Always try to kill Xvfb
        try {
          // Kill the Xvfb process
          process.kill(-xvfbProcess.pid, 'SIGTERM');
        } catch (error) {
          console.error(`Error killing Xvfb process: ${error.message}`);
          // Try a more direct approach
          try {
            await execPromise(`pkill -f "Xvfb ${display}"`);
          } catch (pkillError) {
            console.error(`Error using pkill: ${pkillError.message}`);
          }
        }
      }
      
      // Check if screenshot exists
      if (fs.existsSync(screenshotPath)) {
        console.log(`Screenshot generated: ${screenshotPath}`);
        return screenshotPath;
      } else {
        console.error('Screenshot file was not created');
        if (useDefaultIfFailed) {
          return await this.getDefaultScreenshot(outputDir);
        }
        throw new Error('Screenshot file was not created');
      }
    } catch (error) {
      console.error('Error capturing screenshot:', error);
      if (useDefaultIfFailed) {
        return await this.getDefaultScreenshot(outputDir);
      }
      throw error;
    }
  }

  /**
   * Download a default C64 screenshot if generation fails
   * @param {string} outputDir - Directory to save the screenshot
   * @returns {Promise<string>} Path to the downloaded screenshot
   */
  async getDefaultScreenshot(outputDir = os.tmpdir()) {
    console.log('Using default C64 screenshot as fallback');
    const screenshotPath = path.join(outputDir, `default-c64-${Date.now()}.png`);
    
    // If we can't download the image, create a simple one
    try {
      return await this.downloadDefaultScreenshot(screenshotPath);
    } catch (error) {
      console.error(`Error downloading default screenshot: ${error.message}`);
      // Create a simple text file as PNG using Node
      return await this.createSimpleScreenshot(screenshotPath);
    }
  }

  /**
   * Download the default screenshot
   * @param {string} screenshotPath - Path to save the screenshot
   * @returns {Promise<string>} Path to the downloaded screenshot
   */
  async downloadDefaultScreenshot(screenshotPath) {
    return new Promise((resolve, reject) => {
      const file = fs.createWriteStream(screenshotPath);
      
      https.get(this.defaultScreenshotUrl, response => {
        if (response.statusCode !== 200) {
          reject(new Error(`Failed to download default screenshot: ${response.statusCode}`));
          return;
        }
        
        response.pipe(file);
        
        file.on('finish', () => {
          file.close(() => {
            console.log(`Default screenshot saved to ${screenshotPath}`);
            resolve(screenshotPath);
          });
        });
      }).on('error', err => {
        fs.unlink(screenshotPath, () => {});
        reject(err);
      });
    });
  }

  /**
   * Create a simple text-based screenshot
   * @param {string} screenshotPath - Path to save the screenshot
   * @returns {Promise<string>} Path to the created screenshot
   */
  async createSimpleScreenshot(screenshotPath) {
    try {
      // Create a simple blue background with C64 text using imagemagick if available
      try {
        await execPromise(`convert -size 320x200 xc:#0000AA -fill white -pointsize 20 -gravity center -annotate 0 "C64 READY." "${screenshotPath}"`);
        console.log(`Created simple C64 screenshot at ${screenshotPath}`);
        return screenshotPath;
      } catch (error) {
        // If imagemagick fails, create a blank file
        fs.writeFileSync(screenshotPath, Buffer.from([
          0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D, 
          0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 
          0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, 0xDE, 0x00, 0x00, 0x00, 
          0x0C, 0x49, 0x44, 0x41, 0x54, 0x08, 0xD7, 0x63, 0xF8, 0xCF, 0xC0, 0x00, 
          0x00, 0x03, 0x01, 0x01, 0x00, 0x18, 0xDD, 0x8D, 0xB0, 0x00, 0x00, 0x00, 
          0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82
        ]));
        console.log(`Created blank PNG screenshot at ${screenshotPath}`);
        return screenshotPath;
      }
    } catch (error) {
      console.error(`Failed to create simple screenshot: ${error.message}`);
      throw error;
    }
  }
}

module.exports = new ScreenshotService(); 