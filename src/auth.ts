// 5 硬编码账号 + 签名 cookie session。防挤爆,不防黑客。
import crypto from "node:crypto";
import type { Request, Response, NextFunction } from "express";
import { config } from "./config.js";

const COOKIE = "tutor_sid";

function sign(value: string): string {
  const mac = crypto
    .createHmac("sha256", config.sessionSecret)
    .update(value)
    .digest("base64url");
  return `${value}.${mac}`;
}

function verify(signed: string | undefined): string | null {
  if (!signed) return null;
  const dot = signed.lastIndexOf(".");
  if (dot < 0) return null;
  const value = signed.slice(0, dot);
  if (sign(value) !== signed) return null;
  return value;
}

// userId 用于目录名,做一次白名单清洗
export function safeUserId(username: string): string {
  return username.replace(/[^a-zA-Z0-9_-]/g, "_");
}

import { verifyStoredPassword } from "./prefs.js";

// 校验某 userId 的密码:改过就用改过的,否则回退到 env 里的初始密码。
export function verifyPasswordFor(userId: string, password: string): boolean {
  const stored = verifyStoredPassword(userId, password);
  if (stored !== null) return stored;
  const expected = config.users.get(userId); // 我们的账号 username===userId
  if (expected === undefined) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(password);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function checkLogin(username: string, password: string): string | null {
  if (!config.users.has(username)) return null;
  const id = safeUserId(username);
  return verifyPasswordFor(id, password) ? id : null;
}

// ---- Google 登录:白名单查表 + 防伪 state ----

// 邮箱(不区分大小写)-> userId;不在白名单返回 null。
export function googleUserIdFor(email: string): string | null {
  return config.google.allowlist.get(email.trim().toLowerCase()) ?? null;
}

// 生成一次性 state:随机数 + 时间戳,用同一把 HMAC 签名。无需服务端存储。
export function makeOAuthState(): string {
  const nonce = crypto.randomBytes(16).toString("base64url");
  return sign(`${nonce}.${Date.now()}`);
}

// 校验 state:签名对 + 10 分钟内。
export function verifyOAuthState(state: string | undefined): boolean {
  const value = verify(state);
  if (!value) return false;
  const dot = value.lastIndexOf(".");
  if (dot < 0) return false;
  const ts = Number(value.slice(dot + 1));
  return Number.isFinite(ts) && Date.now() - ts < 10 * 60 * 1000;
}

export function setSession(res: Response, userId: string) {
  res.setHeader(
    "Set-Cookie",
    `${COOKIE}=${sign(userId)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800`
  );
}

export function clearSession(res: Response) {
  res.setHeader("Set-Cookie", `${COOKIE}=; HttpOnly; Path=/; Max-Age=0`);
}

export function getUserId(req: Request): string | null {
  const raw = req.headers.cookie ?? "";
  const found = raw
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(COOKIE + "="));
  if (!found) return null;
  return verify(decodeURIComponent(found.slice(COOKIE.length + 1)));
}

// 中间件:要求已登录,把 userId 挂到 req
export function requireAuth(
  req: Request & { userId?: string },
  res: Response,
  next: NextFunction
) {
  const uid = getUserId(req);
  if (!uid) {
    res.status(401).json({ error: "未登录" });
    return;
  }
  req.userId = uid;
  next();
}
