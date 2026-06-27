FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 5000

# Compose buyrug'i bilan almashtiriladi (migratsiya + dev)
CMD ["npm", "run", "dev"]
