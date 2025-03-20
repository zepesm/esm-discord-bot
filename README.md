# C64 Discord Bot

A Discord bot that allows users to upload Commodore 64 .prg files and generates playable emulator links. Files are stored in MinIO, an S3-compatible object storage.

## Features

- Automatically processes any .prg files uploaded to channels where the bot is present
- Accepts Commodore 64 `.prg` files as attachments
- Saves attached files to MinIO storage
- Generates a direct URL to the online C64 emulator with the file pre-loaded
- Responds with an inline clickable link in Discord
- Automatic file cleanup to manage storage space

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
5. Configure MinIO settings in the `.env` file
6. Start the server:
   ```
   npm start
   ```

## Environment Variables

The bot supports configuration through environment variables. You can set these variables in two ways:

1. **System Environment Variables**: Set directly in your system or in Docker.
2. **`.env` File**: Create a `.env` file in the project root.

System environment variables take precedence over those defined in the `.env` file. The bot will use the following default values if none are provided:

| Variable             | Description                              | Default Value             |
| -------------------- | ---------------------------------------- | ------------------------- |
| `DISCORD_TOKEN`      | Discord bot token                        | _(required)_              |
| `COMMAND_PREFIX`     | Command prefix for the bot               | `c64`                     |
| `PORT`               | HTTP server port                         | `3000`                    |
| `PUBLIC_HOST`        | Public URL of your server                | `http://localhost:<PORT>` |
| `MINIO_ENDPOINT`     | MinIO server hostname                    | `minio`                   |
| `MINIO_PORT`         | MinIO server port                        | `9000`                    |
| `MINIO_ACCESS_KEY`   | MinIO access key                         | `minioadmin`              |
| `MINIO_SECRET_KEY`   | MinIO secret key                         | `minioadmin`              |
| `MINIO_BUCKET`       | MinIO bucket name for files              | `c64files`                |
| `MINIO_USE_SSL`      | Whether to use SSL for MinIO             | `false`                   |
| `EMULATOR_OPEN_ROMS` | Whether to load default ROMs in emulator | `true`                    |
| `EMULATOR_BORDER`    | Whether to show border in emulator       | `false`                   |
| `EMULATOR_AUTOLOAD`  | Whether to autoload the program          | `true`                    |
| `EMULATOR_WIDE`      | Whether to use widescreen mode           | `false`                   |
| `MAX_FILES`          | Maximum number of files to keep          | `100`                     |
| `MAX_AGE_DAYS`       | Maximum age of files in days             | `7`                       |

## Discord Bot Setup

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Create a new application
3. Navigate to the "Bot" tab and create a bot
4. Enable "Message Content Intent" under Privileged Gateway Intents
5. Click "Reset Token" to generate a new token if needed
6. Copy the token and add it to your `.env` file
7. Use the OAuth2 URL Generator with `bot` scope and appropriate permissions to invite the bot to your server

### Verifying Your Discord Token

If you encounter issues with your Discord token, you can verify it using the included test scripts:

1. **Test the token in your .env file**:

   ```
   npm run test-token
   ```

2. **Verify a specific token**:
   ```
   npm run verify-token YOUR_DISCORD_TOKEN
   ```

If your token is invalid, you may need to reset it in the Discord Developer Portal:

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Select your application and navigate to the "Bot" tab
3. Click "Reset Token" to generate a new token
4. Copy the new token and update your `.env` file

#### Common Token Issues

- **Spaces or extra characters**: Make sure there are no spaces or extra characters when copying the token
- **Revoked token**: Tokens may be reset if they were compromised
- **Missing intents**: The bot requires the Message Content Intent to be enabled
- **Format**: Discord bot tokens are long strings that usually start with `OT`, `MT`, or `NT`

## Using an Existing MinIO Instance

To connect to an existing MinIO instance instead of creating a new one:

1. Update your `.env` file with the connection details for your existing MinIO server:

   ```
   MINIO_ENDPOINT=your-minio-server-hostname-or-ip
   MINIO_PORT=9000
   MINIO_ACCESS_KEY=your-access-key
   MINIO_SECRET_KEY=your-secret-key
   MINIO_BUCKET=c64files
   MINIO_USE_SSL=false  # Set to true if your MinIO server uses SSL
   ```

2. Test the connection to your MinIO server:
   ```
   npm run test-minio
   ```
3. Start the Discord bot:
   ```
   npm start
   ```

## Running with Docker Compose

The easiest way to run the bot is using Docker Compose:

```
docker-compose up -d
```

When connecting to an existing MinIO instance, update the environment variables in docker-compose.yml or provide them as system environment variables:

```
DISCORD_TOKEN=your_token MINIO_ENDPOINT=your-server docker-compose up -d
```

## Required Permissions

- Read Messages/View Channels
- Send Messages
- Attach Files
- Read Message History

## Usage

There are two ways to use the bot:

1. **Automatic Mode** (Recommended):

   - Simply upload a `.prg` file to any channel where the bot is present
   - The bot will automatically process the file and reply with an emulator link

2. **Manual Mode**:
   - Type `c64` in a Discord channel followed by your message
   - Attach a `.prg` file to your message
   - The bot will process the file and respond with an emulator link
   - Using this mode will also give you feedback about non-PRG files

The bot will save the file to MinIO storage and respond with a link to play it in the online C64 emulator.

## File Management

The bot includes automatic file management:

- Only keeps the latest 100 files
- Automatically deletes files older than 7 days
- You can adjust these settings using the `MAX_FILES` and `MAX_AGE_DAYS` environment variables

## Troubleshooting MinIO Connection

If you have issues connecting to your existing MinIO server:

1. Make sure the MinIO server is running and accessible from the machine running the bot
2. Check that the endpoint and port are correct in your `.env` file
3. Verify that the access key and secret key are valid
4. Ensure that the bot has network access to the MinIO server
5. Run the MinIO connection test: `npm run test-minio`
