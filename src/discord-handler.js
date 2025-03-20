const fs = require('fs');
const path = require('path');
const https = require('https');
const { createWriteStream } = require('fs');
const os = require('os');
const minioService = require('./minio-service');

// Helper function to get environment variables with fallbacks
const getEnv = (key, defaultValue = '') => process.env[key] || defaultValue;

// Command prefix for bot
const COMMAND_PREFIX = getEnv('COMMAND_PREFIX', 'c64');

// Handler for Discord messages
async function handleDiscordMessage(message) {
  // Ignore messages from bots
  if (message.author.bot) return;
  
  // Check if message starts with our command prefix
  if (!message.content.toLowerCase().startsWith(COMMAND_PREFIX)) return;
  
  // Check if there's an attachment
  if (message.attachments.size === 0) {
    await message.reply('Please attach a .prg file to your message.');
    return;
  }
  
  // Process each attachment
  const attachmentPromises = message.attachments.map(attachment => 
    processAttachment(attachment, message)
  );
  
  // Wait for all attachments to be processed
  await Promise.allSettled(attachmentPromises);
}

// Process a single attachment
async function processAttachment(attachment, message) {
  const { name, url } = attachment;
  
  // Check if this is a .prg file
  if (!name.toLowerCase().endsWith('.prg')) {
    await message.reply(`Skipping ${name} - only .prg files are supported.`);
    return;
  }
  
  try {
    // Generate a unique filename to prevent overwrites
    const timestamp = Date.now();
    const filename = `${path.basename(name, '.prg')}-${timestamp}.prg`;
    
    // Create a temporary directory for file download
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'c64bot-'));
    const tempFilePath = path.join(tempDir, filename);
    
    // Download the file to temp location
    await downloadFile(url, tempFilePath);
    
    // Upload the file to MinIO
    await minioService.uploadFile(tempFilePath, filename);
    
    // Get file URL
    const fileUrl = minioService.getFileUrl(filename);
    const emulatorUrl = `https://vc64web.github.io/#${fileUrl}`;
    
    // Reply to the user with the emulator link
    await message.reply({
      content: `Your C64 program is ready to play: ${emulatorUrl}`,
      allowedMentions: { repliedUser: false }
    });
    
    // Clean up temp file
    fs.unlinkSync(tempFilePath);
    fs.rmdirSync(tempDir);
    
    console.log(`Processed .prg file: ${filename} and stored in MinIO`);
  } catch (error) {
    console.error(`Error processing attachment ${name}:`, error);
    await message.reply(`Sorry, I couldn't process your file. Error: ${error.message}`);
  }
}

// Helper function to download a file from URL
function downloadFile(url, destination) {
  return new Promise((resolve, reject) => {
    const file = createWriteStream(destination);
    
    https.get(url, response => {
      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download file: ${response.statusCode}`));
        return;
      }
      
      response.pipe(file);
      
      file.on('finish', () => {
        file.close(resolve);
      });
    }).on('error', err => {
      fs.unlink(destination, () => {}); // Delete the file if there's an error
      reject(err);
    });
  });
}

module.exports = {
  handleDiscordMessage
}; 