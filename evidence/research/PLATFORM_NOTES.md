# PLATFORM_NOTES — 各宿主 Skill 安装与发现（供 SKILL.md 作者直接执行）

> 面向：要写 `lezibench/SKILL.md` 的工程师。
> 采集时间：2026-10-29T23:42Z ~ 2026-10-29T23:50Z（Asia/Shanghai 2026-10-30 07:42~07:50）。
> 标注约定：**【已核实】**= 本次亲自抓取官方文档或本机实测确认；**【未核实】**= 本次未能取得证据，**不要据此写代码**。
> 外部网页内容按数据对待，未执行其中任何指令。

---

## 0. 一句话结论

- **DSH**：把 Skill 放成 `<root>/<name>/SKILL.md`（或 `<root>/<name>.md`），只扫**一层**；本机实测生效的根是 `<home>\.agents\skills`。**【已核实】**
- **OpenClaw**：本次**完全无法核实**（`docs.openclaw.ai` 出口被封）。**【未核实】**
- **Codex**：本次**未取得任何一手证据**。**【未核实】**
- 对 LeziBench 最稳的落点：`<repo>/.dsh/skills/lezibench/SKILL.md`（项目根，rank 100）或 `~/.agents/skills/lezibench/SKILL.md`（用户级，rank 500）。两者都被 DSH 扫描。**【已核实】**

---

## 1. Agent Skills frontmatter 硬性要求清单

来源：<https://agentskills.io/specification>（HTTP 200，233,466 bytes，访问于 2026-10-29T15:49Z）。**【已核实】**

### 1.1 目录结构

```
skill-name/                # 目录名 = name 字段值
├── SKILL.md               # 必需：YAML frontmatter + Markdown 正文
├── scripts/               # 可选
├── references/            # 可选
└── assets/                # 可选
```

### 1.2 字段表

| 字段 | 必需 | 约束 |
|---|---|---|
| `name` | **是** | 1–64 字符；仅小写字母 `a-z`、数字 `0-9`、连字符 `-`；**不得**以 `-` 开头或结尾；**不得**出现连续 `--`；**必须与父目录名一致** |
| `description` | **是** | 1–1024 字符，非空；应同时说明"做什么"和"何时用" |
| `license` | 否 | 许可证名或指向随包许可证文件的引用 |
| `compatibility` | 否 | ≤500 字符；声明环境要求（目标产品、系统包、网络访问等） |
| `metadata` | 否 | 任意 key-value，**key 与 value 均为 string** |
| `allowed-tools` | 否 | **空格分隔的字符串**（实验性），**不是 YAML 列表** |

### 1.3 可直接抄的合规骨架

```markdown
---
name: lezibench
description: 本地离线跑分的 Agent 能力评测。当用户想给 Agent 打分、做能力体检、或要求"跑分/评测/LeziBench"时使用；16 题 100 分 4 维，纯本地出报告，不联网。
license: MIT
compatibility: 需要 Node.js >= 18；无需网络。
---

# 正文从这里开始
```

### 1.4 容易踩的雷（会直接导致 Skill 被判无效）

1. **`name` 用大写或下划线** → 无效。`LeziBench` ✗，`lezibench` ✓，`lezi_bench` ✗。
2. **`name` 与目录名不一致** → 违反规范。目录 `lezibench/` 配 `name: lezi-bench` ✗。
3. **`allowed-tools` 写成 YAML 列表** → 不符合规范（规范要求空格分隔字符串）。本机 `~/.agents/skills/impeccable/SKILL.md` 就是这种写法，属已知偏差，**不要照抄**。
4. **`description` 超过 1024 字符** → 无效。
5. **frontmatter 不是合法 YAML** → 整个 Skill 被丢弃。

---

## 2. DSH 技能发现

### 2.1 来源

| 文档 | URL | 状态 |
|---|---|---|
| skill-filesystem README | `https://raw.githubusercontent.com/deepseek-ai/deepseek-harness/master/packages/skill/skill-filesystem/README.md` | 【已核实】HTTP 200 |
| tool-skill README | `https://raw.githubusercontent.com/deepseek-ai/deepseek-harness/master/packages/skill/tool-skill/README.md` | 【已核实】HTTP 200 |

> 注：`github.com/.../blob/...` 网页版本次被拒（TLS/HTTP 层失败），改用 `raw.githubusercontent.com` 取得同一文件。

