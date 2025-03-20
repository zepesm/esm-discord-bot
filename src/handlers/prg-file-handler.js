const fs = require("fs");
const path = require("path");
const https = require("https");
const { createWriteStream } = require("fs");
const os = require("os");
const minioService = require("../minio-service");
const BaseHandler = require("./base-handler");

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

      // Reply to the user with the emulator link using an embed
      await message.reply({
        content: null, // No text content outside the embed
        embeds: [
          {
            title: `${name}`,
            description: ``,
            color: 0x5865F2, // Discord blue color
            thumbnail: {},
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

      // Clean up temp file
      fs.unlinkSync(tempFilePath);
      fs.rmdirSync(tempDir);

      console.log(`Processed .prg file: ${filename} and stored in MinIO`);
    } catch (error) {
      console.error(`Error processing attachment ${name}:`, error);
      await message.reply(
        `Sorry, I couldn't process your file. Error: ${error.message}`
      );
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