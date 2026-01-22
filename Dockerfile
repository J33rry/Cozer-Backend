# 1. Use the official Node 20 slim image
FROM node:20-slim

# 2. Install Chromium and dependencies
# We install 'chromium' instead of 'google-chrome-stable'
# We also install fonts to support various languages
RUN apt-get update \
    && apt-get install -y wget gnupg \
    && apt-get install -y chromium fonts-ipafont-gothic fonts-wqy-zenhei fonts-thai-tlwg fonts-kacst fonts-freefont-ttf libxss1 \
      --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# 3. Set the working directory
WORKDIR /usr/src/app

# 4. Copy package files
COPY package*.json ./

# 5. Environment variables for Puppeteer
# Tell Puppeteer to skip downloading its own Chrome (we use the system Chromium)
# Point Executable Path to the installed Chromium binary
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# 6. Install Node dependencies
RUN npm install

# 7. Copy the rest of the app
COPY . .

# 8. Expose port
EXPOSE 8080

# 9. Start the app
CMD [ "npm", "start" ]