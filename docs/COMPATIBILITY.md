# COMPATIBILITY — 各宿主兼容性（证据分级）

> 本页只记录**有证据**的结论。证据来源全部写在 `research/PLATFORM_NOTES.md`（该文件对每条结论标注了【已核实】/【未核实】及原始 URL / 本机实测时间）。
> 采集时间：2026-10-29T23:42Z ~ 23:50Z 与 2026-10-30 的真机安装/考试（见 `evidence/host/HOST_TRIAL.md`）。

## 0. 证据等级定义

| 标记 | 含义 |
|---|---|
| **VERIFIED** | 本机亲自执行成功 + 有可复现的命令与输出。可据此写安装文档。 |
| **PARTIAL** | 部分环节有直接证据（例如“目录能被扫到”已验证），但整体链路未完整验证。可以写，但必须同时写出未验证的边界。 |
| **NOT_TESTED** | **本次没有任何一手证据**。不得据此写安装命令、路径或优先级。 |

## 1. 总表

| 宿主 | 结论 | 证据强度 | 一句话 |
|---|---|---|---|
| **DSH（DeepSeek Harness）** | **VERIFIED** | 强 | 安装 → 被 skill 目录发现 → 完整跑完 4 批 16 题 → 出 HTML/JSON/summary 报告，全链路本机跑通 |
| **任何兼容 Agent Skills 规范的宿主** | **PARTIAL** | 中 | 包结构符合 `agentskills.io` 规范、frontmatter 合规；但除 DSH 外未在别的宿主实跑 |
| **OpenClaw** | **NOT_TESTED** | 无 | 官方文档 `docs.openclaw.ai` 本次出口被封（ETIMEOUT/超时），**零一手证据** |
| **Codex** | **NOT_TESTED** | 无 | 本次未取得任何 Codex 官方一手材料，**零一手证据** |

---

## 2. DSH — **VERIFIED**

### 2.1 已实测的证据链

| # | 环节 | 结论 | 证据 |
|---|---|---|---|
| 1 | 用户级扫描根 `~/.agents/skills/`（rank 500） | 是活根 | 安装后本会话 skill 目录**直接出现** `lezi-bench` 条目；同机 `impeccable` 也在该目录且可被模型看到 |
| 2 | 目录名 = `name` 时才被接受 | 是 | 目录叫 `lezibench` 时目录里显示 `lezibench`；改名 `lezi-bench` 后显示 `lezi-bench`；两者都被接受（说明规则是“名称一致”，不是“必须叫某个固定名”） |
| 3 | 工作区级 `<cwd>/.agents/skills/`（rank 200） | 路径已生效（结构 + doctor 通过） | 安装并通过 `verify-skill.mjs`；**未做隔离实验**（与用户级同名同内容，无法区分是哪份被加载） |
| 4 | 只扫一层 | 是 | `PLATFORM_NOTES.md` §2.3（依据 `skill-filesystem` README，HTTP 200 已核实） |
| 5 | 非法 frontmatter 静默跳过 | 是 | 同上；本机 `paofen`（`disable-model-invocation: true`）物理存在却不进模型目录，是行为级反证 |
| 6 | 模型侧调用 `skill` 工具 | 可用 | 本次会话使用 `lezi-bench`（精确名）作为可用 skill 条目 |
| 7 | 用户侧 `/lezi-bench` | 允许 | `user-invocable` 未设 → 默认允许；DSH 识别“空白分隔的 `/name` token”（文档已核实） |
| 8 | 完整考试链路 | 通过 | `doctor` → `start` → `submit` ×4 → `report`（html/json/summary），全部退出码 0，见 `evidence/host/HOST_TRIAL.md` |

### 2.2 已验证可用的安装位置

| rank | 路径 | 状态 |
|---|---|---|
| 200 | `<projectRoot>/.agents/skills/lezi-bench/` | 结构 + doctor 已验证；rank 优先级来自文档核实 |
| 500 | `~/.agents/skills/lezi-bench/` | **发现行为已实测** |

`<projectRoot>` = 最近的含 `.git` 的祖先；**没有 `.git` 时退回 cwd**（本仓库当前无 `.git`，已实测 `git rev-parse` 报 not a git repository）。

### 2.3 DSH 侧的限制（要如实写进任何宣传材料）

