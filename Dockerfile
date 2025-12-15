# Stage 1: Build the React client app
FROM node:lts-alpine AS client-builder

WORKDIR /usr/src/client
COPY client/package*.json ./
RUN npm ci --only=production --no-audit
COPY client/ .
RUN npm run build

# Stage 2: Build the Node server
FROM node:lts-alpine AS server-builder

WORKDIR /usr/src/server
COPY server/package*.json ./
# Install ALL dependencies (including devDeps for tsc)
RUN npm ci
COPY server/ .
RUN npm run build

# Stage 3: Production Runner
FROM node:lts-alpine

WORKDIR /usr/src/server
COPY server/package*.json ./
# Install only production dependencies
RUN npm ci --only=production
# Copy built server code
COPY --from=server-builder /usr/src/server/dist ./dist
# Copy built client code
COPY --from=client-builder /usr/src/client/dist /usr/src/client/dist

# Expose the port
EXPOSE 3001

# Run the compiled server
CMD ["node", "dist/server.js"]
