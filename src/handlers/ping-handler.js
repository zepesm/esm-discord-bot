const BaseHandler = require("./base-handler");

// Helper function to get environment variables with fallbacks
const getEnv = (key, defaultValue = "") => process.env[key] || defaultValue;

// Command prefix for bot
const COMMAND_PREFIX = getEnv("COMMAND_PREFIX", "c64");

/**
 * Simple ping-pong handler for testing and examples
 */
class PingHandler extends BaseHandler {
  constructor() {
    super();
    this.setPriority(30); // Lower priority than main functionality
    
    // Keywords that this handler responds to
    this.keywords = [
      `${COMMAND_PREFIX} ping`,
      `${COMMAND_PREFIX}-ping`,
      `ping ${COMMAND_PREFIX}`,
    ].map(k => k.toLowerCase());
  }

  /**
   * Check if this message contains ping command keywords
   * @param {Object} message - Discord message
   * @returns {Boolean} True if this handler should process the message
   */
  canHandle(message) {
    // Ignore messages from bots
    if (message.author.bot) return false;

    // Check if message content contains any of our keywords
    const content = message.content.toLowerCase();
    return this.keywords.some(keyword => content.includes(keyword));
  }

  /**
   * Respond to the ping command
   * @param {Object} message - Discord message
   */
  async handle(message) {
    const now = Date.now();
    const messageTime = message.createdTimestamp;
    const latency = now - messageTime;
    
    await message.reply({
      content: `🏓 Pong! Bot latency: ${latency}ms`,
      allowedMentions: { repliedUser: false }
    });
  }
}

module.exports = PingHandler; 