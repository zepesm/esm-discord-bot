FROM node:22

# Set the working directory
WORKDIR /app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of the application
COPY . .

# Start the bot
CMD ["npm", "start"]

# Simple health check to verify the process is running
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s \
  CMD pgrep -f "node" || exit 1
