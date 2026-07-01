// 导师库:courses/ 下每个含 CLAUDE.md 或 AGENTS.md 的子文件夹 = 一个导师。
// 热挂载:每次都实时读目录,scp 上传新文件夹即刻生效,无需重启。
import fs from "node:fs";
import path from "node:path";
import { config } from "./config.js";
import { safeUserId } from "./auth.js";

function hasInstructions(dir: string): boolean {
  return (
    fs.existsSync(path.join(dir, "AGENTS.md")) ||
    fs.existsSync(path.join(dir, "CLAUDE.md"))
  );
}

// 列出当前可用导师(文件夹名)。
export function listTutors(): string[] {
  if (!fs.existsSync(config.coursesDir)) return [];
  return fs
    .readdirSync(config.coursesDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith("."))
    .filter((d) => hasInstructions(path.join(config.coursesDir, d.name)))
    .map((d) => d.name)
    .sort();
}

// 校验(同时防路径穿越:只接受确实存在于 courses/ 里的名字)。
export function isValidTutor(name: string): boolean {
  return listTutors().includes(name);
}

// 该用户在该导师下的工作目录。
export function userTutorDir(userId: string, tutor: string): string {
  return path.join(config.dataDir, "users", safeUserId(userId), tutor);
}

// 首次进入某导师:从 courses/<tutor> 拷一份到用户目录(隔离进度)。
// 已存在则不动(保住该用户已有进度)。
export function provisionUserTutor(userId: string, tutor: string): string {
  const dir = userTutorDir(userId, tutor);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(path.dirname(dir), { recursive: true });
    fs.cpSync(path.join(config.coursesDir, tutor), dir, { recursive: true });
  }
  return dir;
}
