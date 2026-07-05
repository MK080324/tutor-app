"use strict";
const $ = (id) => document.getElementById(id);
const root = document.documentElement;

// ---------- UI 高度接管:position:fixed 钉死 + 键盘期间冻结,避免预留键盘空间 ----------
// --app-h = window.innerHeight,只在 idle/旋转更新。【键盘期间冻结】:focusin 起不再改高度,
// body 保持满高 → 系统只是把整个界面平移上去(原生 rigid-up、无空洞),而非把 body 缩小(预留)。
// 【不监听 visualViewport】:它键盘弹起会缩小,跟随=预留。另有兜底:非键盘态整页禁滚(scrollY 归零)。
(function initAppHeight() {
  let kbOpen = false;
  const setH = () => {
    if (kbOpen) return; // 键盘期间冻结:绝不缩 body、绝不预留
    root.style.setProperty("--app-h", window.innerHeight + "px");
  };
  const pin = () => {
    if (!kbOpen && (window.scrollY || window.pageYOffset)) window.scrollTo(0, 0);
  };
  setH();
  window.addEventListener("resize", setH);
  window.addEventListener("orientationchange", () => setTimeout(setH, 120));
  window.addEventListener("scroll", pin, { passive: true });
  const isField = (t) => t && (t.tagName === "TEXTAREA" || t.tagName === "INPUT");
  document.addEventListener("focusin", (e) => { if (isField(e.target)) kbOpen = true; });
  document.addEventListener("focusout", (e) => {
    if (!isField(e.target)) return;
    kbOpen = false;
    setTimeout(() => { setH(); pin(); }, 60);
    setTimeout(() => { setH(); pin(); }, 250);
    setTimeout(() => { setH(); pin(); }, 500);
  });
})();

const FOLDER_SVG =
  '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z"/></svg>';
const IC = {
  copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>',
  regen: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M21 12a9 9 0 1 1-2.64-6.36M21 4v5h-5"/></svg>',
  rerender: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M19 11 9 1l-7 7 10 10 4-4z"/><path d="M5 12l-2 4a2 2 0 0 0 4 0"/></svg>',
};

const S = {
  user: null, nickname: "", theme: "dark", tutors: [], tutor: null,
  convs: [], convId: null, messages: [], generating: false, abort: null,
  files: [],
  clientId: sessionStorage.getItem("cid") || Math.random().toString(36).slice(2),
};
sessionStorage.setItem("cid", S.clientId);
let mermaidId = 0;

// ---------- API ----------
async function jget(path) {
  const r = await fetch(path);
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || r.status);
  return r.json();
}
async function jsend(method, path, body) {
  const r = await fetch(path, {
    method, headers: { "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || r.status);
  return r.json();
}
const q = (extra) => `?tutor=${encodeURIComponent(S.tutor)}${extra || ""}`;

// ---------- 主题 ----------
function setTheme(t) {
  S.theme = t;
  root.setAttribute("data-theme", t);
  if (window.mermaid)
    mermaid.initialize({ startOnLoad: false, theme: t === "dark" ? "dark" : "default" });
}
$("themeBtn").onclick = () => {
  setTheme(S.theme === "dark" ? "light" : "dark");
  jsend("POST", "/api/prefs", { theme: S.theme }).catch(() => {});
};

// ---------- presence:开一条常驻连接占位;满了 429 ----------
async function claimPresence() {
  try {
    const resp = await fetch("/api/presence?clientId=" + encodeURIComponent(S.clientId));
    if (resp.status === 429) return false;
    if (!resp.ok || !resp.body) return true;
    const reader = resp.body.getReader(); // 一直读=连接保持=占着位;窗口关闭连接自动断
    (async () => { try { while (true) { const { done } = await reader.read(); if (done) break; } } catch {} })();
    return true;
  } catch { return true; }
}

// ---------- 主题化弹窗 ----------
function modal(opts) {
  return new Promise((resolve) => {
    const bg = document.createElement("div"); bg.className = "modal-bg";
    const m = document.createElement("div"); m.className = "modal";
    const h = document.createElement("h3"); h.textContent = opts.title; m.appendChild(h);
    if (opts.message) { const p = document.createElement("p"); p.textContent = opts.message; p.style.color = "var(--sub)"; p.style.fontSize = "13px"; m.appendChild(p); }
    const inputs = {};
    for (const f of opts.fields || []) {
      const lb = document.createElement("label"); lb.textContent = f.label; m.appendChild(lb);
      const inp = document.createElement("input"); inp.type = f.type || "text"; inp.value = f.value || ""; m.appendChild(inp);
      inputs[f.name] = inp;
    }
    const err = document.createElement("div"); err.className = "merr"; m.appendChild(err);
    const btns = document.createElement("div"); btns.className = "mbtns";
    const cancel = document.createElement("button"); cancel.textContent = "取消";
    const ok = document.createElement("button"); ok.className = "primary"; ok.textContent = opts.okText || "确定";
    if (opts.danger) ok.style.background = "var(--danger)";
    btns.appendChild(cancel); btns.appendChild(ok); m.appendChild(btns);
    bg.appendChild(m); document.body.appendChild(bg);
    const first = m.querySelector("input"); if (first) first.focus();
    const close = (v) => { bg.remove(); resolve(v); };
    cancel.onclick = () => close(null);
    bg.onclick = (e) => { if (e.target === bg) close(null); };
    ok.onclick = async () => {
      const vals = {}; for (const k in inputs) vals[k] = inputs[k].value;
      if (opts.onSubmit) { const e2 = await opts.onSubmit(vals); if (e2) { err.textContent = e2; return; } }
      close(opts.fields ? vals : true);
    };
    m.querySelectorAll("input").forEach((inp) => inp.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.isComposing && e.keyCode !== 229) ok.click(); }));
  });
}
function modalConfirm(title, message, okText, danger) {
  return modal({ title, message, okText: okText || "确定", danger }).then((v) => v === true);
}

