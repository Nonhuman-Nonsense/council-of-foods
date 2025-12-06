# Build from root folder
# docker build -t nonhumannonsense/council-of-foods:proto -f prototype/Dockerfile . --platform linux/amd64

# Install server dependencies
FROM node:lts-alpine

WORKDIR /usr/src/server
COPY server/package*.json ./
RUN npm ci --only=production
COPY server/ .

WORKDIR /usr/src

# Prompts from client
COPY client/src/prompts/ ./client/src/prompts

# Prototype frontend
COPY prototype/public/ ./prototype/public

# Expose the port that the server is running on
EXPOSE 3001

WORKDIR /usr/src/server
# Specify the command to run the server
CMD ["npm", "run", "proto"]
