FROM node:22-slim

# git:opencode 项目根探测兜底;ca-certificates:拉 provider npm;curl/xz:装 typst
RUN apt-get update \
  && apt-get install -y --no-install-recommends git ca-certificates curl xz-utils \
  && rm -rf /var/lib/apt/lists/*

# opencode CLI(headless server 用)。版本与本地开发一致,避免行为漂移。
RUN npm install -g opencode-ai@1.14.51

# typst 引擎(PDF 工具用)。官方静态二进制,零依赖,跨机一致。
RUN curl -fsSL https://github.com/typst/typst/releases/download/v0.15.0/typst-x86_64-unknown-linux-musl.tar.xz \
    | tar -xJ -C /tmp \
  && mv /tmp/typst-x86_64-unknown-linux-musl/typst /usr/local/bin/typst \
  && rm -rf /tmp/typst-* \
  && typst --version

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY tsconfig.json ./
COPY src ./src
COPY public ./public
# 内置一份默认导师;docker-compose 会用 ./courses 绑定挂载覆盖它(支持热更新)
COPY courses ./courses
# PDF 工具集(typst 模板 + 中文字体 + mkpdf.sh)
COPY pdfkit ./pdfkit

ENV NODE_ENV=production
EXPOSE 3000
CMD ["npm", "start"]