// ---------- 富文本渲染:markdown + LaTeX + mermaid + svg ----------
function sanitizeSvg(s) {
  return s.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/on\w+="[^"]*"/gi, "");
}
function renderRich(el, raw) {
  el.dataset.raw = raw;
  // 先把数学抽出占位,避免 markdown 破坏 $x_1$ 里的下划线/星号
  const math = [];
  const protectedSrc = raw.replace(
    /\$\$[\s\S]+?\$\$|\\\[[\s\S]+?\\\]|\$[^\n$]+?\$|\\\([\s\S]+?\\\)/g,
    (m) => { math.push(m); return `@@MATH${math.length - 1}@@`; }
  );
  let html;
  try { html = marked.parse(protectedSrc, { breaks: true, gfm: true }); }
  catch { el.textContent = raw; return; }
  html = html.replace(/@@MATH(\d+)@@/g, (_, i) => math[+i]);
  el.innerHTML = html;
  // 模型有时自己写 downloads/xxx 的链接(相对路径,直接点会 404)→ 改写成真下载接口
  el.querySelectorAll("a[href]").forEach((a) => {
    const m = (a.getAttribute("href") || "").match(/^\/?downloads\/(.+)$/);
    if (m) {
      a.href = "/api/download" + q("&file=" + encodeURIComponent(decodeURIComponent(m[1])));
      a.target = "_blank";
    }
  });
  // svg 代码块 → 内联矢量图
  el.querySelectorAll("code.language-svg").forEach((c) => {
    const pre = c.closest("pre") || c;
    const div = document.createElement("div");
    div.className = "diagram";
    div.innerHTML = sanitizeSvg(c.textContent);
    pre.replaceWith(div);
  });
  // mermaid 代码块 → 图
  el.querySelectorAll("code.language-mermaid").forEach((c) => {
    const pre = c.closest("pre") || c;
    const code = c.textContent;
    const holder = document.createElement("div");
    holder.className = "diagram";
    pre.replaceWith(holder);
    if (!window.mermaid) return;
    mermaid.render("mm" + ++mermaidId, code)
      .then(({ svg }) => { holder.innerHTML = svg; })
      .catch(() => { holder.textContent = code; });
  });
  // LaTeX
  if (window.renderMathInElement) {
    try {
      renderMathInElement(el, {
        delimiters: [
          { left: "$$", right: "$$", display: true },
          { left: "$", right: "$", display: false },
          { left: "\\[", right: "\\]", display: true },
          { left: "\\(", right: "\\)", display: false },
        ],
        throwOnError: false,
      });
    } catch {}
  }
}

