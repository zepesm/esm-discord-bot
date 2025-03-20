/**
 * Handler Registry
 * Manages registration and execution of message handlers
 */
class HandlerRegistry {
  constructor() {
    this.handlers = [];
    this.initialized = false;
  }

  /**
   * Register a new handler
   * @param {BaseHandler} handler - Handler instance to register
   * @returns {HandlerRegistry} This registry instance for chaining
   */
  register(handler) {
    this.handlers.push(handler);
    // Sort handlers by priority whenever a new one is added
    this.sortHandlers();
    return this;
  }

  /**
   * Unregister a handler by name or instance
   * @param {String|BaseHandler} handlerOrName - Handler instance or name to unregister
   * @returns {Boolean} True if handler was found and removed
   */
  unregister(handlerOrName) {
    const initialLength = this.handlers.length;
    const handlerName = typeof handlerOrName === 'string' 
      ? handlerOrName 
      : handlerOrName.getName();

    this.handlers = this.handlers.filter(
      handler => handler.getName() !== handlerName
    );

    return this.handlers.length < initialLength;
  }

  /**
   * Sort handlers by priority (lower values run first)
   */
  sortHandlers() {
    this.handlers.sort((a, b) => a.getPriority() - b.getPriority());
  }

  /**
   * Get all registered handlers
   * @returns {Array} List of registered handlers
   */
  getHandlers() {
    return [...this.handlers];
  }

  /**
   * Process a message with the appropriate handlers
   * @param {Object} message - Discord.js message object
   * @returns {Promise<Boolean>} True if at least one handler processed the message
   */
  async processMessage(message) {
    let handled = false;

    for (const handler of this.handlers) {
      try {
        if (handler.canHandle(message)) {
          await handler.handle(message);
          handled = true;
          // Don't break - allow multiple handlers to process the same message if needed
        }
      } catch (error) {
        console.error(`Error in handler ${handler.getName()}:`, error);
      }
    }

    return handled;
  }
}

// Create and export a singleton instance
const registry = new HandlerRegistry();
module.exports = registry; 