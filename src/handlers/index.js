/**
 * Handlers module - exports handler registry and initializes all handlers
 */
const registry = require('./handler-registry');
const PrgFileHandler = require('./prg-file-handler');
const HelpHandler = require('./help-handler');
const PingHandler = require('./ping-handler');

/**
 * Initialize all handlers and register them with the registry
 * @returns {Object} The handler registry instance
 */
function initializeHandlers() {
  if (registry.initialized) {
    return registry;
  }

  // Register all handlers
  registry.register(new PrgFileHandler());
  registry.register(new HelpHandler());
  registry.register(new PingHandler());
  
  // Mark as initialized
  registry.initialized = true;
  
  console.log(`✅ Initialized ${registry.getHandlers().length} message handlers`);
  
  return registry;
}

module.exports = {
  registry,
  initializeHandlers,
  // Export handler classes for easy access
  PrgFileHandler,
  HelpHandler,
  PingHandler
}; 