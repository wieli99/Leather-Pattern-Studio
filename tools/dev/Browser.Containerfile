FROM docker.io/library/node:22-bookworm
WORKDIR /app
COPY package.json package-lock.json /tmp/leather-browser-deps/
RUN cd /tmp/leather-browser-deps && npm ci --ignore-scripts && npx playwright install-deps chromium firefox webkit && rm -rf /tmp/leather-browser-deps /var/lib/apt/lists/*
