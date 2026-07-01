// 每用户偏好/账户,存 data/users/<user>/prefs.json。
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { config } from "./config.js";

const safe = (u: string) => u.replace(/[^a-zA-Z0-9_-]/g, "_");
function prefsPath(userId: string) {
  return path.join(config.dataDir, "users", safe(userId), "prefs.json");
}
interface Store {
  theme?: "dark" | "light";
  nickname?: string;
  pw?: { salt: string; hash: string };
}
function read(userId: string): Store {
  try { return JSON.parse(fs.readFileSync(prefsPath(userId), "utf8")); }
  catch { return {}; }
}
function write(userId: string, s: Store) {
  const p = prefsPath(userId);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(s));
}

// 给前端:主题 + 昵称(不含密码)
export function getAccount(userId: string) {
  const s = read(userId);
  return { theme: s.theme === "light" ? "light" : "dark", nickname: s.nickname || "" };
}
export function setTheme(userId: string, theme: "dark" | "light") {
  const s = read(userId); s.theme = theme; write(userId, s);
  return getAccount(userId);
}
export function setNickname(userId: string, nickname: string) {
  const s = read(userId); s.nickname = nickname.slice(0, 30); write(userId, s);
  return getAccount(userId);
}
export function setPassword(userId: string, newPassword: string) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(newPassword, salt, 32).toString("hex");
  const s = read(userId); s.pw = { salt, hash }; write(userId, s);
}
// 返回 true/false 若用户改过密码;返回 null 表示没改过(调用方回退到 env 密码)
export function verifyStoredPassword(userId: string, password: string): boolean | null {
  const s = read(userId);
  if (!s.pw) return null;
  const h = crypto.scryptSync(password, s.pw.salt, 32).toString("hex");
  const a = Buffer.from(h), b = Buffer.from(s.pw.hash);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
