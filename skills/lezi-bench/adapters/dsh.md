# DSH（DeepSeek​ Harness）适配说明 — **VERIFIED**

> 证据：本机 Windows 11 + Node v24.20.0 + DSH 桌面端，2026-10-29T23:55Z ~ 2026-10-30T00:10Z。
> 完整命令流水与输出见 `evidence/host/HOST_TRIAL.md`；结构校验见 `evidence/host/verify-skill.log`。

## 1. 扫描根与优先级（已核实）

来源：`packages/skill/skill-filesystem/README.md`（raw.githubusercontent.com，HTTP 200）。

| Rank | 标签 | 路径 | 本项目状态 |
|---|---|---|---|
| 100 | `project-dsh` | `<projectRoot>/.dsh/skills` | 未使用 |
| 200 | `project-agents` | `<projectRoot>/.agents/skills` | 已安装并验证结构 |
| 300 | `custom` | `Config.customSkillDirs` | 本机未配置（未核实） |
| 400 | `user-dsh` | `<dshHome>/skills`（缺省 `~/.dsh/skills`） | 本机**不存在**，本项目不写这里 |
| 500 | `user-agents` | `<agentsHome>/skills`（缺省 `~/.agents/skills`） | **本机活根，已实测被发现** |
| 600 | bundled | `bundledSkillDir` | 本机未配置（倾向未配置，未完全核实） |

- `projectRoot` = 最近的含 `.git` 的祖先目录；**没有 `.git` 时退回 cwd**。
- 同名冲突：rank 数字小者胜（100 < 200 < 500）。

## 2. 发现规则（决定“为什么我装了却看不到”）

1. 只认两种形态：`<root>/<name>/SKILL.md`（目录包）或 `<root>/<name>.md`（平铺）。
2. **只扫一层**。`<root>/a/b/SKILL.md` 永远不会被发现。
3. 目录包里的 `scripts/`、`src/`、`references/` 改动**不触发**目录刷新；改 `SKILL.md` 或增删包才会。
4. 坏 frontmatter / 非法 `name` / 非法布尔值 → **静默跳过 + 一条 warning**，模型端无法区分“不存在”和“存在但非法”。

**所以装完必须自己验一遍**：`node evidence/host/verify-skill.mjs`。

## 3. 安装（三条命令，全部实测）

```powershell
# A. 用户级（推荐；rank 500，本机实测被发现）
cd "C:\path\to\乐子跑分"
powershell -ExecutionPolicy Bypass -File .\install\install.ps1

# B. 工作区级（rank 200；必须在仓库根目录开会话，因为本仓库没有 .git）
powershell -ExecutionPolicy Bypass -File .\install\install.ps1 -TargetDir "C:\path\to\乐子跑分\.agents\skills"

# C. 任意 skill 根
powershell -ExecutionPolicy Bypass -File .\install\install.ps1 -TargetDir "D:\some\skills"
```

macOS / Linux 对应 `bash ./install/install.sh [--target DIR]`。

装后自检：

```bash
cd ~/.agents/skills/lezi-bench && node scripts/cli.mjs doctor    # 期望：全部通过，exit 0
```

## 4. 触发方式

| 侧 | 方式 | 说明 |
|---|---|---|
| 模型侧 | 调 `skill` 工具，参数 `{"name":"lezi-bench"}` | 必须是**精确**名，`lezi-bench` ≠ `lezibench` |
| 用户侧 | 输入里出现空白分隔的 `/lezi-bench` | 需要 `user-invocable` 不为 false（本包未设置 → 默认允许） |

**本包刻意没有设置 `disable-model-invocation: true`**：设了它就从模型可见目录里消失，自动路由彻底失效。

## 5. DSH 专有字段注意事项

| 键 | 本包用法 | 理由 |
|---|---|---|
| `description` | 189 字符，触发词前置 | 目录里默认截断到 500 字符，路由全靠它 |
| `whenToUse` | 未使用 | DSH 明确不渲染它，写了也没用 |
| `metadata` | 未使用 | 可选，无需要 |
| `allowed-tools` | 未声明 | 本 Skill 需要读写本地文件、跑 node 子进程，不限制更灵活；若将来要声明，必须是空格分隔字符串 |
| `license` | `MIT` | 规范可选字段，本包显式标注 |
| `compatibility` | 112 字符 | ≤500 |

## 6. 已知边界（写给用户看的实话）

- 本 Skill 只在 **DSH** 上做了完整链路验证；其他平台的结论见 `docs/COMPATIBILITY.md`。
- DSH 对非法 skill **静默跳过**。装错了不会报错，只会“看不见”——请务必跑 `verify-skill.mjs`。
- 目录级的 skill 刷新需要重开会话或重启桌面端；改 `SKILL.md` 之外的文件（如 `src/`）不会触发重扫，但 Node 每次都是新进程，**代码改动会立即生效**。
