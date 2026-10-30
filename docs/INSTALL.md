# INSTALL — 把 LeziBench 装成 Agent Skill

> 本页所有“实测”标注都来自本机 Windows 11 + Node v24.20.0 + DSH 桌面端的真实执行，日志在 `evidence/host/HOST_TRIAL.md`。
> 证据口径见 `docs/COMPATIBILITY.md`。**未实测的写法一律不会出现在本页。**

## 0. 先看这条（最容易踩的坑）

**Skill 名字是 `lezi-bench`，不是 `lezibench`。**

Agent Skills 规范要求 frontmatter 的 `name` 必须与父目录名完全一致，所以：

| 项 | 正确 | 错误 |
|---|---|---|
| 目录名 | `lezi-bench/` | `lezibench/`、`LeziBench/`、`lezi_bench/` |
| `name:` 字段 | `lezi-bench` | `lezibench`、`LeziBench` |
| 用户调用 | `/lezi-bench` | `/lezibench` |

装错名字的后果不是报错，而是 **DSH 静默跳过这个 skill**，模型侧完全看不到——你会以为装上了，其实没有。

## 1. 环境要求

| 项 | 要求 | 说明 |
|---|---|---|
| Node.js | **>= 18.17.0** | 本机实测 v24.20.0；用 `node --version` 确认 |
| npm 依赖 | **零** | 无 `node_modules`、无构建步骤，纯 ESM 源码 |
| 网络 | **不需要** | 全程离线；判分与报告都在本地 |
| 磁盘 | 约 1 MB | 题库 + 判分器 + 报告生成器 |
| 写权限 | 安装目录可写 | 安装器会在装后做一次真实 `doctor` 写探针 |

检查 Node：

```bash
node --version     # 应输出 v18.17.0 或更高（必须 >= 18.17.0，与 package.json engines 一致）
```

## 2. 四种安装方式

> **最省事的一种**：把 `docs/ONE_COMMAND.md` 里那段话整段复制给 Agent，它自己下载、校验、安装、开考。
> 下面三种是"你自己动手敲一条命令"的版本。

### 2.0 方式 0（推荐）：一句话交给 Agent

见 **[docs/ONE_COMMAND.md](ONE_COMMAND.md)**。适合不想自己开终端的用户，也是首次体验的默认路径。

### 2.1 方式 A：用户级 `~/.agents/skills/`（不带参数时的自动回落位置）

装到 DSH 的**用户级活根**（rank 500）。一次安装，所有工作区可用。

**Windows（PowerShell）**

```powershell
# 在解压出来的 LeziBench 目录里执行
powershell -ExecutionPolicy Bypass -File .\install\install.ps1
```