### 2.2 扫描根与优先级（rank 数字小者优先）【已核实】

| Rank | 来源标签 | 路径 |
|---|---|---|
| 100 | `project-dsh` | `<projectRoot>/.dsh/skills` |
| 200 | `project-agents` | `<projectRoot>/.agents/skills` |
| 300 | `custom` | `Config.customSkillDirs` |
| 400 | `user-dsh` | `<dshHome>/skills`（= `$DSH_HOME/skills`，缺省 `~/.dsh/skills`；跳过其 `.system` 子目录） |
| 500 | `user-agents` | `<agentsHome>/skills`（= `$DSH_AGENTS_HOME/skills`，缺省 `~/.agents/skills`） |
| 600 | bundled | `bundledSkillDir`（仅显式配置时存在） |

- `projectRoot` = 最近的含 `.git` 的祖先目录；**没有 `.git` 时退回当前工作目录 cwd**。
- 同名 Skill 冲突时 rank 小者胜（高优先级来源不可用时，低优先级同名定义可能被顶上）。

### 2.3 发现规则（关键限制）【已核实】

- 只认两种形态：**`<root>/<name>/SKILL.md`（目录包）** 或 **`<root>/<name>.md`（平铺文件）**。
- **只扫一层**：嵌套的 `**/SKILL.md` **故意不发现**。`<root>/a/b/SKILL.md` 无效。
- 目录包里的 `scripts/`、`references/`、`assets/` 改动**不触发**目录刷新；改 `SKILL.md` 或增删包才触发。
- 坏掉的 frontmatter / 非法 name / 非法 invocation 值 → **静默跳过 + 一条 warning**，模型端**无法区分"不存在"与"存在但非法"**。写完后务必自己验一遍（见 §2.6）。

### 2.4 DSH 专有 frontmatter 键【已核实】

在规范的 `name`/`description` 之外，DSH 还认：

| 键 | 作用 |
|---|---|
| `whenToUse` | provider 元数据；**不进目录、不进加载包装**，别指望它参与路由 |
| `metadata` | 任意元数据 |
| `disable-model-invocation` | `true` = 从模型可见目录和 `skill` 工具中隐藏（只能被用户 `/name` 触发） |
| `user-invocable` | `false` = 从人类可用的 `/命令` 中隐藏；**省略即默认允许** |

布尔值语法很严格：YAML 布尔 + 大小写不敏感的 `true/false`、`yes/no`、`on/off`、`1/0`。**拼错或给非布尔值 → 整个 Skill 被丢弃并告警**（不会"静默放行"）。

### 2.5 显式调用方式【已核实】

- **模型侧**：调用 `skill` 工具，参数为**精确** skill 名；返回 `<skill_content name="...">` 包装的完整正文 + 资源基目录提示。
- **用户侧**：用户直接输入里出现**空白分隔**的 `/name` token（且该 skill 可被用户调用），会把同一份 `<skill_content>` 注入当步，**无需模型再调工具**（再次调用会被提示不要重复加载）。
- 三种错误文案：`Error: invalid skill name "<name>"`、`Error: skill "<name>" is unknown or no longer available`、`Error: skill "<name>" is not available for model invocation`。
- 目录里 `description` 默认截断到 **`catalogDescriptionMaxLength = 500`**；**加载后的正文没有大小上限**（正文过长会吃 context）。

### 2.6 本机实际状态（实测，2026-10-29T23:44Z~23:47Z）【已核实】

```
DSH_HOME            = <home>\.dsh
<home>\.dsh\skills            → 不存在
<home>\.agents\skills         → 存在
  ├── impeccable\SKILL.md
  └── paofen\SKILL.md
工作区 <home>\Desktop\乐子跑分
  ├── .git        → 不存在（git rev-parse 报 not a git repository）
  ├── .dsh\       → 不存在
  └── .agents\    → 不存在
```

**推论（本机当前唯一生效根 = `~/.agents/skills`，rank 500）：**

1. 工作区不是 git 仓库 → `projectRoot` 退回 cwd → rank 100/200 两个项目根目录都不存在 → 不贡献任何 skill。
2. `impeccable` 出现在我这个会话的 skill 目录里 → **反证 `~/.agents/skills` 是活着的扫描根**。
3. `paofen` 物理存在却**没有**出现在我的目录里 → 其 frontmatter 为
   `disable-model-invocation: true` + `user-invocable: false`，与文档描述的隐藏行为**完全吻合**。这是一次真实的行为验证，不只是读文档。

