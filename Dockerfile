# Stage 1: Build the React client app
FROM node:lts-alpine as client-builder

WORKDIR /usr/src/client
COPY client/package*.json ./
RUN npm ci --only=production
COPY client/ .
RUN npm run build

# Stage 2: Build the Node server
FROM node:lts-alpine

WORKDIR /usr/src/server
COPY server/package*.json ./
RUN npm ci --only=production
COPY server/ .
# Copy the built React app from the previous stage
COPY --from=client-builder /usr/src/client/build ./public

# Expose the port that the server is running on
EXPOSE 3000

# Specify the command to run the server
CMD ["node", "server.js"]