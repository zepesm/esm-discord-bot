# Debian rather than Alpine on purpose. The app has no native modules, so musl
# would buy only a smaller image while adding a second axis of "works on my
# machine" - and a runtime mismatch between development and production is
# exactly what this container exists to prevent.
FROM node:22-bookworm-slim

ENV NODE_ENV=production

WORKDIR /app

# Dependencies first, so this layer is reused until the lockfile actually
# changes. npm ci installs strictly from package-lock.json, which is what makes
# the deployed dependency tree identical to the tested one.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Only the application itself - tests, docs and deployment files stay out
COPY src ./src

# The image exposes no port. Emulator and download links point straight at
# MinIO, so the HTTP server only serves the optional file browser and nothing
# outside the container needs to reach it.

USER node

CMD ["node", "src/index.js"]
