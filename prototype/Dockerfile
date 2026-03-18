# Build from root folder
# docker build -t nonhumannonsense/council-of-foods:proto -f prototype/Dockerfile . --platform linux/amd64

# Stage 1: Build the Node server
FROM node:lts-alpine AS server-builder

WORKDIR /usr/src/server
COPY server/package*.json ./
# Install ALL dependencies (including devDeps for tsc)
RUN npm ci
COPY server/ .
COPY shared/ ../shared/
RUN npm run build

# Stage 2: Production Runner
FROM node:lts-alpine

WORKDIR /usr/src/server
COPY server/package*.json ./
# Install only production dependencies
RUN npm ci --only=production

# Copy built server code
COPY --from=server-builder /usr/src/server/dist ./dist

# Prototype frontend (Static files, no build needed)
WORKDIR /usr/src
COPY prototype/public/ ./prototype/public

# Prompts from client (JSON files)
COPY client/src/prompts/ ./client/src/prompts

WORKDIR /usr/src/server

# Expose the port
EXPOSE 3001

# Set environment to prototype
ENV NODE_ENV=prototype

# Run the compiled server
CMD ["node", "dist/server/server.js"]
