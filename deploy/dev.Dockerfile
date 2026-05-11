# Stage 1: Build/Install
FROM oven/bun:1.3.13-alpine AS builder

WORKDIR /app

# Copy package files
COPY package.json bun.lock ./

# Install dependencies
RUN bun install --frozen-lockfile

# Copy source code
COPY . .

# Build the application (bundle into a single file)
RUN bun build ./src/server.ts --outdir ./dist --target bun

# Stage 2: Run
FROM oven/bun:1.3.13-alpine

WORKDIR /app

# Copy the bundled output and public assets from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/src/public ./src/public

# Note: Bun's bundler usually includes all dependencies, but if you have 
# native modules or peer dependencies, you might still need node_modules.
# For this project, we'll include them to ensure maximum compatibility.
COPY --from=builder /app/node_modules ./node_modules

# Set environment variables
ENV NODE_ENV=development
ENV PORT=8000

# Expose port
EXPOSE 8000

# Run the application using the bundled output
CMD ["bun", "run", "./dist/server.js"]
