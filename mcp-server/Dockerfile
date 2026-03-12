FROM node:20-slim

WORKDIR /app

# Copy package files
COPY package.json ./
RUN npm install --production=false

# Copy source
COPY tsconfig.json ./
COPY src/ ./src/

# Build
RUN npx tsc

# Expose MCP server port
# Cloud Run sets PORT automatically; MCP_PORT is the local dev default.
# The application reads: process.env.PORT || process.env.MCP_PORT || "3100"
EXPOSE 3100

CMD ["node", "dist/index.js"]
