import express from "express";
import path from "node:path";
import { config, ROOT } from "./config.js";
import {
  checkLogin,
  verifyPasswordFor,
  setSession,
  clearSession,
  getUserId,
  requireAuth,
  googleUserIdFor,
  makeOAuthState,
  verifyOAuthState,
} from "./auth.js";
import {
  runPrompt,
  listConversations,
  createConversation,
  renameConversation,
  setPinned,
  deleteConversation,
  abortConversation,
  forkConversation,
  getMessages,
  truncateFrom,
  shutdownAll,
  type FilePart,
} from "./opencode.js";
import { listTutors, isValidTutor, userTutorDir } from "./tutors.js";
import { smsEnabled, phoneUserIdFor, sendSmsCode, checkSmsCode } from "./sms.js";
import fs from "node:fs";
import pathmod from "node:path";
import { getAccount, setTheme, setNickname, setPassword } from "./prefs.js";
import { claim, release, hasCapacity, capacity } from "./presence.js";

type Req = express.Request & { userId?: string };

const app = express();
app.use(express.json({ limit: "30mb" })); // 大一点,容纳上传的图片(data URL)

// 干净 URL:/chat /login(带 .html 的重定向过去),资源仍走 static
const page = (f: string) => (_req: express.Request, res: express.Response) =>
  res.sendFile(pathmod.join(ROOT, "public", f));
app.get("/chat.html", (_req, res) => res.redirect("/chat"));
app.get("/login.html", (_req, res) => res.redirect("/login"));
app.get("/chat", page("chat.html"));
app.get("/login", page("login.html"));
app.use(express.static(path.join(ROOT, "public")));

// ---- 登录 ----
app.post("/api/login", (req, res) => {
  const { username, password } = req.body ?? {};
  const userId = checkLogin(String(username ?? ""), String(password ?? ""));
  if (!userId) {
    res.status(401).json({ error: "用户名或密码错误" });
    return;
  }
  if (!hasCapacity()) {
    res.status(403).json({ error: "当前人数已满，请稍后再试" });
    return;
  }
  setSession(res, userId);
  res.json({ ok: true, userId });
});

app.post("/api/logout", (_req, res) => {
  clearSession(res);
  res.json({ ok: true });
});

// ---- Google 第三方登录(仅测试用)----
const googleEnabled = () =>
  !!(config.google.clientId && config.google.clientSecret);

// 前端问:显示哪些第三方登录入口
app.get("/api/auth/config", (_req, res) => {
  res.json({ google: googleEnabled(), sms: smsEnabled() });
});

