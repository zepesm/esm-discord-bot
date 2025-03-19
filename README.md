# C64 Discord Bot

A Discord bot that allows users to upload Commodore 64 .prg files and generates playable emulator links.

## Features

- Listens for messages beginning with the command keyword `c64`
- Accepts Commodore 64 `.prg` files as attachments
- Saves attached files to the server
- Generates a direct URL to the online C64 emulator with the file pre-loaded
- Responds with an inline clickable link in Discord

## Setup

1. Clone this repository
2. Install dependencies:
   ```
   npm install
   ```
3. Create a `.env` file based on `.env.example`:
   ```
   cp .env.example .env
   ```
4. Add your Discord bot token to the `.env` file
5. Start the server:
   ```
   npm start
   ```

## Discord Bot Setup

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Create a new application
3. Navigate to the "Bot" tab and create a bot
4. Enable "Message Content Intent" under Privileged Gateway Intents
5. Copy the bot token and add it to your `.env` file
6. Use the OAuth2 URL Generator with `bot` scope and appropriate permissions to invite the bot to your server

## Required Permissions

- Read Messages/View Channels
- Send Messages
- Attach Files
- Read Message History

## Usage

1. Type `c64` in a Discord channel where the bot is present
2. Attach a `.prg` file to your message
3. The bot will save the file and respond with a link to play it in the online emulator
