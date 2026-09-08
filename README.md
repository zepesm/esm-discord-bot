# C64 Discord Bot

A Discord bot for Commodore 64 files. Upload a `.prg` or `.d64` and it replies with a link that boots it in an online emulator; upload a `.sid` and it renders the tune to MP3 so it plays inline in Discord. Files are stored in MinIO, an S3-compatible object storage.

## Features

- Automatically processes any .prg, .d64 and .sid files uploaded to channels where the bot is present
- Accepts Commodore 64 `.prg`, `.d64` and `.sid` files as attachments
- Renders `.sid` music to MP3 and attaches it, so it plays inline in Discord
- Saves attached files to MinIO storage
- Generates a direct URL to the online C64 emulator with the file pre-loaded
- Responds with an inline clickable link in Discord
- Automatic file cleanup to manage storage space
- Modular architecture allowing easy addition of new bot actions and commands

## Requirements

Node 20 or newer. SID rendering runs libsidplayfp in WebAssembly on a worker
thread, which older versions cannot load, and the bot refuses to start below
that rather than failing later with an unrelated-looking error.

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
| `ALLOW_BOT_UPLOADS`  | Process files posted by other bots       | `true`                    |
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
| `MAX_DELETIONS_PER_RUN` | Most files one cleanup run may delete | `25`                      |
| `SID_ENABLED`        | Enable .sid rendering                    | `true`                    |
| `SID_RENDER_SECONDS` | Length of the rendered MP3               | `180`                     |
| `SID_FADE_SECONDS`   | Fade-out at the end of the render        | `5`                       |
| `SID_MP3_BITRATE`    | MP3 bitrate in kbps                      | `128`                     |
| `SID_ENGINE`         | `sidlite` (fast) or `residfp` (accurate) | `sidlite`                 |
| `SID_RENDER_TIMEOUT_MS` | Minimum per-tune render limit; scales up with the render length | `60000` |
| `SID_QUEUE_LIMIT`    | Queued renders before rejecting          | `8`                       |
| `SID_MAX_INPUT_BYTES` | Largest accepted .sid file              | `1048576`                 |
| `SID_MAX_MP3_BYTES`  | Largest MP3 the bot will attach          | `8388608`                 |
| `SID_MAX_FILES_PER_MESSAGE` | .sid attachments handled per message | `4`                  |
| `SID_KERNAL_ROM`     | Optional path to a KERNAL ROM image      | _(unset)_                 |
| `SID_BASIC_ROM`      | Optional path to a BASIC ROM image       | _(unset)_                 |
| `SID_CHARGEN_ROM`    | Optional path to a CHARGEN ROM image     | _(unset)_                 |

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

## Deployment

The bot ships as a container, and that is the only supported way to run it in
production. Pinning the runtime and installing from the committed lockfile is
deliberate: the bot previously broke on a host whose Node version differed from
the one it was developed against, and the failure surfaced as an unrelated
error from inside a dependency.

MinIO is not part of this - it stays external and is reached through the
`MINIO_*` variables.

### Docker Compose

```
docker-compose up -d
```

Environment variables come from the shell or a `.env` file beside the compose
file:

```
DISCORD_TOKEN=your_token MINIO_ENDPOINT=your-server docker-compose up -d
```

### Coolify

Point a new application at this repository and let it build from the
`Dockerfile`. Set every variable from the table above in Coolify's environment
settings - the image deliberately contains no `.env`.

The container exposes no port and needs no domain. Emulator and download links
point straight at MinIO, so the built-in HTTP server only serves the optional
file browser and nothing outside the container has to reach it.

Give it around 512 MB. A render holds the decoded PCM, its deinterleaved copies
and the WebAssembly heap at the same time, which peaks near 90 MB on top of the
idle footprint.

### Local development

```
npm install
npm start
```

## Required Permissions

- Read Messages/View Channels
- Send Messages
- Attach Files
- Read Message History
- Manage Messages - the bot deletes the original upload after replying, and
  deleting someone else's message requires it

## Usage

There are two ways to use the bot:

1. **Automatic Mode** (Recommended):

   - Simply upload a `.prg`, `.d64` or `.sid` file to any channel where the bot is present
   - For `.prg` and `.d64` the bot replies with an emulator link
   - For `.sid` the bot renders the tune to MP3 and attaches it, so Discord shows
     its audio player and you can listen without leaving the channel. The original
     `.sid` stays available behind a download button.
   - This also works for files posted by other bots, apps and webhooks, such as CI
     build reports. Those messages are never deleted - the bot only adds its reply
     underneath. Set `ALLOW_BOT_UPLOADS=false` to turn this off.

2. **Manual Mode**:
   - Type `c64` in a Discord channel followed by your message
   - Attach a `.prg`, `.d64` or `.sid` file to your message
   - Using this mode also tells you when a file is of a type the bot cannot use

Either way the original file is stored in MinIO and stays reachable from the reply.

## File Management

The bot includes automatic file management:

- Only keeps the latest 100 files, counting `.prg`, `.d64` and `.sid` together
- Automatically deletes files older than 7 days
- Adjust both with `MAX_FILES` and `MAX_AGE_DAYS`

A single run never deletes more than `MAX_DELETIONS_PER_RUN` files, oldest
first, and says so loudly when it has to defer the rest. Raising `MAX_FILES`
or widening the managed file types makes previously unmanaged objects eligible
for deletion at once, so **check the deployed values against the real object
count before such a change goes out** - deletion is not reversible and the
bucket has no versioning.

## Modular Architecture

The bot uses a modular architecture based on handlers, making it easy to add new functionality without modifying existing code:

### Key Components

- `BaseHandler`: An abstract class that all handlers must extend
- `HandlerRegistry`: A registry to manage all registered handlers
- Multiple specialized handlers for different types of interactions

### Included Handlers

- `PrgFileHandler`: Processes .prg and .d64 attachments and generates emulator links
- `SidFileHandler`: Renders .sid music to MP3 on a worker thread and attaches it
- `HelpHandler`: Provides help information when requested
- `PingHandler`: Simple ping-pong command for testing
- `ReactionHandler`: Responds to emoji reactions on messages carrying C64 files

### Creating Custom Handlers

To add new functionality to the bot, you can create custom handlers:

1. Create a new file in the `src/handlers` directory
2. Extend the `BaseHandler` class
3. Implement the required methods
4. Register your handler in `src/handlers/index.js`

See `src/handlers/README.md` for detailed documentation and examples.

## Contributing

`AGENTS.md` covers how to work in this repository - the architecture traps, the
test conventions, and the failure modes that have already reached production.
`backlog.md` records decisions deliberately deferred, with the measurements
behind them.

## Troubleshooting MinIO Connection

If you have issues connecting to your existing MinIO server:

1. Make sure the MinIO server is running and accessible from the machine running the bot
2. Check that the endpoint and port are correct in your `.env` file
3. Verify that the access key and secret key are valid
4. Ensure that the bot has network access to the MinIO server
5. Run the MinIO connection test: `npm run test-minio`
