#!/usr/bin/env bash
# 全局 PDF 生成器(给 tutor 用)。用法: mkpdf.sh 源.typ 输出.pdf
# 只产出一个 PDF;模板临时拷到源文件旁边,便于 #import "template.typ"。
set -euo pipefail
KIT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC="${1:?用法: mkpdf.sh 源.typ 输出.pdf}"
OUT="${2:?用法: mkpdf.sh 源.typ 输出.pdf}"
SRCDIR="$(cd "$(dirname "$SRC")" && pwd)"
cp -f "$KIT/template.typ" "$SRCDIR/template.typ"
mkdir -p "$(dirname "$OUT")"
typst compile --ignore-system-fonts --font-path "$KIT/fonts" --root "$SRCDIR" "$SRC" "$OUT"
echo "✓ 生成 $OUT"
