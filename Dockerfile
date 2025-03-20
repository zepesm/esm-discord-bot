FROM node:18-bullseye

# Install VICE emulator and dependencies
RUN apt-get update && apt-get install -y \
    vice \
    xvfb \
    x11-apps \
    imagemagick \
    && rm -rf /var/lib/apt/lists/*

# Create app directory
WORKDIR /usr/src/app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install

# Copy app source
COPY . .

# Expose port for the HTTP server
EXPOSE 3000

# Start the bot
CMD ["npm", "start"] 