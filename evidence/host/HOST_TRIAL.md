> ⚠️ **历史快照说明（后补）**：本文档记录的是 **exam v1.1.0** 期间的多轮真机考试（round 1–7）。
> 当前发行版是 **v1.2.0**（I03 分布、C04 题干示例、并发写入、Node 18 兼容均有变更）。
> **当前版本的权威成绩证据见 [`../lead/RELEASE-v1.2.0.html`](../lead/RELEASE-v1.2.0.html)。**
> 本文档保留原样，因为它记录了**失败轮次**（round 1/2 的 94 分，因 R04 题面欠定失 6 分）
> —— 那是对「这题到底严不严谨」最直接的回答。
>
# HOST_TRIAL — LeziBench 真机安装 + 真实 Agent 考试（实测流水）

> 角色：Skill 封装 / 宿主兼容工程师
> 环境：Windows 11（win32 x64）· Node v24.20.0 · DSH 桌面端（`<home>\.dsh`）
> 时间窗口：2026-10-29T23:56Z ~ 2026-10-30T00:16Z（Asia/Shanghai 07:56 ~ 08:16）
> 工作目录：`<workspace>`

**重要声明（先读）**：
本文件记录的真实考试分数，**全部来自本 Agent 逐题阅读题面、自己作答**。
**没有**调用 `scripts/oracle-answers.mjs`，**没有**读取 gold 答案，**没有**修改任何题库或判分器。
每批答案文件（`answers-batch{1..4}.json`）与每批 CLI 输出（`submit-batch{1..4}.log`）都留档在本目录，可逐题复核。

---

## 1. 交付物清单

| 类别 | 路径 | 说明 |
|---|---|---|
| Skill 定义 | `lezibench/SKILL.md` | ~150 行；frontmatter `name: lezi-bench` |
| 仓库内安装副本 | `lezibench/skills/lezi-bench/` | 由 `scripts/sync-skill.mjs` 生成，逐字节一致 |
| 工作区安装 | `.agents/skills/lezi-bench/`（rank 200） | 已安装并通过验证 |
| 用户级安装 | `<home>\.agents\skills\lezi-bench\`（rank 500） | **已被 DSH 发现**（见 §3） |
| 安装器 | `install/install.ps1`、`install/install.sh` | 幂等、全量复制、装后哈希比对 + doctor |
| 文档 | `lezibench/docs/INSTALL.md`、`lezibench/docs/COMPATIBILITY.md` | 证据分级 |
| 适配说明 | `lezibench/adapters/{README,dsh,openclaw,codex,generic-agentskills}.md` | OpenClaw / Codex 均 NOT_TESTED |
| 验证脚本 | `qa/host/verify-skill.mjs` | 结构性验证 + 真跑 doctor |
| R04 诊断脚本 | `qa/host/diagnose-r04.mjs` | 题面可推导性（含 100 seed 批量自检） |
| **最终报告** | `qa/host/report.html` / `report.json` / `report-summary.txt` | 本次真实考试产物 |

---

## 2. 完整命令流水（最终考试 round）

> 数据根目录统一用 `qa/host/runs`（隔离于用户默认数据目录）：
> `export LEZIBENCH_HOME="<workspace>\qa\host\runs"`
> 所有命令均在**已安装的 skill 目录** `<workspace>\.agents\skills\lezi-bench` 下执行。

### 2.1 环境自检

```bash
node scripts/cli.mjs doctor
```

输出（exit 0）：

```
LeziBench 环境自检（数据目录：<workspace>\qa\host\runs）
  ✔ Node.js 版本：v24.20.0（要求 ≥18）
  ✔ 操作系统：win32 x64
  ✔ 题库契约：16 题 / 100 分 / 4 维 × 25 / 216b3ea47401…
  ✔ 数据目录可写：<workspace>\qa\host\runs
  ✔ 哈希与编码：SHA-256 正常，UTF-8 输出正常

