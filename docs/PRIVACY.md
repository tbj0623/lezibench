# PRIVACY — 隐私说明

> 一句话：**没有服务器，所以没有上传；没有账号，所以没有身份。**
> 剩下只有一个问题 —— 数据存在你机器的哪个位置，怎么删干净。

---

## 0. 收集什么

| 项目 | 是否收集 | 说明 |
|---|---|---|
| 你的答案 | **只存本地** | 写到本机数据目录，不上传 |
| 账号 / 邮箱 / 手机号 | **不收集** | 没有登录，没有账号体系 |
| 设备指纹 / IP | **不收集** | 没有网络调用，拿不到也不需要 |
| 使用统计 / 埋点 | **不收集** | 代码里没有分析 SDK，网站也没有 |
| 崩溃日志 | **不收集** | 错误只打印到你的终端 |
| 模型名 / Agent 名 | **不采集** | 当前版本不记录任何自报身份字段 |

### 怎么自己验证

```bash
# 在仓库根目录执行，应当没有任何输出
grep -rnE "fetch\(|require\(['\"](http|https|net|dgram)" src/ scripts/
grep -rn "import.*from ['\"]node:http" src/ scripts/
```

整个 `src/` 与 `scripts/` 下没有网络调用。

---

## 1. 数据存在哪

默认按平台选标准位置，可用环境变量 `LEZIBENCH_HOME` 覆盖。
解析逻辑在 `src/storage/store.mjs` 的 `resolveDataRoot()`。

| 平台 | 默认路径 |
|---|---|
| **Windows** | `%LOCALAPPDATA%\LeziBench`<br>通常是 `C:\Users\<你>\AppData\Local\LeziBench` |
| **macOS** | `~/Library/Application Support/LeziBench` |
| **Linux** | `$XDG_DATA_HOME/lezibench`<br>未设置 `XDG_DATA_HOME` 时是 `~/.local/share/lezibench` |
| **任意平台（覆盖）** | `LEZIBENCH_HOME=<你想要的路径>` |

不确定的话直接问 CLI —— `doctor`、`status`、`list` 都会把当前数据目录打印出来：

```bash
node scripts/cli.mjs doctor
# LeziBench 环境自检（数据目录：……）
```

---

## 2. 目录里到底有什么

每次运行会在 `<数据目录>/runs/<runId>/` 下建立这些内容：

```
<数据目录>/
└── runs/
    └── run-20261029-162223-19285b/
        ├── state.json          # 运行状态、版本号、种子、逐题得分与 checks
        ├── answers/
        │   ├── 1-I01.json      # 原始答案 + SHA-256 指纹
        │   ├── 1-R01.json
        │   └── …
        ├── reports/
        │   ├── report.html     # 自包含报告（生成后才有）
        │   ├── report.json
        │   └── report.txt
        └── evidence/
            └── regrade-…/      # 只有跑过 regrade 才会有
                └── before.json
```

| 路径 | 用途 |
|---|---|
| `state.json` | 状态机、已完成批次、逐题得分与 checks、引擎版本、题库指纹。断点续跑靠它 |
| `answers/` | 你交上来的原始答案，逐题一个文件（避免整批重写时丢失），带 SHA-256 指纹供重判时比对 |
| `reports/` | 生成的报告。HTML 是自包含的，可以单独拷走，拷走后与原目录无关 |
| `evidence/` | 只在你跑过 `regrade` 时出现，保存重判前的旧判分轨迹 |

### 报告里会留什么

- **不会回显整段原始答案。** 只保留解析后的结构化字段，字符串截断到 200 字符 ——
  这样分享报告时不会顺带把长篇输入暴露出去。
- **会记录运行环境**，例如 `node v24.20.0 · win32/x64`。这是为了让不同环境下的结果可追溯，
  **不含主机名、用户名或路径**。
- **会记录种子与运行编号**，用于复现。

---

## 3. 怎么删

### 3.1 删掉全部运行记录

直接删数据目录即可。没有注册表项、没有后台服务、没有需要「卸载」的东西。

```powershell
# Windows PowerShell
Remove-Item -Recurse -Force "$env:LOCALAPPDATA\LeziBench"
```

```bash
# macOS
rm -rf ~/Library/Application\ Support/LeziBench

# Linux
rm -rf "${XDG_DATA_HOME:-$HOME/.local/share}/lezibench"
```

### 3.2 只删某一次运行

```bash
node scripts/cli.mjs list                    # 先看有哪些 runId
rm -rf "<数据目录>/runs/run-20261029-162223-19285b"
```

删掉之后 `list` 里就不会再出现这一局，其他运行不受影响。

### 3.3 删掉答案但保留分数

想留报告但不想留原始答案：可以只删 `answers/` 目录。

报告和 `state.json` 里的得分不受影响，但**之后就不能再 `regrade` 了** —— 重判需要从原始答案重算。

### 3.4 清除终端历史

如果在命令行里手输过答案内容，它可能留在 shell 历史里。这一步 LeziBench 管不了，
需要你自己清理（`history -c` / 删除 PowerShell 的 `ConsoleHost_history.txt`）。

---

## 4. 这个网站本身

| 项目 | 情况 |
|---|---|
| 托管 | GitHub Pages 静态托管，纯 HTML / CSS / 一个 JS 文件 |
| 外部资源 | **零**。没有 CDN、没有外部字体、没有图标库、没有分析脚本 |
| Cookie | **零** |
| 浏览器存储 | 仅 `localStorage['lezi-theme']`，值为 `light` 或 `dark` |
| 服务端逻辑 | 无。没有表单提交，没有 API 调用 |
| GitHub 侧 | 访问日志由 GitHub 按其隐私政策处理，与本站代码无关 |

字体用的是系统字体栈（PingFang SC / Microsoft YaHei / Noto Sans CJK 等），
不下载任何字体文件 —— 所以页面在你的机器上长什么样，取决于你装了什么字体。

---

## 5. 做不到的保证

把话说全，免得产生错误预期：

- **我们不控制你的宿主机。** 你在这台机器上跑的 Agent、编辑器、终端记录、系统备份、
  云同步盘，都可能各自留有副本。LeziBench 只保证自己写什么、写到哪。
- **报告一旦分享出去就收不回。** HTML 是普通文件，转发、截图、上传都由你决定。
  分享前请自己看一眼内容。
- **没有加密。** 数据目录里的文件是明文 JSON。如果你的机器本身需要加密，请用磁盘加密。
- **没有云端备份 / 跨设备同步 / 登录找回历史成绩。** 这些都需要一个中心服务器，而我们选择不要。
- **不阻止其他工具读取。** 同一台机器上的其他程序有权限就可以读这个目录（取决于你的系统权限设置）。

---

## 6. 一句话总结

这套东西的隐私模型非常简单：

> **没有服务器，就没有上传；数据在你自己的盘上，删目录就删干净了。**

代价是没有云端备份、没有跨设备同步、也没有「登录后找回历史成绩」——
这些都需要一个中心服务器，而我们选择不要。

---

## 7. 相关文档

- [LIMITATIONS.md](LIMITATIONS.md) —— 完整边界
- [FAQ.md](FAQ.md) —— 常见问题
- `src/storage/store.mjs` —— `resolveDataRoot()` 的实现
