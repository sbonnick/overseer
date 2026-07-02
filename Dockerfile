FROM oven/bun:1
WORKDIR /app
COPY package.json tsconfig.json ./
COPY src/ src/
EXPOSE 8080
ENV PORT=8080
CMD ["bun", "src/main.ts"]
