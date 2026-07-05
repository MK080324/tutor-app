# pdfkit —— PDF 生成工具集(给 LLM 的说明书)

你(LLM)拥有一套生成 PDF 的固定工具。**只允许用这套工具生成 PDF**,不要
自己发明其它方式(不要写 LaTeX、不要调浏览器、不要用 python 拼 PDF)。
本文件是完整契约,照做即可产出:**白纸黑字、克制留白、必要时带图**的 PDF。

---

## 1. 你有什么

| 组件 | 作用 |
|------|------|
| `typst`(引擎) | 把 `.typ` 源码编译成 PDF。单文件二进制,跨机器一致。 |
| `template.typ` | 标准样式模板。锁死了黑白配色、字体、留白、图表样式。 |
| `build.sh` | **唯一构建入口**。编译 + 自动验证(页数 / 空白页 / 预览图)。 |
| `fonts/` | 打包的中文字体(Noto Serif/Sans CJK SC)。保证服务器上也有中文。 |
| `examples/report.typ` | 一份可直接模仿的完整范例。 |

底层辅助(一般不用手动碰):`pdfinfo`(读信息)、`pdftoppm`(转预览图)、
`gs`(合并/压缩)。

---

## 2. 工作流(每次生成 PDF 都这样做)

1. **写一个 `.typ` 文件**,顶部固定这样开头:

   ```typst
   #import "template.typ": report
   #show: report.with(
     title: "你的标题",       // 不需要标题页就删掉这三行
     author: "作者",
     date: "2026-07-02",
     numbered: true,          // 章节自动编号 1 / 1.1;不要就设 false 或删掉
   )

   = 第一节
   正文……
   ```

   > 路径提示:`#import` 的路径相对该 `.typ` 文件。若文件放在项目根,写
   > `"template.typ"`;若放在子目录,写 `"../template.typ"`。

2. **编译并验证**,只用这一个命令:

   ```bash
   ./build.sh 你的文件.typ  out/你的文件.pdf
   ```

   它会打印页数与尺寸,把每页转成 `out/preview/*.png`,并对疑似空白页告警。

3. **(推荐)看预览图自检**:确认没有空白页、没有文字溢出页面、中文没有
   变成缺字方块(豆腐块)。若你是多模态模型,直接读取 `out/preview/*.png`。

---

## 3. 必须遵守的规则(这些决定成品质量)

- **不加颜色**。模板已强制全黑文字 + 白底。不要设置任何 `fill: red` 之类的
  颜色,不要用彩色高亮。代码块是极浅灰底(仅作区隔),这是唯一的非纯白。
- **不手动排版留白**。不要用连续的 `#v()`、空段落、`#pagebreak()` 去“凑
  版面”。内容顺着写,typst 自动分页。手动塞空白正是空白页的来源。
- **图表就地插入**,用原生语法(见下),不要期待它“浮动”到别处。
- **图片必须是文件**,放在 `.typ` 同目录再引用(细节见 3.5 画图 / 3.6 插入)。
  你**自己画**的图(matplotlib)要单色;**外部位图**(截图/照片)保留原色。
- **字体不要改**。模板已选好西文+中文字体;换字体会破坏服务器可复现性。
- **有疑问就模仿 `examples/report.typ`**。它覆盖了标题、章节、列表、表格、
  代码、数学、图片全部元素。

---

## 3.5 画图约定(matplotlib)

用 matplotlib 生成图时,严格照下面写,产出的图才和白纸黑字的正文协调:

- **单色**:曲线 `color="black"`,网格 `color="0.85"`;不要用彩色。
- **单字母轴标签立正**:`y`、`x` 这类单字母标签用 `rotation=0`,让字母正常
  朝向,**不要旋转成躺倒**。y 轴还要 `ha="right", va="center", labelpad=8`
  让它贴在轴左侧居中。
- **去掉上/右边框**:`for s in ["top","right"]: ax.spines[s].set_visible(False)`。
- **收边再存**:`fig.tight_layout()` 后 `fig.savefig("图名.png", dpi=150)`。

标准模板(直接抄):

```python
import matplotlib; matplotlib.use("Agg")
import matplotlib.pyplot as plt, numpy as np
fig, ax = plt.subplots(figsize=(5, 3))
ax.plot(x, y, color="black", lw=1.2)
ax.set_xlabel("x")
ax.set_ylabel("y", rotation=0, ha="right", va="center", labelpad=8)  # 字母立正
ax.grid(True, color="0.85", lw=0.5)
for s in ["top", "right"]: ax.spines[s].set_visible(False)
fig.tight_layout(); fig.savefig("plot.png", dpi=150)
```

## 3.6 图片插入约定

- **图片文件必须和引用它的 `.typ` 放同一目录**(或用相对该 `.typ` 的相对
  路径)。`image("plot.png")` 的路径是相对 `.typ` 文件解析的,不是相对当前
  终端目录。生成图后先把 `.png` 落到 `.typ` 同目录,再引用。
- **位图保留原色**:截图、照片等位图不受“白纸黑字”规则约束,原样嵌入。
  只有 matplotlib 这类**由你生成**的图才要求画成单色(见 3.5)。
- **控制宽度防溢出**:竖版图用较小宽度(如 `width: 55%`),横版图 `width: 75%`
  左右。用 `#figure(image(...), caption: [...])` 带题注,不要裸插 `image()`。

---

## 4. Typst 语法速查(够用了)

```typst
= 一级标题        == 二级标题        === 三级标题
*加粗*   _斜体_   `行内代码`
- 无序项          + 有序项
$E = m c^2$              // 行内数学
$ integral_0^1 x dif x $ // 独立成行的数学(前后留空格)

// 表格
#figure(
  table(
    columns: 3,
    align: (left, center, right),
    [表头1],[表头2],[表头3],
    [a],[b],[c],
  ),
  caption: [表题],
)

// 图片(路径相对本 .typ 文件)
#figure(
  image("plot.png", width: 75%),
  caption: [图题],
)

// 引用块
#quote[被引用的一段话。]
```

---

## 5. 在服务器上复现这套机制(部署 opencode sdk 时做一次)

整个 `pdfkit/` 目录连同 `fonts/` 一起拷到服务器即可,唯一需要额外装的是
`typst` 引擎本身:

```bash
# 方式一:包管理器
brew install typst                 # macOS
# 或 Linux:
#   下载官方静态二进制(推荐,零依赖):
curl -fsSL https://github.com/typst/typst/releases/latest/download/typst-x86_64-unknown-linux-musl.tar.xz \
  | tar -xJ && sudo mv typst-*/typst /usr/local/bin/

# 验证工具链
typst --version
typst fonts --ignore-system-fonts --font-path fonts | grep Noto   # 应看到 Noto Serif/Sans CJK SC
```

`build.sh` 里已写死 `--ignore-system-fonts --font-path fonts`,所以**服务器
上有没有别的字体都不影响**——同一份 `.typ` 在任何机器上渲染结果一致。

预览/空白页检测依赖 `pdfinfo`、`pdftoppm`(poppler)与 `Pillow`;缺了不影响
出 PDF,只是跳过自检。若要在服务器保留自检:
`apt-get install poppler-utils && pip install Pillow`。

---

## 6. 一句话交给上游

> “你要生成 PDF 时:进入 `pdfkit/` 目录,按 `TOOLKIT.md` 写一个 `.typ`
> 文件,然后运行 `./build.sh 文件.typ out/文件.pdf`。只用这套工具,遵守
> 其中的规则(黑白、不手动凑留白、图用文件)。”
