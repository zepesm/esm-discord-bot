const { Client, GatewayIntentBits } = require('discord.js');

// Get token from command line argument
const token = process.argv[2];

if (!token) {
  console.error('\n❌ Error: No token provided!');
  console.error('Usage: node verify-token.js YOUR_DISCORD_TOKEN');
  process.exit(1);
}

console.log('\n====== DISCORD TOKEN VERIFIER ======');
console.log(`Verifying token: ${token.substring(0, 10)}...`);
console.log('\nAttempting to connect to Discord...');

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
  
  console.log('\nThis token is valid! You can use it in your .env file:');
  console.log(`DISCORD_TOKEN=${token}`);
  process.exit(0);
});

// Log in with the token
client.login(token).catch(error => {
  console.error('\n❌ ERROR! Failed to log in to Discord:');
  console.error(error);
  
  if (error.code === 'TokenInvalid') {
    console.error('\nThe token is invalid. Please check the following:');
    console.error('1. The token might be incorrect or malformed');
    console.error('2. You might have copied extra spaces or characters');
    console.error('3. The token might have been reset or revoked');
  }
  
  process.exit(1);
});

// Handle errors and set a timeout
process.on('unhandledRejection', error => {
  console.error('Unhandled promise rejection:', error);
  process.exit(1);
});

// Set a timeout to exit if not connected within 30 seconds
setTimeout(() => {
  console.error('\n❌ Timed out while trying to connect to Discord.');
  console.error('This could be due to network issues or an invalid token.');
  process.exit(1);
}, 30000); 