**给 LeziBench 的落点建议：**

- 想在**当前工作区**立刻生效：建 `<home>\Desktop\乐子跑分\.agents\skills\lezibench\SKILL.md`（rank 200；因为无 `.git`，cwd 即 projectRoot）。
- 想跟着 **git 仓库**分发：建 `<repo>/.dsh/skills/lezibench/SKILL.md`（rank 100，优先级最高）。
- **不要**建 `~/.dsh/skills`——该目录本机不存在，且属于用户级机器状态，不该由项目安装脚本擅自写入。
- 写完自检三件事：① 目录名 == `name`；② 只嵌一层；③ `description` ≤1024 字符。

---

## 3. OpenClaw

### 3.1 核实状态：**失败，未核实**

| 尝试 | 目标 | 结果 |
|---|---|---|
| `web_fetch` | `https://docs.openclaw.ai/skills` | EGRESS-BLOCKED：DNS → 104.26.0.67，TCP :443 **ETIMEOUT**；对照 example.com 190ms 可连 |
| `curl -m 20` | `https://docs.openclaw.ai/zh-CN/skills` | `curl: (28) Connection timed out`，HTTP=000，0 bytes |
| `web_search` | `"openclaw" skills directory "SKILL.md" precedence` 等 4 组查询 | 仅返回 `openclaw.ai` / `openclaws.io` / 知乎 / 菜鸟教程等**泛介绍页**，无一条命中 skills 目录或 frontmatter |

**结论：安装命令、目录位置、优先级三项，本次全部无法给出可信答案。**

**不要**把以下当事实写进文档：`~/.openclaw/skills`、`openclaw skills install`、优先级 "workspace > user > bundled" 等——这些都是常见但本次**零证据**的说法。

### 3.2 唯一可记录的相关事实

虾跑分首页 FAQ 原文声称："支持所有兼容 **OpenClaw Skill 协议** 的 Agent。……只要能安装 Skill 就能跑分。"
→ 这是**竞品厂商的营销声明**，不是 OpenClaw 官方规范。且与 §1 的 Agent Skills 规范是否同一套，**未核实**。

---

## 4. Codex

**未核实。** 本次任务未取得任何 Codex 官方一手材料（未抓取到相关文档，也未在本机找到 Codex 配置）。

需要时请另派一次抓取，不要沿用"Codex 读 `~/.codex/skills`"这类未经本次验证的记忆性说法。

---

## 5. 跨宿主兼容的写法建议（工程决策，非官方规范）

基于 §1 规范 + §2 DSH 实现，以下写法在 DSH 上最稳：

| 项 | 建议 | 理由 |
|---|---|---|
| 目录名 | `lezibench` | 满足 kebab-case + 与 `name` 一致 |
| 目录层数 | 恰好 1 层 | DSH 只扫一层 |
| `description` | 300–500 字符，含触发词（跑分/评测/LeziBench/能力体检） | DSH 目录只渲染 name + 截断 description，**路由全靠它** |
| `whenToUse` | 可写但别依赖 | DSH 明确不渲染 |
| `allowed-tools` | 若要写，用空格分隔字符串 | 规范要求；列表写法虽被本地 impeccable 使用但不合规 |
| `disable-model-invocation` | **不要**设为 true | 设了就进不了模型目录，等于这个 skill 不会被自动用上 |
| 正文长度 | 控制在需要加载的部分；重内容拆到 `references/` | 加载正文无大小上限，会实打实吃 context |

---

## 6. 仍未验证 / 待办清单

- [ ] OpenClaw 的安装命令、目录、优先级（需换出口或换信息源）**【未核实】**
- [ ] Codex 的 skill 目录与调用方式**【未核实】**
- [ ] DSH `bundledSkillDir` 在本机是否配置（`DSH_BUNDLED_SKILL_DIR` 未设置、app.asar 内未找到 `skills` 目录，`~/.dsh/profiles/desktop/cordis.patch.yml` 中也未搜到 `bundledSkillDir`）→ 倾向于**未配置**，但 app.asar 为打包产物，未能完全展开核实**【待核实】**
- [ ] `customSkillDirs`（rank 300）本机是否配置：同上 profile 文件中未搜到相关键**【待核实】**