// ---------- 侧边栏 ----------
function renderTutors() {
  const el = $("tutorList");
  el.innerHTML = "";
  for (const t of S.tutors) {
    const d = document.createElement("div");
    d.className = "row" + (t === S.tutor ? " active" : "");
    d.innerHTML = FOLDER_SVG + `<span class="tx"></span>`;
    d.querySelector(".tx").textContent = t;
    d.onclick = () => selectTutor(t);
    el.appendChild(d);
  }
}
function renderConvs() {
  const el = $("convs");
  el.innerHTML = "";
  for (const c of S.convs) {
    const row = document.createElement("div");
    row.className = "row conv" + (c.id === S.convId ? " active" : "");
    const t = document.createElement("span");
    t.className = "tx";
    t.textContent = c.title || "新对话";
    if (c.pinned) { const p = document.createElement("span"); p.className = "pin"; p.textContent = "置顶"; t.appendChild(p); }
    row.appendChild(t);
    const dots = document.createElement("button");
    dots.className = "dots"; dots.textContent = "⋯";
    dots.onclick = (e) => { e.stopPropagation(); convMenu(e, c); };
    row.appendChild(dots);
    row.onclick = () => openConv(c.id);
    el.appendChild(row);
  }
}
async function selectTutor(t) {
  abortCurrent();
  S.tutor = t; S.convId = null;
  renderTutors();
  await loadConvs();
  showEmpty();
}
async function loadConvs() {
  try { S.convs = (await jget("/api/conversations" + q())).conversations; }
  catch { S.convs = []; }
  renderConvs();
}

// ---------- 会话视图 ----------
function showEmpty() {
  S.convId = null; S.messages = [];
  $("titleT").textContent = "新对话";
  $("log").innerHTML = '<div class="wrap" style="height:100%"><div class="empty">有什么我能帮你的吗?</div></div>';
  renderConvs();
}
let logWrap;
function ensureWrap() {
  const log = $("log");
  if (!logWrap || !log.contains(logWrap) || log.querySelector(".empty")) {
    log.innerHTML = '<div class="wrap"></div>';
    logWrap = log.querySelector(".wrap");
  }
  return logWrap;
}
async function openConv(id) {
  abortCurrent();
  S.convId = id;
  const c = S.convs.find((x) => x.id === id);
  $("titleT").textContent = c ? c.title : "对话";
  renderConvs();
  await loadMessages();
  closeSidebarOnMobile();
}
async function loadMessages() {
  const wrap = ensureWrap();
  wrap.innerHTML = "";
  try {
    const { messages } = await jget(`/api/conversations/${S.convId}/messages` + q());
    S.messages = messages;
    for (const m of messages) renderMessage(m);
    scrollDown(true);
  } catch {}
}

// ---------- 滚动 ----------
let stick = true;
const logEl = $("log");
const atBottom = () => logEl.scrollHeight - logEl.scrollTop - logEl.clientHeight < 60;
const scrollDown = (force) => { if (force || stick) logEl.scrollTop = logEl.scrollHeight; };
logEl.addEventListener("scroll", () => { stick = atBottom(); });

// ---------- 消息渲染 ----------
function mkAct(label, fn) {
  const b = document.createElement("button");
  b.className = "act"; b.textContent = label;
  b.onclick = (e) => { e.stopPropagation(); fn(e); };
  return b;
}
function iconAct(svg, title, fn) {
  const b = document.createElement("button");
  b.className = "act"; b.title = title; b.innerHTML = svg;
  b.onclick = (e) => { e.stopPropagation(); fn(e); };
  return b;
}
function renderMessage(m) {
  const wrap = ensureWrap();
  const div = document.createElement("div");
  div.className = "msg " + (m.role === "user" ? "user" : "bot");
  const b = document.createElement("div");
  b.className = "bubble";
  if (m.role === "assistant") renderRich(b, m.text || "");
  else b.textContent = m.text;
  div.appendChild(b);

  const acts = document.createElement("div");
  acts.className = "acts";
  const copyFn = () => navigator.clipboard.writeText(m.text || b.dataset.raw || "");
  if (m.role === "user") {
    acts.appendChild(mkAct("复制", copyFn));
    acts.appendChild(mkAct("修改", () => startEdit(div, m)));
    acts.appendChild(mkAct("⋯", (e) => msgMenu(e, m)));
  } else {
    acts.appendChild(iconAct(IC.copy, "复制", copyFn));
    acts.appendChild(iconAct(IC.regen, "重新生成", () => regenerate(m)));
    acts.appendChild(iconAct(IC.rerender, "重新渲染", () => loadMessages()));
  }
  div.appendChild(acts);
  // 持久下载按钮:从服务器返回的 downloads 严格挂到本条消息下(刷新/重渲染都会重建)
  if (m.role !== "user" && Array.isArray(m.downloads))
    for (const dl of m.downloads) attachDownload(div, dl);
  wrap.appendChild(div);
  return { div, bubble: b, acts };
}