全部通过，可以开考。
```

### 2.2 开局

```bash
node scripts/cli.mjs start --mode standard --seed host-trial-v12 --json
```

→ `runId = run-20261029-171944-3ce70b`，返回第 1 批 4 题（I01 / R01 / D01 / C01）。
原始 JSON 存于 `qa/host/batch1-v11.json`。

### 2.3 四批作答 → 提交

```bash
node scripts/cli.mjs submit --run run-20261029-171944-3ce70b --batch 1 --answers-file "…\qa\host\answers-batch1.json"
node scripts/cli.mjs submit --run run-20261029-171944-3ce70b --batch 2 --answers-file "…\qa\host\answers-batch2.json"
node scripts/cli.mjs submit --run run-20261029-171944-3ce70b --batch 3 --answers-file "…\qa\host\answers-batch3.json"
node scripts/cli.mjs submit --run run-20261029-171944-3ce70b --batch 4 --answers-file "…\qa\host\answers-batch4.json"
```

| 批次 | 题号 | 本批得分 | 累计 | 耗时（批间） |
|---|---|---|---|---|
| 1 | I01 / R01 / D01 / C01 | **16 / 16** | 16/100 | — |
| 2 | I02 / R02 / D02 / C02 | **24 / 24** | 40/100 | — |
| 3 | I03 / R03 / D03 / C03 | **24 / 24** | 64/100 | — |
| 4 | I04 / R04 / D04 / C04 | **36 / 36** | **100/100** | — |

四批全部 `GRADED`，无 `NEEDS_REVIEW` / `UNPARSEABLE` / `SCORER_ERROR`。
每批 CLI 输出原文：`qa/host/submit-batch{1..4}.log`。

**我实际怎么答的（抽样说明，证明不是抄答案；下面这组数值取自 round 7 / exam v1.1.0 / 指纹 `216b3ea47401`，即最终报告那一轮）**：

- **I01**（通知覆盖）：通知2 改为「周四下午4点」；通知3 是「预算表这次不用交了」→ `{deadline:"周四下午4点", budgetAttached:false}`。（⚠️ 与 round 6 相反，见下）
- **R01**（小票）：17×2 + 4×5 = **54**；门槛 53，54 ≥ 53 → 触发满减 → 54 − 6 = **48** → `{subtotal:54,total:48}`。
- **D01**（去重排序）：10 条去重得 苏州/宁波/杭州/无锡/合肥 → 按序号 苏州(2)、杭州(3)、宁波(4)、合肥(5)、无锡(6) → `["苏州","杭州","宁波","合肥","无锡"]`。
- **C01**（纠错）：17+25+18 = **60** ≠ 54 → `{isCorrect:false, correctTotal:60}`。（⚠️ 与 round 6 相反）
- **R03**（最低成本）：素盒 2 蛋白/11 元、鸡盒 3/20、牛盒 4/27，需 ≥4 份且 ≥11 蛋白。穷举 → **4 素 + 1 鸡 = 5 份 / 11 蛋白 / 64 元**，唯一最优（次优 66 元）。
- **R04**（六线索）：4 色「红、蓝、绿、橙」。线索：阿海<阿布、阿海≠1、阿布<阿金 → 阿海2 / 阿布3 / 阿金4，阿澈只能1；颜色 阿布=红、阿海=绿、阿金=蓝 → 剩下**橙**归阿澈。
- **D04**（会员等级）：甲(16)普通、乙(17)普通（年龄<18 例外）、丙(40/1445/活跃)金牌、丁(44/480/不活跃)普通、戊(64/685/不活跃，银牌要求活跃=是)普通、己(65/1583/**不活跃**)普通 → `{gold:1, silver:0, normal:5}`。（⚠️ 积分虽高但活跃=否，不能给金牌）
- **C04**（脚本纠错）：qty 应为 4 → 30×4 = **120** → 120×0.85 = **102**。
- **D03**（两表核对）：供应商 4 个（B-207/D-402/A-101/E-518），门店 6 个 → 仅门店有 **C-315、G-721**；亏本只有 **B-207**（售价 9 < 进价 13；D-402 22>11、A-101 44>33、E-518 37>29 都不亏）→ `commonCount:4`。
- **C03**（新旧规则）：a1(2/22, 3676≤3692 旧→自动)、a2(2/12, 4151>3692 旧→人工)、a3(3/6, 6466>5807 新→人工)、a4(3/26, 4427≤5807 新→自动)。

> **反背题对照（round 6 vs round 7，同一产品、不同 seed）**：
> | 题 | round 6 答案 | round 7 答案 |
> |---|---|---|
> | I01 `budgetAttached` | `true`（通知3=务必附上） | `false`（通知3=不用交） |
> | C01 `isCorrect` | `true`（52 成立） | `false`（60≠54） |
> | D03 `onlyInStore` | `[]` | `["C-315","G-721"]` |
> | D04 `counts` | `{gold:2,silver:0,normal:4}` | `{gold:1,silver:0,normal:5}` |
>
> 四道题的答案在两轮之间**方向相反**，而两轮都拿了满分 —— 这说明作答确实来自逐题读取当轮题面，而不是记忆或模板。

### 2.4 出报告

```bash
node scripts/cli.mjs report --run run-20261029-171944-3ce70b --format html    --out "…\qa\host\report.html"
node scripts/cli.mjs report --run run-20261029-171944-3ce70b --format json    --out "…\qa\host\report.json"
node scripts/cli.mjs report --run run-20261029-171944-3ce70b --format summary --out "…\qa\host\report-summary.txt"
```

三次均 exit 0。HTML 31,605 bytes（自包含、零外链），JSON 19,658 bytes，summary 529 bytes。

> 本轮的 HTML/JSON 已用同步后的安装副本重新生成并校验：HTML 31,605 B、零外链（正则 `https?://` 无命中）、JSON 含 16 题且全部满分。

