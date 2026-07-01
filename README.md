# 导师宿主 (calc-tutor-app)

把「一个文件夹 + 一份 CLAUDE.md 教学指令」变成网页聊天助教。基于 OpenCode(headless
server)驱动,模型走 DeepSeek(OpenAI 兼容)。多导师、可热更新、每用户隔离进度。

## 它怎么工作

- `courses/<导师名>/` 每个含 `CLAUDE.md`(或 `AGENTS.md`)的文件夹 = 一个导师。**热挂载**:
  往服务器 `courses/` 里 scp 一个新文件夹,立刻多一个导师,不用重建镜像、不用重启。
- 用户登录后可在导师间**切换**。切换 = 换目录重开一个 opencode;切走时**关掉旧进程**,
  同一用户任意时刻只有一个 opencode 在跑(省内存)。闲置 10 分钟自动关。
- 每个「用户 × 导师」有独立目录 `data/users/<用户>/<导师>/`(首次进入从 `courses/` 拷一份),
  各自的进度文件和会话历史互不干扰——就像在不同目录各开一个 opencode CLI。
- 助教靠 opencode 的文件读写工具真正 **读写那个目录**(读 skill-map/log、下课写回),
  所以跨 session 状态存得住。

## 本地跑

```bash
cp .env.example .env      # 然后在 Zed 里改 DEEPSEEK_API_KEY 等
npm install
npm start                 # http://localhost:3000
```

登录用 `.env` 里 `TUTOR_USERS` 的账号。右上角下拉切换导师。

> 需要本机装了 `opencode`(`opencode --version` 能出版本)。

## 加一个导师

在 `courses/` 下新建一个文件夹,里面放一个 `CLAUDE.md` 写清教学指令(可再放进度文件、题库等)。
刷新页面下拉里就会出现。服务器上同理:`scp -r 你的导师文件夹 服务器:.../calc-tutor-app/courses/`。

## 部署(服务器)

服务器需装 Docker + docker-compose。

```bash
# 1) 传代码上去,进目录,建 .env(填 DEEPSEEK_API_KEY / TUTOR_USERS / TUTOR_DOMAIN)
cp .env.example .env && vi .env
# 2) DNS:Cloudflare 加一条 A 记录 tutor.<域名> → 服务器公网 IP,【灰云】(不开代理)
# 3) 阿里云安全组放通 80 / 443
docker compose up -d --build
```

Caddy 会自动为 `TUTOR_DOMAIN` 申请 HTTPS 证书。

- `data/`(用户目录 + opencode 状态)在具名 volume `tutor-data` 里,换服务器只需迁这个 volume。
- `courses/` 是宿主目录绑定挂载,直接在服务器上增删导师文件夹即可。

## 接口契约(前端克隆时照这个接)

- `POST /api/login` `{username,password}` → set-cookie；错误 401
- `POST /api/logout`
- `GET  /api/me` → `{userId, current}`（未登录 401）
- `GET  /api/tutors` → `{tutors:[名字...], current}`
- `POST /api/chat` `{message, tutor}` → `text/event-stream`,每行 `data: {...}`:
  - `{type:"queue",position}` 排队中(前面几位)
  - `{type:"start"}` 开始
  - `{type:"delta",text}` 回复文本增量(逐块拼接)
  - `{type:"done"}` 结束
  - `{type:"error",message}` 出错

## 架构备忘

- `src/config.ts` 配置 + 生成注入给 opencode 的 provider 配置(DeepSeek)
- `src/tutors.ts` 导师发现 + 每用户×导师目录provision
- `src/opencode.ts` 每用户 opencode 进程管理(起/切/关/闲置)+ prompt 流式
- `src/auth.ts` 硬编码账号 + 签名 cookie
- `src/concurrency.ts` 信号量(cap=MAX_CONCURRENCY)
- `src/server.ts` Express:登录 / 导师 / SSE 聊天

provider 通过 `OPENCODE_CONFIG` 环境变量注入,所以导师文件夹本身不需要 opencode.json。
