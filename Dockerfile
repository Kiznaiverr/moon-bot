# ---- Stage 1: install dependencies ----
# git is needed here only because @znan/wabot is a GitHub dependency
# (resolved as git+ssh in package-lock.json). It stays out of the final image.
FROM node:22.23.4-bookworm-slim AS deps

WORKDIR /app

RUN apt-get update && \
    apt-get install -y git ca-certificates && \
    rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./

# --ignore-scripts skips install scripts of all dependencies.
# The Baileys patch lives in the project's own "postinstall" script, so run it
# explicitly, then fail the build if the patch was not applied
# (the script only prints "skip" when its target string is not found).
RUN npm ci --omit=dev --ignore-scripts && \
    npm run postinstall && \
    grep -qF "getMediaType(normalizeMessageContent(message)||message)" \
      node_modules/@whiskeysockets/baileys/lib/Socket/messages-send.js

# ---- Stage 2: runtime ----
FROM node:22.23.4-bookworm-slim

WORKDIR /app

RUN apt-get update && \
    apt-get install -y \
    ffmpeg \
    imagemagick \
    webp && \
    apt-get upgrade -y && \
    rm -rf /var/lib/apt/lists/*

COPY --from=deps /app/node_modules ./node_modules
COPY . .

CMD ["node", "index.js", "--max-old-space-size=1024"]