// ---------- 状态(纯文字呼吸) ----------
const TOOL_LABEL = {
  read: (f) => "读取 " + (f || "文件"), edit: (f) => "写入 " + (f || "文件"),
  write: (f) => "写入 " + (f || "文件"), list: () => "浏览文件", glob: () => "浏览文件",
  bash: () => "运行命令", webfetch: () => "联网查阅",
};
function statusText(ev) {
  if (ev.state === "tool") return (TOOL_LABEL[ev.tool] || (() => "处理中"))(ev.file);
  return "思考中";
}

// ---------- 下载按钮 ----------
// dl 可为字符串(生成过程中的 transient,按文件名走可变工作区)
// 或 {filename, hash}(加载/刷新后的持久按钮,按 hash 走只增归档 —— 永不失效)
function attachDownload(div, dl) {
  const filename = typeof dl === "string" ? dl : dl.filename;
  const hash = typeof dl === "string" ? null : dl.hash;
  let dls = div.querySelector(".dls");
  if (!dls) {
    dls = document.createElement("div");
    dls.className = "dls";
    div.insertBefore(dls, div.querySelector(".acts"));
  }
  const key = hash || filename;
  if (dls.querySelector(`[data-f="${CSS.escape(key)}"]`)) return;
  const a = document.createElement("a");
  a.className = "dlbtn"; a.dataset.f = key;
  a.textContent = "⬇ " + filename.split("/").pop();
  a.href = hash
    ? "/api/download" + q(`&hash=${hash}&name=${encodeURIComponent(filename.split("/").pop())}`)
    : "/api/download" + q(`&file=${encodeURIComponent(filename)}`);
  dls.appendChild(a);
}

// ---------- 发送 / 流式 ----------
function updateSendBtn() {
  const btn = $("send");
  btn.textContent = S.generating ? "■" : "↑";
  btn.title = S.generating ? "停止" : "发送";
}
$("send").onclick = () => { if (S.generating) abortCurrent(); else send(); };

function abortCurrent() {
  if (!S.generating) return;
  if (S.convId) jsend("POST", `/api/conversations/${S.convId}/abort`, { tutor: S.tutor }).catch(() => {});
  try { S.abort && S.abort(); } catch {}
  S.generating = false;
  updateSendBtn();
}