- `description` 在目录里默认截断到 **500 字符**——路由全靠它，所以触发词必须写在最前面。
- `whenToUse` **不进目录、不进加载包装**，别指望它参与路由。
- 正文加载**没有大小上限**，会实打实吃 context（本 SKILL.md 约 150 行 / 4.2 KB）。
- **不要**设 `disable-model-invocation: true`：设了就从模型可见目录里消失，只能靠用户 `/lezi-bench` 手动触发，等于废掉自动路由。
- `~/.dsh/skills`（rank 400）本机**不存在**；项目安装脚本不应擅自创建用户级机器状态目录。

---

## 3. 通用 Agent Skills 宿主 — **PARTIAL**

**已验证的部分**：包结构与 frontmatter 符合 <https://agentskills.io/specification>（HTTP 200，233,466 bytes，2026-10-29T15:49Z 抓取）：

| 规范项 | 本包现状 | 结论 |
|---|---|---|
| 目录 `<name>/SKILL.md` | `lezi-bench/SKILL.md` | ✔ |
| `name` 1–64、`[a-z0-9-]`、无 `--`、首尾非 `-`、== 目录名 | `lezi-bench` | ✔ |
| `description` 1–1024 | 189 字符 | ✔ |
| `license` | `MIT` | ✔ |
| `compatibility` ≤500 | 112 字符 | ✔ |
| `metadata` key/value 均为 string | 未使用 | ✔（可选） |
| `allowed-tools` 空格分隔字符串（非 YAML 列表） | 未声明 | ✔（可选；本机 `impeccable` 的列表写法属已知偏差，未照抄） |

**未验证的部分**：除 DSH 之外**没有在任何其他宿主上实跑过**。所以：
- 可以说“符合 Agent Skills 规范、按规范结构组织”；
- **不能**说“在某某平台测试通过”。

---

## 4. OpenClaw — **NOT_TESTED**

### 4.1 结论

**本次未能核实，不要采信未经验证的安装命令。**

### 4.2 本次尝试过什么（全部失败）

| 尝试 | 目标 | 结果 |
|---|---|---|
| `web_fetch` | `https://docs.openclaw.ai/skills` | EGRESS-BLOCKED：DNS → 104.26.0.67，TCP :443 **ETIMEOUT**（对照 example.com 190ms 可连） |
| `curl -m 20` | `https://docs.openclaw.ai/zh-CN/skills` | `curl: (28) Connection timed out`，HTTP=000，0 bytes |
| `web_search` | 4 组查询（skills 目录 / SKILL.md / precedence） | 仅返回泛介绍页，**无一条**命中 skills 目录或 frontmatter |

### 4.3 因此以下说法**一律不得出现在本项目文档里**

- ❌ `~/.openclaw/skills`
- ❌ `openclaw skills install <name>`
- ❌ 优先级“workspace > user > bundled”
- ❌ “已在 OpenClaw 上测试通过”

### 4.4 唯一可记录的相关事实（且只是厂商宣称）

虾跑分首页 FAQ 原文声称：“支持所有兼容 **OpenClaw Skill 协议** 的 Agent……只要能安装 Skill 就能跑分。”
→ 这是**竞品厂商的营销声明**，不是 OpenClaw 官方规范；且它与 `agentskills.io` 规范是否同一套，**本次未核实**。不可作为 LeziBench 的兼容性依据。

---

## 5. Codex — **NOT_TESTED**

**本次未取得任何 Codex 官方一手材料**（未抓取到相关文档，本机也未找到 Codex 配置）。

因此：
- ❌ 不得写 `~/.codex/skills` 之类的路径；
- ❌ 不得写任何 `codex ...` 安装命令；
- ❌ 不得写“Codex 支持 / 不支持”的结论性判断。

如需支持，必须**另派一次抓取**，拿到官方文档后再补这一节。

---

## 6. 给文档/宣传作者的硬性规则

1. 引用本页时，**必须**带上证据等级标记（VERIFIED / PARTIAL / NOT_TESTED）。
2. 只有标 **VERIFIED** 的条目才允许写成祈使句式的安装步骤（“运行这条命令”）。
3. **PARTIAL** 条目必须同时写出未验证的边界。
4. **NOT_TESTED** 条目只能写成“未核实/未测试”，**不得**出现具体命令、具体路径、具体优先级。
5. 任何“跑分分数”在对外材料中必须标注：**本地公开题库自测 · 非认证 · 不能防作弊 · 不与跨版本成绩比较**（见 `SKILL.md` §4）。

## 7. 变更记录

| 日期 | 变更 |
|---|---|
| 2026-10-30 | 首版。DSH 标 VERIFIED（真机安装 + 完整 16 题考试）；通用规范 PARTIAL；OpenClaw / Codex 均 NOT_TESTED。 |
