#import "../template.typ": report

#show: report.with(
  title: "示例报告:一份白纸黑字的 PDF",
  author: "pdfkit",
  date: "2026-07-02",
  numbered: true,
)

= 引言

这是一份用来演示 pdfkit 机制的示例文档。它同时包含*中文*与 English，
用来验证跨机器渲染的一致性:西文取自 Libertinus Serif，中文回退到随项目
打包的 Noto Serif CJK SC。全文只有黑色与白底，没有强调色。

段落之间以间距区隔，内容自上而下顺排，图表就地摆放，不会浮动到别处，
因此不会出现莫名其妙的空白页。

= 结构元素

== 列表

- 第一点:纯文本条目。
- 第二点:含行内代码 `typst compile`。
- 第三点:含数学 $E = m c^2$ 与中文混排。

+ 有序列表第一项
+ 有序列表第二项

== 表格

#figure(
  table(
    columns: 3,
    align: (left, center, right),
    [项目], [状态], [数值],
    [编译], [通过], [1],
    [验证], [通过], [42],
  ),
  caption: [一个简单的三列表],
)

== 代码块

```python
def area(r):
    return 3.14159 * r * r   # 单色渲染,无语法高亮彩色
```

== 图片

用原生 `figure(image(...))` 插入带题注的图片(路径相对本文档):

#figure(
  image("plot.png", width: 75%),
  caption: [阻尼正弦曲线(单色示意)],
)

= 结论

只要通过 `build.sh` 编译,产出的 PDF 在本地与服务器上完全一致,
且满足:白纸黑字、克制留白、必要时带图。
