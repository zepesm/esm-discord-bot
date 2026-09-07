const fs = require("fs");
const path = require("path");
const https = require("https");
const { createWriteStream } = require("fs");
const os = require("os");
const { AttachmentBuilder, escapeMarkdown } = require("discord.js");
const minioService = require("../minio-service");
const BaseHandler = require("./base-handler");
const { AUDIO_EXTENSIONS, hasExtension } = require("../file-types");
const sidService = require("../sid-service");

// Helper function to get environment variables with fallbacks
const getEnv = (key, defaultValue = "") => process.env[key] || defaultValue;

// Command prefix for bot
const COMMAND_PREFIX = getEnv("COMMAND_PREFIX", "c64");

// Whether files posted by other bots / webhooks (e.g. CI build reports) are processed
const DISABLED_VALUES = new Set(["false", "0", "no", "off"]);
const ALLOW_BOT_UPLOADS = !DISABLED_VALUES.has(
  getEnv("ALLOW_BOT_UPLOADS", "true").trim().toLowerCase()
);

/**
 * Handler for SID music attachments.
 *
 * Renders the tune to MP3 so Discord shows its inline audio player, and keeps
 * the original .sid in MinIO behind a download button.
 */
class SidFileHandler extends BaseHandler {
  constructor() {
    super();
    this.setPriority(15); // After PrgFileHandler, before the command handlers
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
   * Check whether the message carries at least one .sid attachment
   * @param {Object} message - Discord message
   * @returns {Boolean} True if a SID file is attached
   */
  hasSupportedFiles(message) {
    return message.attachments.some(attachment =>
      hasExtension(attachment.name, AUDIO_EXTENSIONS)
    );
  }

  /**
   * Check if this message carries SID music to render
   * @param {Object} message - Discord message
   * @returns {Boolean} True if this handler should process the message
   */
  canHandle(message) {
    if (!sidService.SID_ENABLED) return false;

    // Never react to our own messages - guards against self-triggering loops
    if (message.author?.id && message.author.id === message.client?.user?.id) {
      return false;
    }

    if (this.isFromBot(message) && !ALLOW_BOT_UPLOADS) return false;

    // Unlike PrgFileHandler this handler never claims a bare prefix command.
    // The registry runs every matching handler, so claiming "c64 <text>" with
    // no SID attached would only duplicate PrgFileHandler's help reply.
    return this.hasSupportedFiles(message);
  }

  /**
   * Process every SID attachment on the message
   * @param {Object} message - Discord message
   */
  async handle(message) {
    const sidAttachments = [...message.attachments.values()].filter(attachment =>
      hasExtension(attachment.name, AUDIO_EXTENSIONS)
    );

    // One message must not be able to monopolise the render queue
    const accepted = sidAttachments.slice(0, sidService.MAX_FILES_PER_MESSAGE);
    const skipped = sidAttachments.length - accepted.length;

    const results = [];
    // Rendering is serialised downstream anyway, so there is nothing to gain
    // from starting these in parallel and it keeps the replies in file order
    for (const attachment of accepted) {
      results.push(await this.processAttachment(attachment, message));
    }

    if (skipped > 0) {
      await this.safeReply(message, {
        content: `Only rendered the first ${accepted.length} tunes - ${skipped} more were skipped.`,
      });
    }

    // Never clean up messages we do not own - a CI build report has to stay
    if (this.isFromBot(message)) return;

    // Only delete when this message was nothing but SID files and every one of
    // them worked. A mixed message still belongs to PrgFileHandler as well, so
    // neither handler removes it.
    const onlySidFiles = message.attachments.size === sidAttachments.length;
    if (!onlySidFiles || skipped > 0 || !results.every(Boolean)) return;

    try {
      await message.delete();
      console.log(`Deleted original message ID: ${message.id}`);
    } catch (deleteError) {
      console.error(`Failed to delete original message ID ${message.id}:`, deleteError);
    }
  }

  /**
   * Store one SID file and reply with a rendered MP3
   * @param {Object} attachment - Discord attachment object
   * @param {Object} message - Discord message object
   * @returns {Promise<Boolean>} True if the tune was rendered and posted
   */
  async processAttachment(attachment, message) {
    const { name, url } = attachment;
    let tempDir = null;

    try {
      const timestamp = Date.now();
      const ext = path.extname(name);
      const filename = `${path.basename(name, ext)}-${timestamp}${ext.toLowerCase()}`;

      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "c64bot-"));
      const tempFilePath = path.join(tempDir, filename);

      await this.downloadFile(url, tempFilePath);
      const sidBuffer = fs.readFileSync(tempFilePath);

      // Store the original first, so the download button works even when the
      // render is what fails
      const fileUrl = await minioService.uploadFile(tempFilePath, filename);

      const rendered = await sidService.renderSid(sidBuffer);

      if (rendered.silent) {
        await this.replySilent(message, name, rendered.header, fileUrl);
        console.log(`Rendered nothing for ${filename} - the tune produced silence`);
        return false;
      }

      await this.replyWithTune(message, name, rendered, fileUrl);
      console.log(`Rendered ${filename} to ${rendered.mp3.length} bytes of MP3`);
      return true;
    } catch (error) {
      console.error(`Error processing SID ${name}:`, error);
      await this.safeReply(message, {
        content: `Sorry, I couldn't handle ${name}. ${error.message}`,
      });
      return false;
    } finally {
      if (tempDir) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    }
  }

  /**
   * Build the embed shared by the success and silence replies
   * @param {Object} message - Discord message
   * @param {String} name - Original attachment name
   * @param {Object} header - Parsed SID header
   * @returns {Object} Discord embed
   */
  buildEmbed(message, name, header) {
    // Empty embed field values are rejected by the API, and SID info strings
    // are blank often enough that this fallback is required, not defensive
    const field = (label, value) => ({
      name: label,
      value: escapeMarkdown(String(value || "").trim() || "—"),
      inline: true,
    });

    let userText = message.content.trim();
    if (userText.toLowerCase().startsWith(COMMAND_PREFIX)) {
      userText = userText.substring(COMMAND_PREFIX.length).trim();
    }

    return {
      title: name,
      description: userText || "",
      color: 0x5865f2,
      author: {
        name: message.member ? message.member.displayName : message.author.username,
        icon_url: message.author.displayAvatarURL(),
      },
      fields: [
        field("Title", header.title),
        field("Author", header.author),
        field("Released", header.released),
        field("Subtune", `${header.startSong} / ${header.songs}`),
      ],
    };
  }

  /**
   * Reply with the rendered tune attached
   * @param {Object} message - Discord message
   * @param {String} name - Original attachment name
   * @param {Object} rendered - Result from the SID service
   * @param {String} fileUrl - Public URL of the stored .sid
   */
  async replyWithTune(message, name, rendered, fileUrl) {
    const { header, mp3, meta } = rendered;

    // Discord decides to show the audio player from the .mp3 extension
    const stem = path.basename(name, path.extname(name)).replace(/[^\w.-]+/g, "_").slice(0, 80);
    const audio = new AttachmentBuilder(mp3, {
      name: `${stem || "tune"}.mp3`,
      description: `${header.title || name} - ${meta.renderedSeconds}s SID render`,
    });

    const embed = this.buildEmbed(message, name, header);
    embed.footer = { text: `${meta.format} · ${meta.clock} · ${meta.sidChips}× SID · ${meta.engine}` };

    await this.safeReply(message, {
      embeds: [embed],
      files: [audio],
      components: [
        {
          type: 1,
          components: [
            { type: 2, style: 5, label: "Download .sid", url: fileUrl },
          ],
        },
      ],
    });
  }

  /**
   * Reply when the tune rendered as silence
   * @param {Object} message - Discord message
   * @param {String} name - Original attachment name
   * @param {Object} header - Parsed SID header
   * @param {String} fileUrl - Public URL of the stored .sid
   */
  async replySilent(message, name, header, fileUrl) {
    const reason = header.likelyNeedsRoms
      ? "It needs the original Commodore KERNAL/BASIC ROMs, which this bot doesn't ship."
      : "The tune produced no audio.";

    await this.safeReply(message, {
      content: `🔇 **${name}** rendered as silence. ${reason} The file is stored - grab it below and play it locally.`,
      embeds: [this.buildEmbed(message, name, header)],
      components: [
        {
          type: 1,
          components: [
            { type: 2, style: 5, label: "Download .sid", url: fileUrl },
          ],
        },
      ],
    });
  }

  /**
   * Reply without failing when the user deleted their message mid-render
   * @param {Object} message - Discord message
   * @param {Object} payload - Reply payload
   */
  async safeReply(message, payload) {
    try {
      await message.reply({
        allowedMentions: { repliedUser: false },
        // A render takes seconds, so the original going away is a real case
        failIfNotExists: false,
        ...payload,
      });
    } catch (error) {
      console.error(`Failed to reply in channel ${message.channelId}:`, error);
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

module.exports = SidFileHandler;
