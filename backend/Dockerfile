FROM node:24-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts
COPY --chown=node:node . .
USER node
EXPOSE 4000
CMD ["node", "server.js"]
