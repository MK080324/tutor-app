// ============================================================================
// pdfkit 标准模板 —— 白纸黑字 · 克制留白 · 可复现
// ----------------------------------------------------------------------------
// 用法(在你的 .typ 文档顶部):
//   #import "template.typ": report
//   #show: report.with(title: "标题", author: "作者", date: "2026-07-02")
//   = 第一节
//   正文……
// ----------------------------------------------------------------------------
// 设计原则:
//   · 只用黑色(#000)+ 白底,不引入任何强调色。
//   · 内容自上而下顺排,图表就地摆放、不浮动 —— 杜绝“莫名其妙的空白页”。
//   · 字体全部来自 typst 内嵌 或 项目 fonts/ 目录,跨机器渲染一致。
// ============================================================================

// —— 字体常量:西文优先、中文回退 ——————————————————————————————————————
#let SERIF  = ("Libertinus Serif", "Noto Serif CJK SC")   // 正文 / 标题
#let MONO   = ("DejaVu Sans Mono", "Noto Sans CJK SC")    // 代码 / 等宽

#let report(
  title: none,
  author: none,
  date: none,
  // 章节是否自动编号(1 / 1.1 / 1.1.1)。默认关闭,报告类文档更干净。
  numbered: false,
  // 正文字号与纸张,可按需覆盖。
  size: 11pt,
  paper: "a4",
  body,
) = {
  // —— 页面 ——
  set page(
    paper: paper,
    margin: (x: 2.5cm, y: 2.5cm),
    numbering: "1",          // 页脚居中页码;纯黑
    number-align: center,
  )

  // —— 正文文本:黑字、中文断行 ——
  set text(
    font: SERIF,
    size: size,
    fill: black,
    lang: "zh",
    region: "cn",
  )

  // —— 段落:两端对齐、行距舒适、段间距代替首行缩进 ——
  set par(justify: true, leading: 0.8em, spacing: 1.2em)

  // —— 标题:仅用字号与加粗区分层级,不上色 ——
  set heading(numbering: if numbered { "1.1" } else { none })
  show heading: it => block(above: 1.4em, below: 0.8em, text(fill: black, it))
  show heading.where(level: 1): set text(size: 1.5em, weight: "bold")
  show heading.where(level: 2): set text(size: 1.25em, weight: "bold")
  show heading.where(level: 3): set text(size: 1.1em, weight: "bold")

  // —— 链接:黑色 + 下划线,不用蓝色 ——
  show link: it => underline(text(fill: black, it))

  // —— 行内代码 & 代码块:等宽、单色(关闭语法高亮的彩色)——
  show raw: set text(font: MONO, size: 0.92em)
  set raw(theme: none)                       // 关闭主题色 => 纯黑代码
  show raw.where(block: true): it => block(
    width: 100%,
    fill: luma(245),                         // 极浅灰底,仅作区隔,非“颜色”
    inset: 8pt,
    radius: 2pt,
    it,
  )

  // —— 图:居中,题注为“图 N”,不浮动(就地渲染)——
  set figure(supplement: [图])
  show figure.caption: set text(size: 0.9em)

  // —— 表:题注为“表 N”,细黑线 ——
  set table(stroke: 0.5pt + black)

  // —— 列表间距收紧 ——
  set list(spacing: 0.65em)
  set enum(spacing: 0.65em)

  // —— 标题块(如提供 title)——
  if title != none {
    align(center)[
      #text(size: 1.9em, weight: "bold")[#title]
      #if author != none [ \ #v(0.6em) #text(size: 1em)[#author] ]
      #if date   != none [ \ #v(0.3em) #text(size: 0.9em)[#date] ]
    ]
    v(1.5em)
  }

  body
}
