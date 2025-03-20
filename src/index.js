require('dotenv').config();
const fs = require('fs');
const path = require('path');
const express = require('express');
const { Client, GatewayIntentBits, Events } = require('discord.js');
const { handleDiscordMessage } = require('./discord-handler');
const { setupFileServer } = require('./file-server');
const { scheduleCleanup } = require('./file-cleanup');
const { initializeBucket, testConnection } = require('./minio-service');

// Load environment variables with fallbacks
const getEnv = (key, defaultValue = '') => process.env[key] || defaultValue;

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

// Log environment configuration (without sensitive data)
console.log('\nEnvironment Configuration:');
console.log(`- PORT: ${getEnv('PORT', '3000')}`);
console.log(`- PUBLIC_HOST: ${getEnv('PUBLIC_HOST', 'http://localhost:' + getEnv('PORT', '3000'))}`);
console.log(`- MINIO_ENDPOINT: ${getEnv('MINIO_ENDPOINT', 'minio')}`);
console.log(`- MINIO_PORT: ${getEnv('MINIO_PORT', '9000')}`);
console.log(`- MINIO_BUCKET: ${getEnv('MINIO_BUCKET', 'c64files')}`);
console.log(`- MINIO_USE_SSL: ${getEnv('MINIO_USE_SSL', 'false')}`);
console.log('- DISCORD_TOKEN: ' + (getEnv('DISCORD_TOKEN') ? '✓ Set' : '✗ Missing'));
console.log('- MINIO_ACCESS_KEY: ' + (getEnv('MINIO_ACCESS_KEY') ? '✓ Set' : '✗ Missing'));
console.log('- MINIO_SECRET_KEY: ' + (getEnv('MINIO_SECRET_KEY') ? '✓ Set' : '✗ Missing'));

// Start the application
async function startApp() {
  try {
    console.log('\nStarting C64 Discord Bot with MinIO storage...');
    
    // Check for required environment variables
    const missingVars = [];
    
    if (!getEnv('DISCORD_TOKEN')) missingVars.push('DISCORD_TOKEN');
    if (!getEnv('MINIO_ACCESS_KEY')) missingVars.push('MINIO_ACCESS_KEY');
    if (!getEnv('MINIO_SECRET_KEY')) missingVars.push('MINIO_SECRET_KEY');
    
    if (missingVars.length > 0) {
      console.error(`\n❌ Missing required environment variables: ${missingVars.join(', ')}`);
      console.error('Please set these in your .env file or system environment variables.');
      process.exit(1);
    }
    
    // Test MinIO connection first
    const connected = await testConnection();
    if (!connected) {
      console.error('\n❌ Cannot connect to MinIO server. Please check your configuration in .env file or system environment variables.');
      console.error('Make sure your existing MinIO server is accessible at the specified endpoint and port.');
      process.exit(1);
    }
    
    // Initialize MinIO bucket
    await initializeBucket();
    console.log('✅ MinIO bucket initialized successfully');
    
    // Set up file server
    await setupFileServer(app);
    console.log('✅ File server set up successfully');
    
    // Schedule file cleanup
    scheduleCleanup();
    console.log('✅ File cleanup scheduled');
    
    // Start the server
    const PORT = getEnv('PORT', '3000');
    app.listen(PORT, () => {
      console.log(`\n✅ Server running on port ${PORT}`);
      console.log(`✅ File server accessible at ${getEnv('PUBLIC_HOST', `http://localhost:${PORT}`)}`);
      
      // Get Discord token
      const discordToken = getEnv('DISCORD_TOKEN');
      
      // Attempt to login with Discord token
      client.login(discordToken)
        .catch(error => {
          console.error('\n❌ Failed to log in to Discord:', error);
          process.exit(1);
        });
    });
  } catch (error) {
    console.error('\n❌ Error starting application:', error);
    console.error('Please check your MinIO configuration in .env file or system environment variables.');
    process.exit(1);
  }
}

// Discord bot event handling
client.once(Events.ClientReady, (readyClient) => {
  console.log(`\n✅ Discord bot ready! Logged in as ${readyClient.user.tag}`);
});

client.on(Events.MessageCreate, async (message) => {
  await handleDiscordMessage(message);
});

// Start the application
startApp(); 