默认写到 `%USERPROFILE%\.agents\skills\lezi-bench\`。

**macOS / Linux（bash）**

```bash
cd /path/to/lezi-bench-unzipped
bash ./install/install.sh
```

默认写到 `~/.agents/skills/lezi-bench/`。

> **实测结果（v1.4.0，Windows 11 + Node v24.20.0 + PowerShell 5.1 / Git-Bash）**：
> 两条脚本都真实执行成功，装完自动 doctor 通过，重复执行会备份旧版本（保留最近 2 份）。
> 目标位置若是**别的项目的同名目录**，脚本会拒绝（退出码 2）而不是覆盖。
> Linux / macOS 上的同一脚本**本轮未在真机执行**，见 `docs/COMPATIBILITY.md` 的状态标注。

**装后自检（两种系统通用）**

```bash
cd ~/.agents/skills/lezi-bench && node scripts/cli.mjs doctor
```

> 实测结果：两份脚本都 ✅ 自动跑通了 doctor 校验；重复执行会备份旧版本（只保留最近 2 份），不会装出两份。

### 2.2 方式 B（已实测）：工作区级 `<repo>/.agents/skills/`

适合“只想让这个项目里的会话看到这个 skill”，不污染用户目录。rank 200。

```powershell
# Windows
cd "C:\path\to\乐子跑分"
powershell -ExecutionPolicy Bypass -File .\install\install.ps1 -TargetDir "C:\path\to\乐子跑分\.agents\skills"
```

```bash
# macOS / Linux
cd /path/to/乐子跑分
bash ./install/install.sh --target "$(pwd)/.agents/skills"
```

**关键前提**：DSH 的 `projectRoot` = 最近的含 `.git` 的祖先目录；**没有 `.git` 时退回当前工作目录 cwd**。
本仓库当前**没有** `.git`，所以只有“在仓库根目录开会话”时 `.agents/skills/` 才会被扫到。
如果你把它放进一个有 `.git` 的仓库，就应当在那个仓库根目录下工作。

> 实测说明：工作区级安装本身通过了结构校验 + doctor；但它与用户级同名同内容，**无法单独区分是哪一份被加载**。rank 200 优先于 500 的行为来自 `PLATFORM_NOTES.md` §2.2 的文档核实，未做“只留工作区级”的隔离实验。

### 2.3 方式 C（已实测，通用）：复制到任意 skill 根

任何符合 Agent Skills 规范的宿主，只要它扫描某个 `skills/` 根目录，都可以用同样结构装进去：

```bash
# 通用形式：把 lezibench/ 的内容放进 <skill-root>/lezi-bench/
mkdir -p /path/to/skill-root/lezi-bench
cp -R lezibench/SKILL.md lezibench/package.json lezibench/scripts lezibench/src /path/to/skill-root/lezi-bench/
```

或用安装器一步到位（自定义根目录就是它）：

```bash
bash ./install/install.sh --target /path/to/skill-root       # 得到 /path/to/skill-root/lezi-bench/
powershell -File .\install\install.ps1 -TargetDir "D:\some\skills"
```

**约束（三条，缺一不可）**：
1. 目录名必须是 `lezi-bench`；
2. `SKILL.md` 必须在该目录**第一层**（宿主不扫嵌套的 `**/SKILL.md`）；
3. `scripts/` 与 `src/` 必须与 `SKILL.md` 同层（`cli.mjs` 用 `../src/` 相对路径导入，挪位置会直接崩）。

## 3. 安装器都做了什么

**只有一份实现**：`scripts/install.mjs`。
`install/install.sh`（bash）与 `install/install.ps1`（PowerShell）都是**薄包装**，
只负责找到 `node`、把参数转过去 —— 所以不存在"两种平台两套行为"的漂移。

```
node scripts/cli.mjs install [--target <技能根目录>] [--force] [--uninstall] [--json]
```

1. **选技能根**：不传 `--target` 时，按顺序找第一个**已存在且可写**的：
   `<cwd>/.agents/skills` → `<cwd>/.dsh/skills` → `$DSH_HOME/skills` → `~/.agents/skills`；
   全都不存在时回落到用户级 `~/.agents/skills`（不会往你当前项目里乱建目录）。
2. **目录名固定为 `lezi-bench`**（写错宿主会静默跳过）。
3. **幂等 + 安全**：
   - 目标不存在 → 直接装；
   - 目标是本 skill（`package.json` 的 `name === "lezi-bench"`）→ 先备份成 `lezi-bench.bak-<UTC时间戳>`（只留最近 2 份）再替换；
   - 目标存在但**不是**本 skill → **拒绝**，退出码 2，一个文件都不动；确认要覆盖才加 `--force`。
4. **全量复制并逐文件哈希比对**：`SKILL.md` + `package.json` + `scripts/` + `src/` + `adapters/`，
   装完立刻比对源与目标的每个文件哈希，不一致就失败。
5. **真跑 doctor**：用临时 `LEZIBENCH_HOME`（不污染你的默认数据目录）执行一次 `doctor`，
   必须输出「全部通过」，否则退出码 3 —— **装失败不会谎报成功**。

**退出码**：`0` 成功 / `1` 用法错 / `2` 拒绝覆盖别人的同名目录 / `3` 装完校验失败 / `4` 找不到可写技能根。

**不会做的事**：不联网、不改 `PATH`、不写注册表、不装 npm 包、不碰你没有通过参数指定的路径。

### 卸载

```powershell
powershell -ExecutionPolicy Bypass -File .\install\install.ps1 -Uninstall
```
```bash
bash ./install/install.sh --uninstall
# 或者跨平台通用：
node scripts/cli.mjs install --uninstall
```
加 `-TargetDir` / `--target` 可卸载自定义位置。**只删 `lezi-bench/`，备份 `lezi-bench.bak-*` 保留**（可回滚）。

## 4. 验证安装成功

### 4.1 结构验证（不依赖宿主）

```bash
node scripts/sync-skill.mjs --check
```

它会检查：frontmatter 合法、`name == 父目录名`、`description` 长度与触发词、`license`、`compatibility ≤500`、`allowed-tools` 不是 YAML 列表、没有 `disable-model-invocation: true`、正文非空且覆盖全部子命令、`scripts/` 与 `src/` 同层、与仓库根 `SKILL.md` 逐字节一致、`doctor` 退出码 0。

通过时最后一行是 `总体：全部通过`。

### 4.2 宿主侧验证（最硬的一条）

在 DSH 里**新开一个会话**（或重启桌面端），然后看模型可用的 skill 目录里是否出现 `lezi-bench`。

**实测**：本会话在安装后，skill 目录中直接出现了 `lezi-bench` 条目；把它改名成 `lezibench` 后目录里显示 `lezibench`，改回 `lezi-bench` 后又显示 `lezi-bench`。这是“DSH 真的发现了这个目录”的一手证据。

模型侧也可以直接调用（参数是精确的 skill 名）：

```json
{"name": "lezi-bench"}
```

用户侧则是在输入里出现空白分隔的 `/lezi-bench` token。

### 4.3 手工试跑

```bash
cd ~/.agents/skills/lezi-bench
node scripts/cli.mjs doctor
node scripts/cli.mjs start --mode standard --json     # 看一眼第 1 批题目就够
```

> 想彻底验证跑通一局，见 `evidence/host/HOST_TRIAL.md` 的完整命令流水。

## 5. 数据目录

默认位置（可用环境变量 `LEZIBENCH_HOME` 覆盖）：

| 系统 | 默认 |
|---|---|
| Windows | `%LOCALAPPDATA%\LeziBench` |
| macOS | `~/Library/Application Support/LeziBench` |
| Linux | `$XDG_DATA_HOME/lezibench` 或 `~/.local/share/lezibench` |

每次运行的东西（`state.json`、原始答案、报告）全部落在 `<数据目录>/runs/<runId>/` 下。

```bash
# 想装完不碰默认目录，临时换个位置
LEZIBENCH_HOME=/tmp/lezi node scripts/cli.mjs doctor         # macOS / Linux
$env:LEZIBENCH_HOME="D:\lezi"; node scripts/cli.mjs doctor    # Windows PowerShell
```

## 6. 常见问题

| 现象 | 原因 | 处理 |
|---|---|---|
| skill 目录里看不到它 | 目录名 ≠ `name`，或 frontmatter 非法 | 跑 `node scripts/sync-skill.mjs --check`；DSH 对非法 skill 是**静默跳过**，只留一条 warning |
| `/lezi-bench` 报 unknown | 同上；或名字写成了 `/lezibench` | 确认目录叫 `lezi-bench`、`name: lezi-bench` |
| `doctor` 报数据目录不可写 | 数据目录权限 / 磁盘只读 | 用 `LEZIBENCH_HOME` 指到一个可写目录再试 |
| `doctor` 报 Node 版本 | Node < 18.17.0 | 升级到 Node >= 18.17.0 |
| 安装器说 name 不一致 | `SKILL.md` 被改过 | 不要改 `name` 字段；它必须恒等于 `lezi-bench` |
| 改了 `src/` 但行为没变 | 只更新了仓库、没重装 | 重新跑一次安装器（它是全量复制 + 哈希校验） |

## 7. 没有验证过的安装方式

以下写法**本次未实测**，本文档不提供、也不建议照抄：

- `npx lezi-bench` / `npm link lezi-bench`（`package.json` 里确实声明了 `"bin": {"lezi-bench": "scripts/cli.mjs"}`，但本机没执行过 npm 安装链路）。
- 任何 OpenClaw / Codex 专有的安装命令或目录（见 `docs/COMPATIBILITY.md`，两者均 `NOT_TESTED`）。

需要这些平台时，请先按该平台官方文档核实，不要把本文档的 DSH 路径套过去。
