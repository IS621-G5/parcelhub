# Backend — Node 22 (required for built-in node:sqlite)
FROM node:22-alpine

WORKDIR /app

# Install deps first (better layer caching)
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy source
COPY src ./src

# SQLite file lives at /data/parcelhub.db (mount a volume for persistence)
ENV DB_PATH=/data/parcelhub.db
RUN mkdir -p /data

EXPOSE 3001

# node:sqlite is still experimental — flag silences the runtime warning
CMD ["node", "src/server.js"]
