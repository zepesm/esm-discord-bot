const BaseHandler = require("./base-handler");
const { ALL_EXTENSIONS, hasExtension } = require("../file-types");

/**
 * Handler for emoji reactions
 * This is an example of handling a different type of Discord interaction
 * Note: This requires setting up a reaction event in index.js
 */
class ReactionHandler extends BaseHandler {
  constructor() {
    super();
    this.setPriority(40);
    
    // Reactions this handler responds to
    this.targetEmojis = ['🎮', '👾', '🕹️'];
  }

  /**
   * Check if this reaction can be handled
   * @param {Object} reaction - Discord reaction object
   * @param {Object} user - Discord user who reacted
   * @returns {Boolean} True if this handler should process the reaction
   */
  canHandleReaction(reaction, user) {
    // Ignore reactions from bots
    if (user.bot) return false;
    
    // Check if the emoji is one we're interested in
    const emojiName = reaction.emoji.name;
    return this.targetEmojis.includes(emojiName);
  }

  /**
   * Process the reaction
   * @param {Object} reaction - Discord reaction object
   * @param {Object} user - Discord user who reacted
   */
  async handleReaction(reaction, user) {
    // Fetch the message if needed to access its content
    if (reaction.partial) {
      try {
        await reaction.fetch();
      } catch (error) {
        console.error('Error fetching reaction:', error);
        return;
      }
    }
    
    // Get the message 
    const message = reaction.message;
    
    // Look for supported attachments in the message
    const supportedAttachments = message.attachments.filter(attachment =>
      hasExtension(attachment.name, ALL_EXTENSIONS)
    );

    if (supportedAttachments.size > 0) {
      // There are supported files in this message, let user know about the command
      await message.reply({
        content: `Hi <@${user.id}>, you can use the c64 command on these files!`,
        allowedMentions: { users: [user.id] }
      });
    } else {
      // Nothing the bot can work with
      await message.reply({
        content: `Hi <@${user.id}>, no C64 files found in this message. Upload a .prg, .d64 or .sid file to get started.`,
        allowedMentions: { users: [user.id] }
      });
    }
  }
  
  // Implement BaseHandler methods to satisfy the interface
  canHandle() {
    return false; // This handler doesn't handle messages directly
  }
  
  async handle() {
    // No-op for message handling
  }
}

module.exports = ReactionHandler; 