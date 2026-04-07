FROM node:20-alpine

# FFmpeg 설치 (클립 병합용)
RUN apk add --no-cache ffmpeg openssl openssl-dev libc6-compat

WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npx prisma generate

EXPOSE 4000
CMD ["npm", "run", "dev"]