### 2.5 最终成绩（CLI 原文，未做任何修改）

```
乐子跑分 LeziBench · 标准局成绩

总分：100 / 100　段位：卓越

  指令理解　　　 25/25  ██████████
  逻辑推理　　　 25/25  ██████████
  信息整理　　　 25/25  ██████████
  状态追踪与纠错 25/25  ██████████

本次全部题目满分。

题库 exam v1.1.0 · 判分器 grader v1.1.0 · 种子 host-trial-v12
实测耗时：186.6 秒
成绩性质：本地规则核验 · 非认证成绩（LOCAL_SELF_TEST）
```

**诚实说明**：这个 100 分是**真实作答**的结果，但它**不代表**「这个 Agent 有 100 分能力」。
原因：题库与评分条件全部公开，我在题面里能看到 each criterion；题目本身对当前模型偏简单。
它只证明「流程能完整跑通、判分器对满分卷给 100 分」——这正是本任务要验证的**发布门槛**。

---

## 3. Skill 发现验证（最硬的一手证据）

**观察方式**：本会话的系统提示里有一份 `<available_skills>` 目录，由 DSH 实时生成。

| 步骤 | 目录里的条目 | 结论 |
|---|---|---|
| 安装为 `~/.agents/skills/lezibench/`（`name: lezibench`） | 出现 `lezibench` | 用户级根是活根 |
| 整体改名为 `lezi-bench`（`name: lezi-bench`） | 目录里变成 `lezi-bench` | DSH 跟随目录改名重新扫描 |
| 删除 `lezi-bench` 目录 | 条目消失 | 证明条目确实来自该目录，非缓存假象 |
| 重新安装 `lezi-bench` | 条目重新出现 | 可复现 |

这是**行为级验证**，不是“读代码推断”。同时 `impeccable`（同在该根）一直在目录里，`paofen`（`disable-model-invocation: true`）一直没有——与 `research/PLATFORM_NOTES.md` §2.6 的结论完全吻合。

结构性验证另有 `qa/host/verify-skill.mjs`（20 项全过，见 `qa/host/verify-skill.log`）：

