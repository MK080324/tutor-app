// 极简 .env 加载 + 配置。不引 dotenv,保持依赖少。
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(__dirname, "..");

// 读 .env(若存在),仅填充未设置的 key
function loadDotenv() {
  const p = path.join(ROOT, ".env");
  if (!fs.existsSync(p)) return;
  for (const raw of fs.readFileSync(p, "utf8").split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 0) continue;
    const k = line.slice(0, eq).trim();
    let v = line.slice(eq + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    )
      v = v.slice(1, -1);
    if (process.env[k] === undefined) process.env[k] = v;
  }
}
loadDotenv();

function req(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined) throw new Error(`缺少环境变量 ${name}（看 .env.example）`);
  return v;
}

// 解析 "user:pass,user:pass"
function parseUsers(s: string): Map<string, string> {
  const m = new Map<string, string>();
  for (const pair of s.split(",")) {
    const t = pair.trim();
    if (!t) continue;
    const i = t.indexOf(":");
    if (i < 0) continue;
    m.set(t.slice(0, i).trim(), t.slice(i + 1).trim());
  }
  return m;
}

// model 字符串 "provider/model" -> {providerID, modelID}
export function parseModel(s: string): { providerID: string; modelID: string } {
  const i = s.indexOf("/");
  if (i < 0) throw new Error(`TUTOR_MODEL 需为 provider/model 格式，当前=${s}`);
  return { providerID: s.slice(0, i), modelID: s.slice(i + 1) };
}

export const config = {
  port: Number(req("PORT", "3000")),
  sessionSecret: req("SESSION_SECRET", "dev-insecure-secret"),
  users: parseUsers(req("TUTOR_USERS", "alice:pass1")),
  model: parseModel(req("TUTOR_MODEL", "deepseek/deepseek-v4-flash")),
  maxConcurrency: Number(req("MAX_CONCURRENCY", "2")),
  // 每用户闲置多久关掉其 opencode 进程(省内存)
  idleTimeoutMs: Number(req("IDLE_TIMEOUT_MS", "600000")),
  // 数据目录:每用户×导师 data/users/<user>/<tutor>/
  dataDir: path.join(ROOT, "data"),
  // 导师库:每个子文件夹(含 CLAUDE.md 或 AGENTS.md)= 一个导师。热挂载。
  coursesDir: process.env.COURSES_DIR
    ? path.resolve(process.env.COURSES_DIR)
    : path.join(ROOT, "courses"),
};

// 注入给 opencode 的配置文件(DeepSeek provider + 读 CLAUDE.md/AGENTS.md)。
// 通过 OPENCODE_CONFIG 环境变量传给每个 opencode 子进程,和全局配置合并。
// 这样导师文件夹本身只需一个 CLAUDE.md,不必自带 opencode.json。
export function writeInjectConfig(): string {
  fs.mkdirSync(config.dataDir, { recursive: true });
  // 全局房规:对所有导师、所有用户生效(含已 provision 的老目录)。
  const houseRules = path.join(config.dataDir, "_house-rules.md");
  fs.writeFileSync(
    houseRules,
    [
      "# 全局输出规约(最高优先)",
      "",
      "1. 只输出给用户看的最终内容本身。不要输出你的思考、计划、meta 叙述",
      '   (如 "The user wants…", "Let me…", "首先我需要…")。想清楚后直接给结果。',
      "2. 需要读/写文件(如进度、笔记)时,必须真的调用文件工具去做,",
      "   不许只在文字里声称「我已更新」。没调用工具 = 没做。",
      "3. 面向用户的语言遵循各导师自己的 CLAUDE.md 规定。",
      "",
      "# 排版与作图(前端会渲染)",
      "",
      "- 用 Markdown 组织回答(标题/列表/加粗/表格/代码块)。",
      "- 数学用 LaTeX:行内 `$...$`,单独成行 `$$...$$`。",
      "- 需要作图时(几何图、受力图、电路、坐标图等):",
      "  - 结构/流程/关系图 → 用 ```mermaid 代码块;",
      "  - 具体的矢量图形(几何/函数曲线/示意图)→ 用 ```svg 代码块直接写 SVG。",
      "  不要用 ASCII 画图。",
      "",
      "# 下载能力",
      "",
      "- 你可以给用户一个可下载的文件:把该文件写到工作目录下的 `downloads/` 子目录",
      "  (例如 `downloads/错题本.md`)。写进去的文件会自动在聊天界面变成下载按钮,",
      "  用户点一下即可下载。仅在用户确实需要拿走文件时才用(如导出笔记、错题本、总结)。",
      "",
      "# 生成 PDF(Typst 工具,已装好)",
      "",
      "- 要生成 PDF 时【只用这套工具】,不要写 LaTeX/调浏览器/用 python 拼 PDF。",
      "- 步骤:",
      "  ① 用 write 工具在【工作目录】写一个 `.typ` 源文件(不要写到 downloads/),内容形如:",
      "     #import \"template.typ\": report",
      "     #show: report.with(title: \"标题\", author: \"助教\", date: \"2026-07-02\")",
      "     = 第一节",
      "     正文…… 数学用 typst 语法: $ f'(x) = lim_(h->0) (f(x+h)-f(x))/h $",
      "  ② 用 bash 工具运行(路径照抄,一行):",
      "     bash " + path.join(ROOT, "pdfkit", "mkpdf.sh") + " 你的文件.typ downloads/你的文件.pdf",
      "  ③ 成功后 downloads/ 里的 PDF 会自动变成下载按钮,告诉用户即可。",
      "- 规则:纯黑白、不手动凑留白。更详细的语法/范例见 " + path.join(ROOT, "pdfkit") + " 目录(可选)。",
      "",
    ].join("\n")
  );
  const p = path.join(config.dataDir, "opencode-inject.json");
  const cfg = {
    $schema: "https://opencode.ai/config.json",
    // 自动放行工具,避免 headless 下权限询问导致挂起(尤其访问外部 pdfkit 目录)
    permission: {
      bash: "allow",
      edit: "allow",
      read: "allow",
      external_directory: "allow",
      webfetch: "allow",
    },
    instructions: [houseRules, "AGENTS.md", "CLAUDE.md"],
    provider: {
      deepseek: {
        npm: "@ai-sdk/openai-compatible",
        name: "DeepSeek",
        options: {
          baseURL: "https://api.deepseek.com/v1",
          apiKey: "{env:DEEPSEEK_API_KEY}",
        },
        models: {
          "deepseek-v4-flash": { name: "DeepSeek V4 Flash" },
          "deepseek-v4-pro": { name: "DeepSeek V4 Pro" },
        },
      },
    },
  };
  fs.writeFileSync(p, JSON.stringify(cfg, null, 2));
  return p;
}
