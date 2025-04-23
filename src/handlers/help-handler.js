const BaseHandler = require("./base-handler");

// Helper function to get environment variables with fallbacks
const getEnv = (key, defaultValue = "") => process.env[key] || defaultValue;

// Command prefix for bot
const COMMAND_PREFIX = getEnv("COMMAND_PREFIX", "c64");

/**
 * Handler for help and information commands
 */
class HelpHandler extends BaseHandler {
  constructor() {
    super();
    this.setPriority(20); // Lower priority than main functionality
    
    // Keywords that this handler responds to
    this.keywords = [
      `${COMMAND_PREFIX} help`,
      `${COMMAND_PREFIX}-help`,
      `help ${COMMAND_PREFIX}`,
      `${COMMAND_PREFIX} info`,
      `${COMMAND_PREFIX}-info`,
    ].map(k => k.toLowerCase());
  }

  /**
   * Check if this message contains help command keywords
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
   * Process the help message request
   * @param {Object} message - Discord message
   */
  async handle(message) {
    const embed = {
      title: "eSm Bot Help",
      description: "I'm here to rule the demoscene.",
      color: 0x5865F2, // Discord blue color
      fields: [
        {
          name: "Usage",
          value: `Upload a .prg/.d64 file - i'll take care of the rest.`
        },
        {
          name: "Commands",
          value: [
            `\`${COMMAND_PREFIX} help\` - Show this help message`
          ].join('\n')
        }
      ],
      footer: {
        text: "ESM Rulez"
      }
    };

    await message.reply({ embeds: [embed], allowedMentions: { repliedUser: false } });
  }
}

module.exports = HelpHandler; 