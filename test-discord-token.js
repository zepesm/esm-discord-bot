require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');

// Helper function to get environment variables with fallbacks
const getEnv = (key, defaultValue = '') => process.env[key] || defaultValue;

// Get token from environment variables
const discordToken = getEnv('DISCORD_TOKEN', '');

console.log('\n====== DISCORD TOKEN TESTER ======');
console.log(`Token found: ${discordToken ? '✓ Yes' : '✗ No'}`);
if (discordToken) {
  console.log(`Token length: ${discordToken.length} characters`);
  console.log(`Token starts with: ${discordToken.substring(0, 10)}...`);
  console.log('\nAttempting to connect to Discord...');
} else {
  console.error('No Discord token found in environment variables or .env file!');
  process.exit(1);
}

// Create a minimal Discord client
const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

// Set up event listeners
client.once('ready', () => {
  console.log(`\n✅ SUCCESS! Bot logged in as ${client.user.tag}`);
  console.log(`Bot ID: ${client.user.id}`);
  console.log(`Connected to ${client.guilds.cache.size} servers`);
  
  if (client.guilds.cache.size > 0) {
    console.log('\nServers this bot is a member of:');
    client.guilds.cache.forEach(guild => {
      console.log(`- ${guild.name} (ID: ${guild.id})`);
    });
  }
  
  console.log('\nYour Discord token is valid! You can now use it in your bot.');
  process.exit(0);
});

// Log in with the token
client.login(discordToken).catch(error => {
  console.error('\n❌ ERROR! Failed to log in to Discord:');
  console.error(error);
  
  if (error.code === 'TokenInvalid') {
    console.error('\nPossible causes:');
    console.error('1. The token might be incorrect or malformed');
    console.error('2. You might have copied extra spaces or characters');
    console.error('3. The token might have been reset or revoked');
    console.error('\nNext steps:');
    console.error('1. Go to the Discord Developer Portal: https://discord.com/developers/applications');
    console.error('2. Select your application and go to the "Bot" tab');
    console.error('3. Click "Reset Token" to generate a new token');
    console.error('4. Copy the new token and update your .env file');
  }
  
  process.exit(1);
});

// Handle errors
process.on('unhandledRejection', error => {
  console.error('Unhandled promise rejection:', error);
  process.exit(1);
}); 