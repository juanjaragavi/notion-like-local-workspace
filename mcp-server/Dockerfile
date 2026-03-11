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
EXPOSE 3100

ENV MCP_PORT=3100

CMD ["node", "dist/index.js"]
