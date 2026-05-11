FROM oven/bun:1.3.13-alpine

WORKDIR /app

# Copy package files
COPY package.json bun.lock ./

# Install dependencies
RUN bun install

# Copy source code
COPY . .

# Set environment variables
ENV NODE_ENV=local
ENV PORT=8000

# Expose port
EXPOSE 8000

# Run with hot-reload (using the dev script: bun --watch src/server.ts)
CMD ["bun", "run", "dev"]