```
=== <workspace>\.agents\skills\lezi-bench ===
  ✔ name == 父目录名：都是 lezi-bench
  ✔ description ≤1024：189 字符（触发词命中 4/4）
  ✔ compatibility ≤500：112 字符
  ✔ 模型侧可见：未禁用模型调用
  ✔ 与仓库根 SKILL.md 逐字节一致：9178 字节完全相同
  ✔ node scripts/cli.mjs doctor 退出码 0
  → 通过
=== <home>\.agents\skills\lezi-bench ===
  …（同样 20 项全过）
总体：全部通过
```

---

## 4. 安装脚本实测

| 测试 | 命令 | 结果 |
|---|---|---|
| PS 安装到自定义目录 | `pwsh -File install/install.ps1 -TargetDir …\qa\host\installtest` | exit 0；源校验 ✔ 文件逐一致 ✔ doctor ✔ |
| PS 幂等（重复 4 次） | 同上 ×4 | 每次都成功；旧版本备份为 `.bak-<时间戳>`，**只保留最近 2 份**（实测剩 2 个 bak 目录） |
| PS 卸载 | `-Uninstall` | exit 0，目录被删 |
| PS 5.1（Windows PowerShell） | `powershell -File install/install.ps1` | exit 0；输出 UTF-8 正常（脚本已强制 `[Console]::OutputEncoding = UTF8` 并带 BOM） |
| bash 语法 | `bash -n install/install.sh` | OK |
| bash dry-run | `bash install/install.sh --dry-run --target …` | 不写盘，打印计划 |
| bash 安装 | `bash install/install.sh --target …` | 源校验 ✔ 哈希逐一致 ✔ doctor ✔ |
| bash 幂等 | 再跑一次 | 备份旧版本 ✔ 装完仍一致 ✔ |
| bash 卸载 | `--uninstall` | exit 0 |

**踩到的两个坑（已在脚本里修掉，写进文档给后人）**：

1. **Windows PowerShell 5.1 中文乱码 + doctor 误判**：PS 5.1 默认按控制台代码页（GBK/936）解码子进程输出，导致 `node scripts/cli.mjs doctor` 的中文输出被解成乱码，`-match '全部通过'` 匹配失败 → **把成功误报成失败**。
   修法：脚本内 `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8` + `$OutputEncoding`，并且 `.ps1` 文件本身存为 **UTF-8 with BOM**（无 BOM 时 PS 5.1 会把脚本里的中文源码按 GBK 解析，直接报 ParserError）。

2. **备份无限堆积**：最初每装一次就留一个 `.bak-*`。改成只保留最近 2 份。

---

## 5. 遇到的问题（按严重度）

### P1【已修，我上报 → Lead 修】R04 题面欠定：第 4 人颜色推不出来

**现象**：round 1（seed `host-trial-2026`）与 round 2（seed `host-trial-v2`）R04 都是 **3/9**，且都是「位置全对、颜色错 1 人」。

**根因**：`R04.generate` 的 `colors` 从 6 色池随机抽 4 色，唯一性只在「这 4 色」集合内成立（`solveSeats` 只遍历 `names × colors`）；但**旧题面从未告诉答题方是哪 4 色**，只写「颜色互不相同」。3 条线索固定 3 人颜色后，第 4 人颜色在题面视角下仍有 3 种可能。

**复现命令**（我写的只读诊断脚本，不碰 `src/`）：

```bash
node qa/host/diagnose-r04.mjs host-trial-2026 host-trial-v2
```

修复前输出（`qa/host/diagnose-r04.log`）：

```
host-trial-v2     1            3   橙紫红蓝   欠定（题面下 3 个解）
  内部解（题库自证，唯一）：阿岚=1号/蓝  阿布=2号/红  阿豆=3号/橙  阿果=4号/紫
  题面下可能的解（3 个）：
    - …阿果=4号/紫
    - …阿果=4号/绿
    - …阿果=4号/黄
```

**Lead 的修复**：题面显式给出 4 色（`四张卡片的颜色恰好是这四种：${colorListText}`）。

**修复后验证**（`qa/host/diagnose-r04-after-fix.log` + `diagnose-r04-sweep.log`）：