async function send(overrideText) {
  const text = (overrideText != null ? overrideText : $("input").value).trim();
  const files = S.files;
  if ((!text && !files.length) || S.generating || !S.tutor) return;
  if (overrideText == null) { $("input").value = ""; autosize(); }
  S.files = []; renderFiles();

  if (!S.convId) {
    const { conversation } = await jsend("POST", "/api/conversations", { tutor: S.tutor });
    S.convId = conversation.id;
    S.convs.unshift(conversation);
    $("titleT").textContent = conversation.title;
    renderConvs();
  }
  ensureWrap();
  renderMessage({ role: "user", text: text + (files.length ? `\n[附件 ${files.length} 个]` : "") });
  const bot = renderMessage({ role: "assistant", text: "" });
  bot.acts.style.display = "none"; // 生成中先不显示助教操作
  const statusEl = document.createElement("div");
  statusEl.className = "status"; statusEl.textContent = "思考中";
  bot.div.insertBefore(statusEl, bot.acts);
  scrollDown(true);

  S.generating = true; updateSendBtn();
  const controller = new AbortController();
  S.abort = () => controller.abort();
  let acc = "";
  try {
    const resp = await fetch("/api/chat", {
      method: "POST", headers: { "content-type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({ tutor: S.tutor, conversationId: S.convId, message: text, files }),
    });
    const reader = resp.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let nl;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line.startsWith("data:")) continue;
        const ev = JSON.parse(line.slice(5).trim());
        if (ev.type === "status") { statusEl.textContent = statusText(ev); }
        else if (ev.type === "delta") { acc += ev.text; bot.bubble.textContent = acc; statusEl.textContent = "回复中"; scrollDown(); }
        else if (ev.type === "download") { attachDownload(bot.div, ev.filename); }
        else if (ev.type === "error") { acc += "\n[出错] " + ev.message; bot.bubble.textContent = acc; }
      }
    }
  } catch (e) {
    if (e.name !== "AbortError") { acc += "\n[连接中断]"; bot.bubble.textContent = acc; }
  } finally {
    statusEl.remove();
    if (acc) renderRich(bot.bubble, acc); // 完成后富渲染
    bot.acts.style.display = "";
    S.generating = false; updateSendBtn();
    await syncAfterTurn();
  }
}

// 一轮结束后:重载消息(拿 id/自动标题/持久下载按钮 —— loadMessages 会按消息重建)
async function syncAfterTurn() {
  await loadMessages();
  await loadConvs();
  renderConvs();
}

// ---------- 重新生成:从上一条 user 处截断,重发 ----------
async function regenerate(m) {
  const idx = S.messages.indexOf(m);
  let u = null;
  for (let i = (idx < 0 ? S.messages.length - 1 : idx); i >= 0; i--)
    if (S.messages[i].role === "user") { u = S.messages[i]; break; }
  if (!u) return;
  abortCurrent();
  try {
    await jsend("POST", `/api/conversations/${S.convId}/truncate`, { tutor: S.tutor, messageID: u.id });
    await loadMessages();
    send(u.text);
  } catch (e) { alert("重新生成失败: " + e.message); }
}

// ---------- 内联修改 → fork ----------
function startEdit(msgDiv, m) {
  const box = document.createElement("div");
  box.className = "editbox";
  const ta = document.createElement("textarea");
  ta.value = m.text; ta.rows = 1;
  const ok = document.createElement("button");
  ok.className = "send"; ok.textContent = "↑"; ok.title = "确认修改";
  const cancel = document.createElement("button");
  cancel.className = "ecancel"; cancel.textContent = "×"; cancel.title = "取消";
  box.appendChild(cancel); box.appendChild(ta); box.appendChild(ok); // × 在最左
  msgDiv.replaceWith(box);
  ta.focus();
  const grow = () => { ta.style.height = "auto"; ta.style.height = ta.scrollHeight + "px"; };
  grow(); ta.oninput = grow;
  const restore = () => box.replaceWith(msgDiv);
  cancel.onclick = restore;
  ok.onclick = async () => {
    const newText = ta.value.trim();
    if (!newText) return;
    abortCurrent();
    try {
      const { conversation } = await jsend("POST",
        `/api/conversations/${S.convId}/fork`, { tutor: S.tutor, messageID: m.id });
      S.convId = conversation.id;
      S.convs.unshift(conversation);
      $("titleT").textContent = conversation.title;
      renderConvs();
      await loadMessages();
      send(newText);
    } catch (e) { alert("修改失败: " + e.message); restore(); }
  };
}

