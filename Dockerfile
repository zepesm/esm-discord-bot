FROM node:18-bullseye

# Install VICE emulator and dependencies
RUN apt-get update && apt-get install -y \
    vice \
    xvfb \
    x11-apps \
    imagemagick \
    procps \
    psmisc \
    libgl1-mesa-dri \
    libgl1-mesa-glx \
    libglu1-mesa \
    libpulse0 \
    && rm -rf /var/lib/apt/lists/*

# Verify the installations
RUN which x64 && which Xvfb

# Create app directory
WORKDIR /usr/src/app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install

# Copy app source
COPY . .

# Create directory for screenshots
RUN mkdir -p /tmp/screenshots && chmod 777 /tmp/screenshots

# Expose port for the HTTP server
EXPOSE 3000

# Start the bot
CMD ["npm", "start"] 