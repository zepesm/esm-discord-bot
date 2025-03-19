require('dotenv').config();
const fs = require('fs');
const path = require('path');
const express = require('express');
const { Client, GatewayIntentBits, Events } = require('discord.js');
const { handleDiscordMessage } = require('./discord-handler');
const { setupFileServer } = require('./file-server');
const { scheduleCleanup } = require('./file-cleanup');

// Initialize Discord client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ]
});

// Express app for serving files
const app = express();

// Set up file server
setupFileServer(app);

// Schedule file cleanup
scheduleCleanup();

// Discord bot event handling
client.once(Events.ClientReady, (readyClient) => {
  console.log(`Discord bot ready! Logged in as ${readyClient.user.tag}`);
});

client.on(Events.MessageCreate, async (message) => {
  await handleDiscordMessage(message);
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`File server accessible at ${process.env.HOST || `http://localhost:${PORT}`}`);
  
  // Only attempt to login if we have a token
  if (process.env.DISCORD_TOKEN) {
    client.login(process.env.DISCORD_TOKEN)
      .catch(error => {
        console.error('Failed to log in to Discord:', error);
        process.exit(1);
      });
  } else {
    console.error('No Discord token provided. Set DISCORD_TOKEN in .env file.');
    process.exit(1);
  }
}); 