```
host-trial-2026  橙红黄绿  4 色全排列  1 唯一 ✔
host-trial-v2    蓝红橙紫  4 色全排列  1 唯一 ✔
fresh-1/2/3      …        4 色全排列  1 唯一 ✔
结论：全部 seed 在题面信息下唯一解 ✔

批量自检 100 个 seed（26531ms）
  题面未显式声明 4 色：0/100
  题面视角不唯一：0/100
✔ 全部唯一，题面可推导
```

**⚠️ 给 web-docs 的重要澄清**：对方拿 `facts.clueTests` 跑 `solveSeats` 得到「100% 唯一」，这**测不到这个 bug**——因为 `solveSeats` 的搜索空间是传进去的 `colors`（内部已知的 4 色），而 bug 恰恰是「答题方不知道这 4 色是什么」。正确的判据必须在**题面可及**的搜索空间里枚举。对方用 `perfectAnswers()` 得到 300/300 满分同样无法反证——那是 oracle 视角，不是题面视角。**证据是可复现的**：`submit-batch3.log`（round v3 的旧安装副本）里 R04 题面原文只有「颜色互不相同」，没有任何颜色列表；修复后的 `submit-batch3.log`（final round）里明确出现「四张卡片的颜色恰好是这四种：红、黄、橙、蓝」。

### P2【已修，Lead 修】安装副本过期导致「改了 src 但行为没变」

**现象**：round v3 开局时 R04 题面仍是旧版（没有颜色声明），即使 `lezibench/src` 已经修好。原因：`.agents/skills/lezi-bench` 是之前拷的旧副本，`src/exam/items/reasoning.mjs` 还是旧的。

**证据**：`qa/host/EVIDENCE-stale-install-r04-old-prompt.log`（旧题面原文）vs `qa/host/submit-batch3.log`（同步后新题面原文）。

**教训 / 已落实的纪律**：**每次改完必须全量重同步**，不能只拷 `SKILL.md`。本任务最后一次操作用 `node scripts/sync-skill.mjs --target <每个安装点>`，该脚本会**逐文件比对哈希**，任何不一致直接报错（不是靠人记得）。

### P3【非阻断，已规避】`sync-skill.mjs` 一度 `ReferenceError: isMain is not defined`

Lead 正在写这个脚本时我调了一次，报 `isMain is not defined`；稍后脚本补上了 `import { isMain } from '../src/is-main.mjs'` 就正常了。属**并行开发中的瞬时状态**，不是产品 bug，仅记录。

### P4【非阻断，文档已规避】`status` 文本输出的字段名拼写

`scripts/cli.mjs` 第 161 行：`s.totalScoreFar ?? s.totalScoreSoFar` —— `totalScoreFar` 是拼写残留。实际运行时为 `undefined` → 回退到 `totalScoreSoFar`，**行为正确**。已报给 Lead，Lead 之后已修正。

### P5【~~重要~~ **已作废：我的判断有误，Lead/web-docs 的实现在我读错的版本之上才对**】

> ⚠️ **本条保留原文以示留痕，但结论已推翻。请直接看 §5.1 更正。**
> 我当时的错误有两处叠加：① 我读的是 `catalogFingerprint` **加入 prompt 探针之前**的版本（`255c5caa2848` 时代，payload 里确实只有 criteria）；② 我在**同一个 Node 进程**里先算了一次旧值再 import 新代码，撞上 `_fpCache` 返回了缓存值。两者叠加让我得出「指纹不含 prompt」的错误结论。

<details>
<summary>（原 P5 记录，已作废，仅留痕）</summary>

`catalogFingerprint()`（`manifest.mjs`）的输入只有：

```js
{ id, dimension, difficulty, points, batch,
  criteria: [{ id, points, text }] }
```

~~**不包含 `prompt`、`facts`、`generate()` 的任何输出。**~~

**实证（同一 seed，两棵代码树）**：Lead 把 R02 的依赖图改成随 seed 变化（`D 定价：必须等 B 完成` → `必须等 B 和 C 都完成`）。我用**旧安装副本**和**仓库最新源码**在同一个 seed 下对比题面不同、而指纹相同 —— 这是**跨了两个不同的指纹算法版本**在做对比，本身就不是有效对照（旧副本是旧算法）。

