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

// Whether files posted by other bots / webhooks (e.g. CI build reports) are processed
const ALLOW_BOT_UPLOADS = getEnv("ALLOW_BOT_UPLOADS", "true") !== "false";

/**
 * Handler for PRG file attachments
 */
class PrgFileHandler extends BaseHandler {
  constructor() {
    super();
    this.setPriority(10); // Higher priority for main functionality
  }

  /**
   * Check whether the message was posted by a bot, an application or a webhook
   * @param {Object} message - Discord message
   * @returns {Boolean} True if the message did not come from a human
   */
  isFromBot(message) {
    return Boolean(message.author?.bot || message.webhookId);
  }

  /**
   * Check whether the message carries at least one .prg or .d64 attachment
   * @param {Object} message - Discord message
   * @returns {Boolean} True if a supported file is attached
   */
  hasSupportedFiles(message) {
    return message.attachments.some(attachment => {
      const lowerName = (attachment.name || '').toLowerCase();
      return lowerName.endsWith('.prg') || lowerName.endsWith('.d64');
    });
  }

  /**
   * Check if this message has PRG attachments or uses the command prefix
   * @param {Object} message - Discord message
   * @returns {Boolean} True if this handler should process the message
   */
  canHandle(message) {
    // Never react to our own messages - guards against self-triggering loops
    if (message.author?.id && message.author.id === message.client?.user?.id) {
      return false;
    }

    // Other bots and webhooks (CI build reports) only trigger through
    // attachments - they never issue prefix commands
    if (this.isFromBot(message)) {
      return ALLOW_BOT_UPLOADS && this.hasSupportedFiles(message);
    }

    const usedPrefix = message.content.toLowerCase().startsWith(COMMAND_PREFIX);

    if (message.attachments.size === 0) {
      // Only handle messages with the command prefix
      return usedPrefix;
    }

    // Handle if there are supported files or if the command prefix was used
    return this.hasSupportedFiles(message) || usedPrefix;
  }

  /**
   * Process the message and its attachments
   * @param {Object} message - Discord message
   */
  async handle(message) {
    // If no attachments but command prefix was used, show help
    if (message.attachments.size === 0) {
      await message.reply("Please attach a .prg or .d64 file to your message.");
      return;
    }

    // Process each attachment
    const results = await Promise.allSettled(
      message.attachments.map((attachment) =>
        this.processAttachment(attachment, message)
      )
    );

    // Never clean up messages we do not own - a CI build report has to stay
    // in the channel with its author, commit message and embeds intact
    if (this.isFromBot(message)) return;

    // Only delete the original once every attachment produced a link, so a
    // failed upload never silently swallows the user's file
    const allProcessed = results.every(
      (result) => result.status === "fulfilled" && result.value === true
    );
    if (!allProcessed) return;

    try {
      await message.delete();
      console.log(`Deleted original message ID: ${message.id}`);
    } catch (deleteError) {
      console.error(`Failed to delete original message ID ${message.id}:`, deleteError);
      // Optionally notify the channel or admin if deletion fails frequently
    }
  }

  /**
   * Process a single attachment
   * @param {Object} attachment - Discord attachment object
   * @param {Object} message - Discord message object
   * @returns {Promise<Boolean>} True if the attachment produced an emulator link
   */
  async processAttachment(attachment, message) {
    const { name, url } = attachment;

    // Check if this is a .prg or .d64 file
    const lowerName = name.toLowerCase();
    const isPrg = lowerName.endsWith(".prg");
    const isD64 = lowerName.endsWith(".d64");
    if (!isPrg && !isD64) {
      // Only notify about non-supported files if the command prefix was used
      if (!this.isFromBot(message) && message.content.toLowerCase().startsWith(COMMAND_PREFIX)) {
        await message.reply(`Skipping ${name} - only .prg or .d64 files are supported.`);
      }
      return false;
    }

    try {
      // Generate a unique filename to prevent overwrites
      const timestamp = Date.now();
      const ext = isPrg ? ".prg" : ".d64";
      const filename = `${path.basename(name, ext)}-${timestamp}${ext}`;

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

      // Get user's message content, removing the command prefix if present
      let userText = message.content.trim();
      if (userText.toLowerCase().startsWith(COMMAND_PREFIX)) {
        userText = userText.substring(COMMAND_PREFIX.length).trim();
      }

      // Construct the description for the embed
      const description = `${userText ? userText + '\n\n' : ''}`;

      // Get author details
      const authorName = message.member ? message.member.displayName : message.author.username;
      const authorIconURL = message.author.displayAvatarURL();

      // Reply to the user with the emulator link using an embed
      await message.reply({
        content: null, // No text content outside the embed
        embeds: [
          {
            title: `${name}`,
            description: description, // Use the constructed description
            color: 0x5865F2, // Discord blue color
            author: {
              name: authorName,
              icon_url: authorIconURL
            },
            thumbnail: {},
            fields: [],
            footer: {}
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
              },
              {
                type: 2, // Button
                style: 5, // Link button
                label: "Download",
                url: fileUrl // Use the MinIO file URL
              }
            ]
          }
        ],
        allowedMentions: { repliedUser: false },
      });

      // Clean up temp file
      fs.unlinkSync(tempFilePath);
      fs.rmdirSync(tempDir);

      console.log(`Processed file: ${filename} and stored in MinIO`);
      return true;
    } catch (error) {
      console.error(`Error processing attachment ${name}:`, error);
      await message.reply(
        `Sorry, I couldn't process your file. Error: ${error.message}`
      );
      return false;
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