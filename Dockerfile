FROM node:20

WORKDIR /app

COPY package*.json ./
RUN npm install

# Copy specific directories/files
COPY src/ ./src/
COPY . .

EXPOSE 3000

CMD ["npm", "start"]