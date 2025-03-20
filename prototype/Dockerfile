# Build from root folder
# docker build -t nonhumannonsense/council-of-foods:proto -f prototype/Dockerfile .

# Install server dependencies
FROM node:lts-alpine

WORKDIR /usr/src/server
COPY server/package*.json ./
RUN npm ci --only=production
COPY server/ .

# Prototype frontend
WORKDIR /usr/src/prototype
COPY prototype/public/ ./public

# Expose the port that the server is running on
EXPOSE 3001

WORKDIR /usr/src/server
# Specify the command to run the server
CMD ["npm", "run", "proto"]
