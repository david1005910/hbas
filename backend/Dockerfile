FROM node:20-alpine

# FFmpeg 설치 (클립 병합용)
RUN apk add --no-cache ffmpeg openssl openssl-dev libc6-compat \
    fontconfig font-noto font-noto-cjk font-noto-hebrew \
 && fc-cache -fv

WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
# Prisma 클라이언트 생성 (스키마 변경 시 자동 반영)
RUN npx prisma generate

EXPOSE 4000
# 시작 시 Prisma 클라이언트 재생성 보장
CMD ["sh", "-c", "npx prisma generate && npm run dev"]
