#!/usr/bin/env bash
# ============================================================================
# pdfkit 构建器 —— 把一个 .typ 编译成 PDF,并自动验证产物质量。
#   用法:  ./build.sh 文档.typ  [输出.pdf]
#   例:    ./build.sh examples/report.typ out/report.pdf
#
# 这个脚本是整套机制的“唯一入口”。它保证:
#   1. 始终 --ignore-system-fonts + --font-path fonts  => 跨机器一致渲染。
#   2. 编译后用 pdfinfo 报告页数/尺寸。
#   3. 把每一页转成 PNG 存到 out/preview/,便于肉眼(或多模态 LLM)检查
#      是否有空白页、溢出、缺字(豆腐块)。
# 依赖:typst、pdfinfo、pdftoppm(均已在本机)。
# ============================================================================
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC="${1:?用法: ./build.sh 文档.typ [输出.pdf]}"
OUT="${2:-out/$(basename "${SRC%.typ}").pdf}"

mkdir -p "$(dirname "$OUT")"

echo "▶ 编译 $SRC → $OUT"
typst compile \
  --ignore-system-fonts \
  --font-path "$HERE/fonts" \
  --root "$HERE" \
  "$SRC" "$OUT"

echo "▶ 产物信息"
pdfinfo "$OUT" | grep -E '^(Pages|Page size|File size):'

# —— 逐页转 PNG 预览,便于检查空白/溢出/缺字 ——
PREV="$(dirname "$OUT")/preview/$(basename "${OUT%.pdf}")"
mkdir -p "$(dirname "$PREV")"
rm -f "${PREV}"-*.png
pdftoppm -r 110 -png "$OUT" "$PREV" >/dev/null 2>&1
echo "▶ 预览图: $(dirname "$PREV")/  ($(ls "${PREV}"-*.png 2>/dev/null | wc -l | tr -d ' ') 页)"

# —— 空白页粗检:整页近乎纯白则告警(需 Pillow,没有则自动跳过)——
python3 - "$OUT" "${PREV}" <<'PY' || true
import sys, glob, subprocess
out, prev = sys.argv[1], sys.argv[2]
pages = sorted(glob.glob(prev + "-*.png"))
try:
    from PIL import Image
except Exception:
    sys.exit(0)  # 没装 Pillow 就跳过,不影响构建
for p in pages:
    im = Image.open(p).convert("L")
    hist = im.histogram()
    dark = sum(hist[:230])           # 非近白像素数
    total = im.width * im.height
    frac = dark / total
    if frac < 0.005:
        print(f"⚠ 疑似空白页: {p}  (非白像素仅 {frac*100:.2f}%)")
PY

echo "✓ 完成"