**给 Lead 的建议**（部分仍有效，见 §5.1）：
- 题面变更（R04 补色、R02 依赖图变化）应升 `EXAM_VERSION`；
- 报告免责声明补一句「并核对报告中的题库指纹」。

</details>

## 5.1 更正与最终结论（以此为准）

**web-docs 复核后提供了正确实现，我按他的对照命令用两个独立进程复跑，确认他是对的：**

```bash
# A. baseline（干净进程）
node -e "import('./src/exam/manifest.mjs').then(M=>{const b=M.fingerprintBreakdown();console.log(b.full.slice(0,12), b.criteria.slice(0,12), b.prompts.slice(0,12))})"
# → full 3b3a9224c088  criteria 20c9891fc37e  prompts 90363521a276

# B. 只改 R02 题面一个字（另一个干净进程）
node -e "import('./src/exam/manifest.mjs').then(M=>{const R02=M.ITEM_BY_ID.get('R02');const o=R02.generate;R02.generate=function(s){const g=o.call(this,s);g.prompt+='X';return g};const b=M.fingerprintBreakdown();console.log(b.full.slice(0,12), b.criteria.slice(0,12), b.prompts.slice(0,12))})"
# → full 3e51ac3938ec  criteria 20c9891fc37e  prompts 9cfcb166c198
```

**结论**：当前 `catalogFingerprint` **是包含题面的**。payload 结构（`manifest.mjs` L119–155）：

```js
const FINGERPRINT_PROBES = ['fp-probe-1', 'fp-probe-2'];
const probes = FINGERPRINT_PROBES.map((seed) => {
  const g = it.generate(seed);
  return { prompt: g.prompt, criteria: g.publicCriteria };
});
// payload = { id, dimension, difficulty, points, batch, criteria, probes }
// 另有 fingerprintBreakdown() → { full, criteria, prompts, probes }
```

`full` 由三部分组成：全部 criteria 文本 + 16 题在**两个探针 seed** 下的题面 + 题目元数据。

**真实存在的覆盖边界（这条要写进文档，是 honest limitation 不是 bug）**：

> 指纹相同 ⇒ 「探针 seed（`fp-probe-1`/`fp-probe-2`）下的题面 + 全部评分条件」相同；
> **但 ≠「所有 seed 的题面都相同」**——探针只有 2 个 seed，若某题的题面随 seed 随机变化（如 R02 的依赖图分支），而两个探针 seed 恰好都没触发那条分支，指纹就区分不出来。这是**概率性覆盖**，不是逻辑漏洞，但读者有权知道。

**另外更正我此前一条对外口径**：我上一轮说「报告指纹 `5079d6dd5c99` ≠ 当前指纹 → 不可比」。这个**理由现在不成立** —— 报告记的是**旧算法**下的值，跨算法比指纹没有意义。

**最终的可比性判据（三条，缺一不可）**：`examVersion` + `graderVersion` + `catalogFingerprint` **三者都相同**，且最好来自**同一份发布**。
- 只比版本号不行：round 6 与 round 7 同为 `v1.1.0`，但指纹不同（中间改了 I03 出题分布）。
- 只比指纹也不行：round 1–5 与 round 6 之后是**不同的指纹算法**，数值本身不可直接比较。
- 最稳的是「三者一致 + 同一发布」；`SKILL.md` §4 的诚实边界已按这一口径改写。

---

## 6. 各轮记录（含失败轮，一并留档）

> **可比性铁律：只有 `catalogFingerprint` 相同的轮次才能互相比较。**
> `catalogFingerprint` 是 `manifest.mjs` 计算的 SHA-256，覆盖 **全部评分条件 + 16 题在两个探针 seed（`fp-probe-1`/`fp-probe-2`）下的题面 + 题目元数据**（详见 §5.1）。
> ⚠️ 注意：round 1–5 的 `examVersion`/`graderVersion` 全是 `1.0.0`，但**题目与评分条件实际上变过**；round 6 才升到 `1.1.0`。所以「版本号相同」≠「可比」。另外 round 1–5 的指纹是**旧算法**（不含 prompt 探针）算的，round 6 是**新算法**——**跨算法比指纹无意义**，只能看版本号。

