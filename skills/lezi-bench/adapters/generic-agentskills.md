# 通用 Agent Skills 宿主 — **PARTIAL**

> **已验证**：包结构、frontmatter 完全符合 <https://agentskills.io/specification>。
> **未验证**：除 DSH 之外，没有在任何其他宿主上实跑过。

## 1. 规范符合性（逐条对照，已核实）

规范来源：<https://agentskills.io/specification>（HTTP 200，233,466 bytes，访问于 2026-10-29T15:49Z）。

| 规范项 | 要求 | 本包 | 结论 |
|---|---|---|---|
| 目录结构 | `<name>/SKILL.md`（+ 可选 `scripts/` `references/` `assets/`） | `lezi-bench/SKILL.md` + `scripts/` + `src/` | ✔ |
| `name` | 1–64，`[a-z0-9-]`，不以 `-` 开头/结尾，无连续 `--`，**等于父目录名** | `lezi-bench`（10 字符） | ✔ |
| `description` | 1–1024，非空，说明“做什么 + 何时用” | 189 字符，含 跑分/评测/LeziBench/能力体检 | ✔ |
| `license` | 可选 | `MIT` | ✔ |
| `compatibility` | 可选，≤500 | 112 字符 | ✔ |
| `metadata` | 可选，key/value 均 string | 未使用 | ✔ |
| `allowed-tools` | 可选，**空格分隔字符串**（实验性） | 未声明 | ✔ |

> 已知反例警示：本机 `~/.agents/skills/impeccable/SKILL.md` 把 `allowed-tools` 写成了 YAML 列表，**不符合规范**，本项目没有照抄。

## 2. 安装（通用形式，已实测）

任何扫描某个 `skills/` 根目录的宿主，都可以按下面装：

```bash
# 手工
mkdir -p /path/to/skill-root/lezi-bench
cp -R lezibench/SKILL.md lezibench/package.json lezibench/scripts lezibench/src /path/to/skill-root/lezi-bench/

# 或用安装器
bash ./install/install.sh --target /path/to/skill-root
powershell -File .\install\install.ps1 -TargetDir "D:\path\to\skill-root"
```

三条硬约束：
1. 目录名必须是 `lezi-bench`；
2. `SKILL.md` 必须在包的第一层；
3. `scripts/` 与 `src/` 必须与 `SKILL.md` 同层（`cli.mjs` 用 `../src/` 相对导入）。

## 3. 运行时要求

| 项 | 要求 |
|---|---|
| Node.js | >= 18（本机 v24.20.0 实测） |
| npm 依赖 | 无（纯 ESM，零 `node_modules`） |
| 网络 | 不需要 |
| 可用工具 | 能执行 shell 命令 / 能读写本地文件即可；不需要外部 API |

## 4. 未验证的边界（必须如实转述）

- ❓ 其他宿主是否**只扫一层**（DSH 是；别的平台未验证）；
- ❓ 其他宿主如何处理同名冲突、非法 frontmatter（DSH 是“静默跳过”，别的未验证）；
- ❓ `allowed-tools` 在其他宿主上是否被真正执行（规范标为实验性）；
- ❓ 用户侧斜杠命令的语法是否也是 `/lezi-bench`（DSH 是；别的未验证）。

因此对外只能说：**“符合 Agent Skills 规范”**，不能说 **“在某平台测试通过”**（DSH 除外）。

## 5. 报告产物与宿主无关

`report --format html` 生成的是**自包含 HTML**（零外链、无 CDN、无远程字体、无追踪脚本），`file://` 双击即可打开。
所以无论宿主是什么，用户都能拿到本地可读的报告——不依赖任何在线页面。
