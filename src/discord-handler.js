const { initializeHandlers } = require('./handlers');

/**
 * Main entry point for handling Discord messages
 * Delegates to the appropriate registered handlers
 * @param {Object} message - Discord message object
 */
async function handleDiscordMessage(message) {
  // Initialize all handlers if not done already
  const registry = initializeHandlers();
  
  // Process the message through the handler registry
  await registry.processMessage(message);
}

module.exports = {
  handleDiscordMessage,
};
