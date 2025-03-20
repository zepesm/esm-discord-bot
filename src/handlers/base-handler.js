/**
 * Base Handler Interface
 * All message handlers should extend this class
 */
class BaseHandler {
  constructor() {
    this.priority = 100; // Default priority (lower values run first)
  }

  /**
   * Determines if this handler can process the given message
   * @param {Object} message - Discord.js message object
   * @returns {Boolean} True if the handler can process this message
   */
  canHandle(message) {
    throw new Error("Method 'canHandle' must be implemented by subclass");
  }

  /**
   * Process the message
   * @param {Object} message - Discord.js message object
   * @returns {Promise<void>}
   */
  async handle(message) {
    throw new Error("Method 'handle' must be implemented by subclass");
  }

  /**
   * Get handler name (defaults to class name)
   * @returns {String} Handler name
   */
  getName() {
    return this.constructor.name;
  }

  /**
   * Get handler priority (lower values run first)
   * @returns {Number} Priority value
   */
  getPriority() {
    return this.priority;
  }

  /**
   * Set handler priority
   * @param {Number} priority - Priority value (lower values run first)
   */
  setPriority(priority) {
    this.priority = priority;
    return this;
  }
}

module.exports = BaseHandler; 