# Stage 1: Build the React client app
FROM node:lts-alpine AS client-builder

WORKDIR /usr/src/client
COPY client/package*.json ./
COPY client/react-audio-visualize-master ./react-audio-visualize-master
RUN npm ci --only=production --no-audit
COPY client/ .
RUN npm run build

# Stage 2: Build the Node server
FROM node:lts-alpine

WORKDIR /usr/src/server
COPY server/package*.json ./
RUN npm ci --only=production
COPY server/ .
# Copy the built React app from the previous stage
COPY --from=client-builder /usr/src/client/dist /usr/src/client/dist

# Expose the port that the server is running on
EXPOSE 3001

# Specify the command to run the server
CMD ["node", "server.js"]