// ---------- 菜单 ----------
let openMenu = null;
function showMenu(x, y, items) {
  closeMenu();
  const m = document.createElement("div");
  m.className = "menu";
  for (const it of items) {
    const b = document.createElement("button");
    if (it.danger) b.className = "del";
    b.textContent = it.label;
    b.onclick = () => { closeMenu(); it.fn(); };
    m.appendChild(b);
  }
  document.body.appendChild(m);
  m.style.left = Math.min(x, innerWidth - 150) + "px";
  m.style.top = y + "px";
  openMenu = m;
  setTimeout(() => document.addEventListener("click", closeMenu, { once: true }), 0);
}
function closeMenu() { if (openMenu) { openMenu.remove(); openMenu = null; } }
function convMenu(e, c) {
  const r = e.target.getBoundingClientRect();
  showMenu(r.left, r.bottom + 4, [
    { label: c.pinned ? "取消置顶" : "置顶", fn: async () => { await jsend("PATCH", `/api/conversations/${c.id}` + q(), { tutor: S.tutor, pinned: !c.pinned }); loadConvs(); } },
    { label: "分享(导出txt)", fn: () => { location.href = `/api/conversations/${c.id}/export` + q(`&title=${encodeURIComponent(c.title || "对话")}`); } },
    { label: "重命名", fn: async () => { const r = await modal({ title: "重命名", fields: [{ name: "t", label: "对话名称", value: c.title }], okText: "保存" }); if (r && r.t.trim()) { await jsend("PATCH", `/api/conversations/${c.id}` + q(), { tutor: S.tutor, title: r.t.trim() }); loadConvs(); } } },
    { label: "删除", danger: true, fn: async () => { if (await modalConfirm("删除对话", "确定删除这个对话?", "删除", true)) { await jsend("DELETE", `/api/conversations/${c.id}` + q(), { tutor: S.tutor }); if (S.convId === c.id) showEmpty(); loadConvs(); } } },
  ]);
}
function msgMenu(e) {
  const r = e.target.getBoundingClientRect();
  showMenu(r.left, r.bottom + 4, [
    { label: "删除对话", danger: true, fn: async () => { if (await modalConfirm("删除对话", "确定删除整个对话?", "删除", true)) { await jsend("DELETE", `/api/conversations/${S.convId}` + q(), { tutor: S.tutor }); showEmpty(); loadConvs(); } } },
  ]);
}

// ---------- 账户菜单(点用户名)----------
function accountMenu() {
  const r = $("userRow").getBoundingClientRect();
  showMenu(r.left, r.bottom + 4, [
    { label: "修改昵称", fn: changeNickname },
    { label: "修改密码", fn: changePassword },
    { label: "退出登录", danger: true, fn: async () => { await fetch("/api/logout", { method: "POST" }); location.href = "/login"; } },
  ]);
}
async function changeNickname() {
  const r = await modal({ title: "修改昵称", fields: [{ name: "nickname", label: "昵称", value: S.nickname || "" }], okText: "保存" });
  if (!r) return;
  const { account } = await jsend("POST", "/api/account/nickname", { nickname: r.nickname.trim() });
  S.nickname = account.nickname;
  $("userName").textContent = S.nickname || S.user;
}
async function changePassword() {
  await modal({
    title: "修改密码",
    fields: [{ name: "old", label: "原密码", type: "password" }, { name: "neu", label: "新密码", type: "password" }],
    okText: "保存",
    onSubmit: async (v) => {
      if (!v.neu) return "新密码不能为空";
      try { await jsend("POST", "/api/account/password", { oldPassword: v.old, newPassword: v.neu }); }
      catch (e) { return e.message || "修改失败"; }
      return null;
    },
  });
}
$("userRow").onclick = accountMenu;

// ---------- 上传 ----------
$("plus").onclick = () => $("fileInput").click();
$("fileInput").onchange = async (e) => {
  for (const f of [...e.target.files].slice(0, 6)) {
    if (f.size > 8 * 1024 * 1024) { alert(`${f.name} 超过 8MB`); continue; }
    const url = await new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(f); });
    S.files.push({ filename: f.name, mime: f.type || "application/octet-stream", url });
  }
  e.target.value = "";
  renderFiles();
};
function renderFiles() {
  const el = $("files");
  el.innerHTML = "";
  S.files.forEach((f, i) => {
    const c = document.createElement("div");
    c.className = "chip";
    c.innerHTML = `<span></span><button>✕</button>`;
    c.querySelector("span").textContent = f.filename;
    c.querySelector("button").onclick = () => { S.files.splice(i, 1); renderFiles(); };
    el.appendChild(c);
  });
}

