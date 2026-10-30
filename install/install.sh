#!/usr/bin/env bash
# LeziBench 安装器（bash）—— 只是 `node scripts/cli.mjs install` 的薄包装。
#
# 真正的安装逻辑只有一份，在 scripts/install.mjs 里。
# 这里刻意不重复实现（两套逻辑必然漂移，v1.3.0 就是文档写了、脚本却不存在）。
#
# 用法：
#   bash ./install/install.sh                          # 自动挑选可写的技能根
#   bash ./install/install.sh --target ~/.agents/skills
#   bash ./install/install.sh --force                  # 覆盖非本项目的同名目录
#   bash ./install/install.sh --uninstall              # 卸载（保留备份）
#
# 退出码：0 成功 / 1 用法错 / 2 拒绝覆盖别人的目录 / 3 校验失败 / 4 找不到可写技能根
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cli="$here/../scripts/cli.mjs"

if ! command -v node >/dev/null 2>&1; then
  echo "✘ 没有找到 node。LeziBench 需要 Node.js >= 18.17.0（零 npm 依赖，不需要 npm install）。" >&2
  echo "  下载：https://nodejs.org/  （或装好后重跑本脚本）" >&2
  exit 4
fi

if [ ! -f "$cli" ]; then
  echo "✘ 找不到 $cli —— 请确认是在解压出来的 LeziBench 目录里运行本脚本。" >&2
  exit 1
fi

exec node "$cli" install "$@"
