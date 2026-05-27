FROM node:20-alpine
ARG PORT=7000
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE ${PORT}
CMD ["node", "src/index.js"]