// ① 用户点按钮 → 踢到 Google 授权页
app.get("/api/auth/google", (_req, res) => {
  if (!googleEnabled()) {
    res.redirect("/login");
    return;
  }
  const params = new URLSearchParams({
    client_id: config.google.clientId,
    redirect_uri: config.google.redirectUri,
    response_type: "code",
    scope: "openid email",
    state: makeOAuthState(),
    prompt: "select_account",
  });
  res.redirect(
    `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
  );
});

// ② Google 验完把人踢回来:换 token → 取邮箱 → 查白名单 → 发 session
app.get("/api/auth/google/callback", async (req, res) => {
  const fail = (reason: string) =>
    res.redirect(`/login?google_error=${encodeURIComponent(reason)}`);
  try {
    if (!googleEnabled()) return fail("未启用");
    const code = String(req.query.code ?? "");
    if (!verifyOAuthState(String(req.query.state ?? ""))) return fail("状态失效，请重试");
    if (!code) return fail("授权失败");

    // 拿 code 去 Google 换 id_token(我们自己直连 TLS,来源可信,无需再验签)
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: config.google.clientId,
        client_secret: config.google.clientSecret,
        redirect_uri: config.google.redirectUri,
        grant_type: "authorization_code",
      }).toString(),
    });
    if (!tokenRes.ok) return fail("换取令牌失败");
    const { id_token } = (await tokenRes.json()) as { id_token?: string };
    if (!id_token) return fail("未拿到身份令牌");

    // 解开 JWT 中间段拿邮箱
    const payload = JSON.parse(
      Buffer.from(id_token.split(".")[1], "base64url").toString("utf8")
    ) as { email?: string; email_verified?: boolean };
    const email = payload.email ?? "";
    if (!email || payload.email_verified === false) return fail("邮箱无效");

    // 查白名单:不在表里的一律拒绝(挡陌生人)
    const userId = googleUserIdFor(email);
    if (!userId) return fail("该 Google 账号未获授权");

    if (!hasCapacity()) return fail("当前人数已满，请稍后再试");

    setSession(res, userId);
    res.redirect("/chat");
  } catch {
    fail("登录出错");
  }
});

// ---- 手机号验证码登录(阿里云号码认证,仅测试用)----
// 每手机号 60 秒发送冷却(防误点/防刷)。只有白名单里的号能走到发送。
const smsCooldown = new Map<string, number>();

app.post("/api/auth/sms/send", async (req, res) => {
  if (!smsEnabled()) {
    res.status(400).json({ error: "未启用" });
    return;
  }
  const phone = String(req.body?.phone ?? "").trim();
  // 关键:不在白名单 → 连短信都不发(挡陌生人 + 锁死烧钱)
  if (!phoneUserIdFor(phone)) {
    res.status(403).json({ error: "该手机号未获授权" });
    return;
  }
  const now = Date.now();
  const last = smsCooldown.get(phone) ?? 0;
  if (now - last < 60_000) {
    res.status(429).json({ error: `请 ${Math.ceil((60_000 - (now - last)) / 1000)} 秒后再试` });
    return;
  }
  try {
    await sendSmsCode(phone);
    smsCooldown.set(phone, now);
    res.json({ ok: true });
  } catch (e: any) {
    res.status(502).json({ error: e?.message || "发送失败" });
  }
});

app.post("/api/auth/sms/verify", async (req, res) => {
  if (!smsEnabled()) {
    res.status(400).json({ error: "未启用" });
    return;
  }
  const phone = String(req.body?.phone ?? "").trim();
  const code = String(req.body?.code ?? "").trim();
  const userId = phoneUserIdFor(phone);
  if (!userId) {
    res.status(403).json({ error: "该手机号未获授权" });
    return;
  }
  if (!code) {
    res.status(400).json({ error: "请输入验证码" });
    return;
  }
  let ok = false;
  try {
    ok = await checkSmsCode(phone, code);
  } catch {
    res.status(502).json({ error: "校验失败,请重试" });
    return;
  }
  if (!ok) {
    res.status(401).json({ error: "验证码错误或已过期" });
    return;
  }
  if (!hasCapacity()) {
    res.status(403).json({ error: "当前人数已满，请稍后再试" });
    return;
  }
  smsCooldown.delete(phone);
  setSession(res, userId);
  res.json({ ok: true, userId });
});

app.get("/api/me", (req, res) => {
  const uid = getUserId(req);
  if (!uid) {
    res.status(401).json({ error: "未登录" });
    return;
  }
  const acc = getAccount(uid);
  res.json({ userId: uid, nickname: acc.nickname, prefs: { theme: acc.theme } });
});

// ---- 主题偏好 ----
app.post("/api/prefs", requireAuth, (req: Req, res) => {
  const theme = req.body?.theme === "light" ? "light" : "dark";
  res.json({ prefs: { theme: setTheme(req.userId!, theme).theme } });
});

// ---- 账户:改昵称 / 改密码 ----
app.post("/api/account/nickname", requireAuth, (req: Req, res) => {
  const nickname = String(req.body?.nickname ?? "").trim();
  res.json({ account: setNickname(req.userId!, nickname) });
});
app.post("/api/account/password", requireAuth, (req: Req, res) => {
  const oldPw = String(req.body?.oldPassword ?? "");
  const newPw = String(req.body?.newPassword ?? "");
  if (newPw.length < 1) {
    res.status(400).json({ error: "新密码不能为空" });
    return;
  }
  if (!verifyPasswordFor(req.userId!, oldPw)) {
    res.status(403).json({ error: "原密码错误" });
    return;
  }
  setPassword(req.userId!, newPw);
  res.json({ ok: true });
});

// ---- 3 人并发闸:持续连接占位(连接活着=占位,断开=释放)----
app.get("/api/presence", requireAuth, (req: Req, res) => {
  const clientId = String(req.query.clientId ?? "");
  const key = `${req.userId}:${clientId}`;
  if (!claim(key)) {
    res.status(429).json({ error: "当前人数已满，请稍后再试" });
    return;
  }
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();
  res.write(": ok\n\n");
  const hb = setInterval(() => {
    if (!res.writableEnded) res.write(": hb\n\n");
  }, 20000);
  req.on("close", () => {
    clearInterval(hb);
    release(key);
  });
});

// ---- 导师列表 ----
app.get("/api/tutors", requireAuth, (_req, res) => {
  res.json({ tutors: listTutors() });
});

// ---- 会话 CRUD ----
function needTutor(req: Req, res: express.Response): string | null {
  const tutor = String(req.query.tutor ?? req.body?.tutor ?? "");
  if (!isValidTutor(tutor)) {
    res.status(400).json({ error: `未知导师: ${tutor}` });
    return null;
  }
  return tutor;
}

app.get("/api/conversations", requireAuth, async (req: Req, res) => {
  const tutor = needTutor(req, res);
  if (!tutor) return;
  res.json({ conversations: await listConversations(req.userId!, tutor) });
});

app.post("/api/conversations", requireAuth, async (req: Req, res) => {
  const tutor = needTutor(req, res);
  if (!tutor) return;
  res.json({ conversation: await createConversation(req.userId!, tutor) });
});

app.patch("/api/conversations/:id", requireAuth, async (req: Req, res) => {
  const tutor = needTutor(req, res);
  if (!tutor) return;
  const { id } = req.params;
  if (typeof req.body?.title === "string")
    await renameConversation(req.userId!, tutor, id, req.body.title.slice(0, 60));
  if (typeof req.body?.pinned === "boolean")
    await setPinned(req.userId!, tutor, id, req.body.pinned);
  res.json({ ok: true });
});

app.delete("/api/conversations/:id", requireAuth, async (req: Req, res) => {
  const tutor = needTutor(req, res);
  if (!tutor) return;
  await deleteConversation(req.userId!, tutor, req.params.id);
  res.json({ ok: true });
});

app.get("/api/conversations/:id/messages", requireAuth, async (req: Req, res) => {
  const tutor = needTutor(req, res);
  if (!tutor) return;
  res.json({ messages: await getMessages(req.userId!, tutor, req.params.id) });
});

app.post("/api/conversations/:id/fork", requireAuth, async (req: Req, res) => {
  const tutor = needTutor(req, res);
  if (!tutor) return;
  const messageID = String(req.body?.messageID ?? "");
  if (!messageID) {
    res.status(400).json({ error: "缺少 messageID" });
    return;
  }
  res.json({
    conversation: await forkConversation(req.userId!, tutor, req.params.id, messageID),
  });
});

app.post("/api/conversations/:id/abort", requireAuth, async (req: Req, res) => {
  const tutor = needTutor(req, res);
  if (!tutor) return;
  await abortConversation(req.userId!, tutor, req.params.id);
  res.json({ ok: true });
});

// 截断(供"重新生成":删掉某条消息及之后,再重发)
app.post("/api/conversations/:id/truncate", requireAuth, async (req: Req, res) => {
  const tutor = needTutor(req, res);
  if (!tutor) return;
  const messageID = String(req.body?.messageID ?? "");
  if (!messageID) {
    res.status(400).json({ error: "缺少 messageID" });
    return;
  }
  await truncateFrom(req.userId!, tutor, req.params.id, messageID);
  res.json({ ok: true });
});

// 下载:
//  - hash 模式(正式的每消息按钮):从只增归档 _dlstore/<sha256> 取不可变快照,
//    下载文件名用 name 参数还原。文件被改/删都不影响,永远下到当时那份字节。
//  - file 模式(模型在正文里写的相对链接,尽力而为):从可变的 downloads/ 工作区取。
app.get("/api/download", requireAuth, (req: Req, res) => {
  const tutor = needTutor(req, res);
  if (!tutor) return;
  const hash = String(req.query.hash ?? "");
  if (hash) {
    if (!/^[a-f0-9]{64}$/.test(hash)) {
      res.status(404).json({ error: "文件不存在" });
      return;
    }
    // _dlstore 按 (用户,导师) 隔离,userId 来自鉴权 → 无越权风险
    const full = pathmod.join(userTutorDir(req.userId!, tutor), "_dlstore", hash);
    if (!fs.existsSync(full)) {
      res.status(404).json({ error: "文件不存在" });
      return;
    }
    const name = pathmod.basename(String(req.query.name ?? hash)) || hash;
    res.download(full, name);
    return;
  }
  const file = String(req.query.file ?? "");
  const base = pathmod.join(userTutorDir(req.userId!, tutor), "downloads");
  const full = pathmod.resolve(base, file);
  if (!full.startsWith(base + pathmod.sep) || !fs.existsSync(full)) {
    res.status(404).json({ error: "文件不存在" });
    return;
  }
  res.download(full, pathmod.basename(full));
});

// ---- 导出 txt ----
app.get("/api/conversations/:id/export", requireAuth, async (req: Req, res) => {
  const tutor = needTutor(req, res);
  if (!tutor) return;
  const msgs = await getMessages(req.userId!, tutor, req.params.id);
  const title = String(req.query.title ?? "对话");
  const body = msgs
    .map((m) => `【${m.role === "user" ? "我" : "助教"}】\n${m.text}\n`)
    .join("\n");
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename*=UTF-8''${encodeURIComponent(title)}.txt`
  );
  res.send(`${title}\n\n${body}`);
});

