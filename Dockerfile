FROM node:20-slim

RUN apt-get update \
    && apt-get install -y chromium \
      fonts-ipafont-gothic fonts-wqy-zenhei fonts-thai-tlwg \
      fonts-kacst fonts-freefont-ttf libxss1 \
      --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /usr/src/app

COPY package*.json ./

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

RUN npm install --omit=dev

COPY . .

EXPOSE 8080

ENTRYPOINT ["node", "src/index.js"]
