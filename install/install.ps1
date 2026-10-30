<#
.SYNOPSIS
  LeziBench 安装器（Windows PowerShell）—— 只是 `node scripts/cli.mjs install` 的薄包装。

.DESCRIPTION
  真正的安装逻辑只有一份，在 scripts/install.mjs 里。
  这里刻意不重复实现（两套逻辑必然漂移，v1.3.0 就是文档写了、脚本却不存在）。

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\install\install.ps1

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\install\install.ps1 -TargetDir "$env:USERPROFILE\.agents\skills"

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\install\install.ps1 -Uninstall

.NOTES
  退出码：0 成功 / 1 用法错 / 2 拒绝覆盖别人的目录 / 3 校验失败 / 4 找不到可写技能根
#>
[CmdletBinding()]
param(
  [string]$TargetDir,
  [switch]$Uninstall,
  [switch]$Force,
  [switch]$Json
)

$ErrorActionPreference = 'Stop'

# 让 node 的 UTF-8 中文输出在本控制台里正常显示（Windows PowerShell 5.1 默认是 GBK 代码页）
try {
  [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
  $OutputEncoding = [System.Text.Encoding]::UTF8
} catch { }

$here = Split-Path -Parent $MyInvocation.MyCommand.Definition
$cli = Join-Path $here '..\scripts\cli.mjs'

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Host "X 没有找到 node。LeziBench 需要 Node.js >= 18.17.0（零 npm 依赖，不需要 npm install）。" -ForegroundColor Red
  Write-Host "  下载：https://nodejs.org/  （或装好后重跑本脚本）"
  exit 4
}

if (-not (Test-Path $cli)) {
  Write-Host "X 找不到 $cli —— 请确认是在解压出来的 LeziBench 目录里运行本脚本。" -ForegroundColor Red
  exit 1
}

$cliArgs = @('install')
if ($TargetDir) { $cliArgs += @('--target', $TargetDir) }
if ($Uninstall) { $cliArgs += '--uninstall' }
if ($Force) { $cliArgs += '--force' }
if ($Json) { $cliArgs += '--json' }

& node $cli @cliArgs
exit $LASTEXITCODE