| round | seed | runId | `catalogFingerprint`（前 12 位） | 非 R04 题 | R04 | 总分 | 说明 |
|---|---|---|---|---|---|---|---|
| 1 | `host-trial-2026` | `run-20261029-155950-c490fb` | `1b665890f294`（旧算法） | 15/15 满分 | 3/9 | 94/100 | R04 题面欠定（P1） |
| 2 | `host-trial-v2` | `run-20261029-160410-449d80` | `1b665890f294`（旧算法） | 15/15 满分 | 3/9 | 94/100 | 同上，复现确认（与 round 1 同指纹 → 可比的重复测量） |
| 3 | `host-trial-v3` | `run-20261029-161255-1ba049` | `1b665890f294`（旧算法） | 12/12 满分（只跑 3 批） | — | —（未完成） | 发现安装副本过期（P2），主动中止并重装 |
| 4 | `host-trial-final` | `run-20261029-161436-f1dc03` | `255c5caa2848`（旧算法） | 15/15 满分 | 9/9 | 100/100 | 题面补上 4 色后首次全对 |
| 5 | `host-trial-v5` | `run-20261029-162223-19285b` | `5079d6dd5c99`（旧算法） | 15/15 满分 | 9/9 | 100/100 | 线索配比改为直述/相对/否定混排 |
| 6 | `host-trial-v11` | `run-20261029-170001-9300ba` | `013cc5d82c19`（新算法） | 15/15 满分 | 9/9 | 100/100 | 题库升 v1.1.0；题面随机化（I01 附件反转、C01 等式可成立、D03 无「仅门店有」） |
| **7（最终，报告取此轮）** | `host-trial-v12` | `run-20261029-171944-3ce70b` | `216b3ea47401`（新算法） | 15/15 满分 | 9/9 | **100/100** | Lead 修复 I03 分布（改成等概率 R1/R2/R3/R4，堵住「固定答 R4 拿 74%」）；再次全量同步后重跑 |

**怎么正确读这张表**：

- **同指纹内**（round 1 vs round 2，同旧算法同值）：同一把尺子的两次测量 → 94/100、94/100，**完全一致，方差为 0**。
- **跨版本不可比**：round 1–5 是 `exam/grader v1.0.0`（且期间题目反复修改），round 6–7 是 **v1.1.0**（但 6 与 7 指纹不同，见下）。**不得**表述为「从 94 提升到 100」或「成绩在 94–100 间波动」。
- **round 6 与 round 7 版本号同为 v1.1.0，但指纹不同**（`013cc5d82c19` vs `216b3ea47401`）——因为 6 之后 Lead 又改了 I03 的出题分布。**这说明：同一版本号内部也可能不可比，必须核对指纹**。（同时也是给 Lead 的提醒：这类改动应当升 `EXAM_VERSION`。）
- **跨指纹算法也不可比**：round 1–5 的指纹不含 prompt 探针，round 6 含。数值不同不代表题目不同，只代表算法不同。

> round 1/2 的 94 分同样是真实作答结果，**不是** oracle 生成的。它们恰好把 P1 暴露出来——这正是真实考试比 oracle 自测更有价值的地方。

> **round 6 的作答说明（上一轮，保留作对照）**：
> - **I01**：通知3 是「请务必附上预算表」→ `budgetAttached: true`。
> - **C01**：18+18+16 = **52 本身就成立** → `isCorrect: true`。
> - **R03**：5 素 + 1 鸡 = 6 份 / 13 蛋白 / 69 元。
> - **D03**：供应商表与门店表同 4 个 SKU → `onlyInStore: []`、`commonCount: 4`。
> - **D04**：`{gold:2, silver:0, normal:4}`。

> **round 7 的作答说明见 §2.3 上方的「反背题对照」表** —— 它与 round 6 在 I01 / C01 / D03 / D04 四处答案方向完全相反，两轮却都是满分，这是「真读题面」最直接的证据。
> - **C04**：qty 应为 3 → 22×3 = **66** → 66×0.8 = **52.8**。

