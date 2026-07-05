#import "../template.typ": report

#show: report.with(
  title: "图片插入测试",
  date: "2026-07-05",
)

= 测试一:外部截图(竖版彩色)

下面插入一张 1080×1546 的竖版截图。图片是位图,保留原色,不受“白纸黑字”
文字规则影响。竖版图用较小宽度(此处 55%),避免占满整页。

#figure(
  image("screenshot.png", width: 55%),
  caption: [豆包助教对话截图(原始彩色截图)],
)

= 测试二:matplotlib 曲线(竖排 y 轴)

#figure(
  image("plot.png", width: 75%),
  caption: [阻尼正弦曲线,y 轴标签已竖排],
)

正文继续排在图后,内容顺流而下,不会被图挤出空白。
