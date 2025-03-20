# Discord Bot Handler System

This directory contains a modular message handler system for the C64 Discord bot. The system is designed to allow easy addition of new message handlers without modifying existing code.

## Architecture

- `base-handler.js` - Base class that all handlers must extend
- `handler-registry.js` - Registry that manages and executes all registered handlers
- `index.js` - Entry point that initializes and exports all handlers

## Existing Handlers

- `prg-file-handler.js` - Handles .prg file attachments and emulator setup
- `help-handler.js` - Provides help information when requested
- `ping-handler.js` - Simple ping/pong command for testing

## Creating a New Handler

1. Create a new file `your-handler.js`
2. Extend the BaseHandler class
3. Implement the `canHandle(message)` and `handle(message)` methods
4. Register your handler in `index.js`

## Example:

```javascript
const BaseHandler = require("./base-handler");

class MyCustomHandler extends BaseHandler {
  constructor() {
    super();
    this.setPriority(50); // Set priority (lower numbers run first)
  }

  canHandle(message) {
    // Return true if this handler should process the message
    return message.content.includes("custom keyword");
  }

  async handle(message) {
    // Process the message
    await message.reply("Hello from custom handler!");
  }
}

module.exports = MyCustomHandler;
```

Then update `index.js` to include your handler:

```javascript
const MyCustomHandler = require("./my-custom-handler");

// In the initializeHandlers function:
registry.register(new MyCustomHandler());

// Add to exports
module.exports = {
  // ... existing exports
  MyCustomHandler,
};
```

## Handler Priority

Handlers are executed in order of priority (lower numbers first). This allows you to control execution order when multiple handlers can process the same message.

Default priorities:

- PrgFileHandler: 10
- HelpHandler: 20
- PingHandler: 30