---

## 7. 证据文件索引

| 文件 | 内容 |
|---|---|
| `report.html` / `report.json` / `report-summary.txt` | **最终考试报告**（100/100） |
| `report-{html,json,summary}.log` | 三次 report 命令的终端输出 |
| `answers-batch{1..4}.json` | 我逐题作答的原始答案文件 |
| `submit-batch{1..4}.log` | 四批 submit 的完整 CLI 输出（含下一批题面） |
| `batch1-final.json` | `start --json` 的完整返回 |
| `verify-skill.mjs` / `verify-skill.log` | 结构 + 可执行性验证（20 项） |
| `diagnose-r04.mjs` | R04 题面可推导性诊断（只读） |
| `diagnose-r04.log` | 修复**前**：2/2 seed 欠定 |
| `diagnose-r04-after-fix.log` | 修复**后**：5/5 seed 唯一 |
| `diagnose-r04-sweep.log` | 修复后 100 seed 批量自检：0 欠定 |
| `EVIDENCE-stale-install-r04-old-prompt.log` | 安装副本过期的直接证据 |
|  `runs/runs/` | 四轮运行的完整状态（`state.json`、原始答案、逐题证据）。注意目录嵌套：`LEZIBENCH_HOME=qa/host/runs`，而数据根下还有一层 `runs/<runId>/`，所以实际是 `qa/host/runs/runs/<runId>/` |

---

## 8. 结论

- **DSH 安装与发现：VERIFIED。** 用户级 `~/.agents/skills/lezi-bench/` 被 DSH 真实发现（skill 目录里出现条目，改名/删除都实时跟随）。
- **真实 Agent 考试：完成。** 4 批 × 4 题，全部由本 Agent 逐题作答，最终 100/100。
- **OpenClaw / Codex：NOT_TESTED。** 零一手证据，文档里不写任何路径与命令。
- **报告交付：本地文件。** `qa/host/report.html` 自包含、可离线打开，不依赖任何在线页面。

---

## 9. 报告截图说明（视觉证据）

HTML 报告是**自包含**的（零外链、无 CDN、无远程字体、无追踪脚本），单文件 31,605 字节，双击即可离线打开。

打开方式：

```powershell
# Windows
start "<workspace>\qa\host\report.html"
```

```bash
open ./qa/host/report.html        # macOS
xdg-open ./qa/host/report.html    # Linux
```

报告首屏可见内容（已逐项核对 HTML 源码）：

| 元素 | 值 |
|---|---|
| 总分 | `100 / 100` |
| 段位 | `卓越` |
| 四维 | 指令理解 25/25 · 逻辑推理 25/25 · 信息整理 25/25 · 状态追踪与纠错 25/25 |
| 段位阶梯 | 需要提升 0–49 / 基础 50–64 / 良好 65–79 / 优秀 80–89 / 卓越 90–100（当前档高亮） |
| 逐题判分 | 16 个可展开的 `<details>`，每题含逐条 PASS/FAIL 与理由、解析后的答案、答案 SHA-256 指纹 |
| 运行信息 | runId `run-20261029-171944-3ce70b`、exam v1.1.0、grader v1.1.0、契约 v1.0.0、种子 `host-trial-v12`、题库指纹 `216b3ea47401…`、起止时间、总耗时 186.6 秒、运行环境 |
| 成绩性质 | `本地规则核验 · 非认证成绩（LOCAL_SELF_TEST）` |
| 免责声明 | 明示「不能防止有意改题、改答案或改判分器，也不是权威认证或全球排行榜」 |

自检命令（确认零外链）：

```bash
node -e "const h=require('fs').readFileSync('qa/host/report.html','utf8');console.log('external refs:',/https?:\/\//.test(h))"
# 实测输出：external refs: false
```

同一份报告也可以从 CLI 直接以文本形式交给用户（`--format summary`），内容与上表一致，见 `report-summary.txt`。