// ---------- 输入框 ----------
const input = $("input");
function autosize() { input.style.height = "auto"; input.style.height = Math.min(input.scrollHeight, 180) + "px"; }
input.addEventListener("input", autosize);
input.addEventListener("keydown", (e) => {
  if (e.key !== "Enter") return;
  if (e.isComposing || e.keyCode === 229) return; // 输入法组字中:回车用于上屏,不发送
  if (e.shiftKey) return; // shift+回车:默认换行
  if (e.altKey) { // option+回车:手动插入换行
    e.preventDefault();
    const s = input.selectionStart, en = input.selectionEnd;
    input.value = input.value.slice(0, s) + "\n" + input.value.slice(en);
    input.selectionStart = input.selectionEnd = s + 1;
    autosize();
    return;
  }
  e.preventDefault(); send(); // 回车:发送
});
// ---------- 侧边栏折叠偏好 + 响应式 ----------
// <640 = 窄屏手机:覆盖抽屉、选完自动收起;≥640 平板/桌面:推开式常驻,不自动收起
const isMobile = () => window.innerWidth <= 640;
function setCollapsed(c) {
  document.body.classList.toggle("collapsed", c);
  localStorage.setItem("sidebar", c ? "collapsed" : "expanded");
}
function initSidebar() {
  let pref = localStorage.getItem("sidebar");
  if (!pref) { pref = isMobile() ? "collapsed" : "expanded"; localStorage.setItem("sidebar", pref); }
  document.body.classList.toggle("collapsed", pref === "collapsed");
}
function closeSidebarOnMobile() { if (isMobile()) setCollapsed(true); }
const toggleSidebar = () => setCollapsed(!document.body.classList.contains("collapsed"));
$("toggleSide").onclick = toggleSidebar;
$("toggleSideIn").onclick = toggleSidebar; // 侧边栏内的收起按钮,效果同顶栏那个
$("backdrop").onclick = () => setCollapsed(true);
function newChat() { abortCurrent(); showEmpty(); closeSidebarOnMobile(); }
$("newChat").onclick = newChat;

// ---------- 快捷键:新建对话(仅电脑,不显性提示;悬停铅笔图标才显示)----------
(function initShortcut() {
  const desktop = matchMedia("(hover:hover) and (pointer:fine)").matches;
  if (!desktop) return; // 触屏设备(手机/平板)不启用
  const isMac = /Mac/i.test(navigator.userAgentData?.platform || navigator.platform || "");
  $("newChat").title = isMac ? "新建对话（⌘+Shift+K）" : "新建对话（Ctrl+Shift+K）";
  window.addEventListener("keydown", (e) => {
    const mod = isMac ? e.metaKey : e.ctrlKey;
    if (mod && e.shiftKey && !e.altKey && e.code === "KeyK") { // K 不分大小写
      e.preventDefault();
      newChat();
    }
  });
})();

// ---------- 麦克风:浏览器自带语音识别(Web Speech API)----------
(function initMic() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const mic = $("mic");
  if (!SR) { mic.style.display = "none"; return; }
  mic.style.display = "";
  let rec = null, listening = false, base = "";
  mic.onclick = () => {
    if (listening) { rec && rec.stop(); return; }
    rec = new SR();
    rec.lang = "zh-CN"; rec.interimResults = true; rec.continuous = true;
    base = input.value ? input.value + " " : "";
    rec.onresult = (e) => {
      let t = "";
      for (let i = 0; i < e.results.length; i++) t += e.results[i][0].transcript;
      input.value = base + t; autosize();
    };
    rec.onend = () => { listening = false; mic.classList.remove("rec"); };
    rec.onerror = () => { listening = false; mic.classList.remove("rec"); };
    try { rec.start(); listening = true; mic.classList.add("rec"); } catch {}
  };
})();

// ---------- 启动 ----------
(async function init() {
  let me;
  try { me = await jget("/api/me"); } catch { location.href = "/login"; return; }
  S.user = me.userId;
  S.nickname = me.nickname || "";
  $("userName").textContent = S.nickname || me.userId;
  setTheme(me.prefs?.theme || "dark");
  initSidebar();
  if (!(await claimPresence())) { location.href = "/login?full=1"; return; }
  try { S.tutors = (await jget("/api/tutors")).tutors; } catch { S.tutors = []; }
  renderTutors();
  if (S.tutors.length) await selectTutor(S.tutors[0]);
  else $("log").innerHTML = '<div class="wrap"><p style="color:var(--sub)">courses/ 里还没有导师文件夹</p></div>';
  updateSendBtn();
})();
