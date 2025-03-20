const fs = require("fs");
const path = require("path");
const https = require("https");
const { createWriteStream } = require("fs");
const os = require("os");
const minioService = require("../minio-service");
const BaseHandler = require("./base-handler");
const screenshotService = require("../services/screenshot-service");

// Helper function to get environment variables with fallbacks
const getEnv = (key, defaultValue = "") => process.env[key] || defaultValue;

// Command prefix for bot
const COMMAND_PREFIX = getEnv("COMMAND_PREFIX", "c64");

/**
 * Handler for PRG file attachments
 */
class PrgFileHandler extends BaseHandler {
  constructor() {
    super();
    this.setPriority(10); // Higher priority for main functionality
  }

  /**
   * Check if this message has PRG attachments or uses the command prefix
   * @param {Object} message - Discord message
   * @returns {Boolean} True if this handler should process the message
   */
  canHandle(message) {
    // Ignore messages from bots
    if (message.author.bot) return false;

    // Check if there's an attachment
    if (message.attachments.size === 0) {
      // Only handle messages with the command prefix
      return message.content.toLowerCase().startsWith(COMMAND_PREFIX);
    }

    // Check if any of the attachments are .prg files
    const hasPrgFiles = message.attachments.some(attachment => 
      attachment.name.toLowerCase().endsWith('.prg')
    );

    // Handle if there are PRG files or if the command prefix was used
    return hasPrgFiles || message.content.toLowerCase().startsWith(COMMAND_PREFIX);
  }

  /**
   * Process the message and its attachments
   * @param {Object} message - Discord message
   */
  async handle(message) {
    // If no attachments but command prefix was used, show help
    if (message.attachments.size === 0) {
      await message.reply("Please attach a .prg file to your message.");
      return;
    }

    // Process each attachment
    const attachmentPromises = message.attachments.map((attachment) =>
      this.processAttachment(attachment, message)
    );

    // Wait for all attachments to be processed
    await Promise.allSettled(attachmentPromises);
  }

  /**
   * Process a single attachment
   * @param {Object} attachment - Discord attachment object
   * @param {Object} message - Discord message object
   */
  async processAttachment(attachment, message) {
    const { name, url } = attachment;

    // Check if this is a .prg file
    if (!name.toLowerCase().endsWith(".prg")) {
      // Only notify about non-PRG files if the command prefix was used
      if (message.content.toLowerCase().startsWith(COMMAND_PREFIX)) {
        await message.reply(`Skipping ${name} - only .prg files are supported.`);
      }
      return;
    }

    try {
      // Let the user know we're processing their file
      const processingMessage = await message.reply(`Processing ${name}... generating screenshot and emulator link.`);
      
      // Generate a unique filename to prevent overwrites
      const timestamp = Date.now();
      const filename = `${path.basename(name, ".prg")}-${timestamp}.prg`;

      // Create a temporary directory for file download
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "c64bot-"));
      const tempFilePath = path.join(tempDir, filename);

      // Download the file to temp location
      await this.downloadFile(url, tempFilePath);

      // Upload the file to MinIO
      const fileUrl = await minioService.uploadFile(tempFilePath, filename);

      // Get emulator configuration from environment variables
      const emulatorConfig = minioService.getEmulatorConfig(fileUrl);

      // Create emulator URL with the JSON configuration
      const emulatorUrl = `https://vc64web.github.io/#${encodeURIComponent(JSON.stringify(emulatorConfig))}`;

      // Generate screenshot
      let screenshotUrl = null;
      try {
        // Capture screenshot using the headless emulator
        console.log(`Attempting to generate screenshot for ${name}...`);
        
        // Create a promise that times out after 15 seconds
        const screenshotPromise = screenshotService.captureScreenshot(tempFilePath);
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Screenshot generation timed out')), 15000)
        );
        
        // Race between the screenshot generation and the timeout
        const screenshotPath = await Promise.race([
          screenshotPromise,
          timeoutPromise
        ]);
        
        // Upload screenshot to MinIO
        const screenshotFilename = `${path.basename(name, ".prg")}-${timestamp}.png`;
        screenshotUrl = await minioService.uploadFile(screenshotPath, screenshotFilename, 'screenshots');
        
        console.log(`Screenshot generated and uploaded: ${screenshotUrl}`);
        
        // Clean up screenshot file
        try {
          fs.unlinkSync(screenshotPath);
        } catch (unlinkError) {
          console.error(`Error removing screenshot file: ${unlinkError.message}`);
        }
      } catch (screenshotError) {
        console.error(`Error generating screenshot for ${name}: ${screenshotError.message}`);
        // Continue without screenshot if there's an error
      }

      // Reply to the user with the emulator link using an embed
      try {
        await processingMessage.edit({
          content: null, // No text content outside the embed
          embeds: [
            {
              title: `${name}`,
              description: `${screenshotUrl ? '' : 'Screenshot generation failed. '}Click the button below to emulate!`,
              color: 0x5865F2, // Discord blue color
              thumbnail: screenshotUrl ? {
                url: screenshotUrl
              } : {},
              fields: [],
              footer: {
                text: "ESM Rulez"
              }
            }
          ],
          components: [
            {
              type: 1, // Action Row
              components: [
                {
                  type: 2, // Button
                  style: 5, // Link button
                  label: "Emulate!",
                  url: emulatorUrl
                }
              ]
            }
          ],
          allowedMentions: { repliedUser: false },
        });
      } catch (editError) {
        console.error(`Error updating message: ${editError.message}`);
        // If edit fails, try to send a new message
        await message.reply({
          content: `Here's your emulator link for ${name}!`,
          components: [
            {
              type: 1, // Action Row
              components: [
                {
                  type: 2, // Button
                  style: 5, // Link button
                  label: "Emulate!",
                  url: emulatorUrl
                }
              ]
            }
          ]
        });
      }

      // Clean up temp files
      try {
        fs.unlinkSync(tempFilePath);
        fs.rmdirSync(tempDir);
      } catch (cleanupError) {
        console.error(`Error cleaning up temp files: ${cleanupError.message}`);
      }

      console.log(`Processed .prg file: ${filename} and stored in MinIO`);
    } catch (error) {
      console.error(`Error processing attachment ${name}:`, error);
      // Try to update processing message or send a new one if that fails
      try {
        await processingMessage.edit(`Sorry, I couldn't process your file. Error: ${error.message}`);
      } catch (editError) {
        await message.reply(`Sorry, I couldn't process your file. Error: ${error.message}`);
      }
    }
  }

  /**
   * Helper function to download a file from URL
   * @param {String} url - URL to download from
   * @param {String} destination - Path to save the file
   * @returns {Promise} Resolves when download completes
   */
  downloadFile(url, destination) {
    return new Promise((resolve, reject) => {
      const file = createWriteStream(destination);

      https
        .get(url, (response) => {
          if (response.statusCode !== 200) {
            reject(new Error(`Failed to download file: ${response.statusCode}`));
            return;
          }

          response.pipe(file);

          file.on("finish", () => {
            file.close(resolve);
          });
        })
        .on("error", (err) => {
          fs.unlink(destination, () => {}); // Delete the file if there's an error
          reject(err);
        });
    });
  }
}

module.exports = PrgFileHandler; 