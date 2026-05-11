# Stage 1: Build/Install
FROM oven/bun:1.3.13-alpine AS builder

WORKDIR /app

# Copy package files
COPY package.json bun.lock ./

# Install dependencies
RUN bun install --frozen-lockfile

# Copy source code
COPY . .

# Stage 2: Run
FROM oven/bun:1.3.13-alpine

WORKDIR /app

# Copy necessary files from builder
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app ./

# Set environment variables
ENV NODE_ENV=development
ENV PORT=8000

# Expose port
EXPOSE 8000

# Run the application (no hot-reload)
CMD ["bun", "run", "start"]