// ---- SSE 聊天 ----
app.post("/api/chat", requireAuth, async (req: Req, res) => {
  const message = String(req.body?.message ?? "").trim();
  const conversationId = String(req.body?.conversationId ?? "");
  const files: FilePart[] = Array.isArray(req.body?.files)
    ? req.body.files
        .slice(0, 6)
        .map((f: any) => ({
          filename: String(f?.filename ?? "file"),
          mime: String(f?.mime ?? "application/octet-stream"),
          url: String(f?.url ?? ""),
        }))
        .filter((f: FilePart) => f.url)
    : [];
  const tutor = needTutor(req, res);
  if (!tutor) return;
  if (!conversationId) {
    res.status(400).json({ error: "缺少 conversationId" });
    return;
  }
  if (!message && !files.length) {
    res.status(400).json({ error: "message 不能为空" });
    return;
  }
  const userId = req.userId!;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  const send = (obj: unknown) => {
    try {
      if (!res.writableEnded) res.write(`data: ${JSON.stringify(obj)}\n\n`);
    } catch {}
  };
  const heartbeat = setInterval(() => {
    if (!res.writableEnded) res.write(`: ping\n\n`);
  }, 15000);
  let clientGone = false;
  res.on("close", () => {
    clientGone = true;
  });

  try {
    if (clientGone) return;
    send({ type: "start" });
    await new Promise<void>((resolve) => {
      runPrompt(userId, tutor, conversationId, message, files, {
        onDelta: (text) => send({ type: "delta", text }),
        onStatus: (state, info) => send({ type: "status", state, ...info }),
        onDownload: (filename) => send({ type: "download", filename }),
        onDone: () => {
          send({ type: "done" });
          resolve();
        },
        onError: (err) => {
          send({ type: "error", message: err.message });
          resolve();
        },
      }).catch(() => resolve());
    });
  } finally {
    clearInterval(heartbeat);
    if (!res.writableEnded) res.end();
  }
});

app.get("/", (req, res) => {
  res.redirect(getUserId(req) ? "/chat" : "/login");
});

const server = app.listen(config.port, () => {
  console.log(`calc-tutor-app 监听 http://127.0.0.1:${config.port}`);
  console.log(`模型: ${config.model.providerID}/${config.model.modelID}`);
  console.log(`导师: ${listTutors().join(", ") || "(courses/ 为空)"}`);
  console.log(`账号: ${config.users.size} 个  最多同时在线: ${capacity}`);
});

function shutdown() {
  console.log("关闭中…");
  shutdownAll();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
