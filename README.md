<div align="center">

# 乐子跑分 · LeziBench

**名字轻松，成绩认真。**

给 AI Agent 用的本地能力自测：16 题 / 100 分 / 4 个维度，判分不经过任何服务器，<br>
报告落盘成文件，每一条扣分都能对应到源码里一个带编号的条件。

`Node ≥ 18.17` · 零依赖 · 零联网 · MIT

</div>

<br>

<div align="center">
  <img src="website/assets/screenshot-home.png" alt="LeziBench 官网首页：左侧说明与三个入口，右侧是一张标着 DEMO · 演示数据的成绩卡，下方是 16 题 / 100 分 / 4 维 × 25 / 0 次请求" width="900">
  <br>
  <sub><b>图中的成绩卡是 DEMO 演示数据</b>（由真实判分器算出，答卷为人为构造），不代表任何真实用户、模型或产品。</sub>
</div>

<br>

---

## 它解决什么问题

跑分工具通常把成绩放在一个在线页面上。那个页面一旦打不开，这次跑分就等于没发生 ——
分数算出来了，但你拿不到逐题依据，也没法复核。

LeziBench 换了个交付方式：

| | 常见在线跑分 | LeziBench |
|---|---|---|
| 判分在哪 | 中心服务器 | **你自己机器** |
| 报告是什么 | 一个 URL | **一个文件**（自包含 HTML，双击即开） |
| 断网能用吗 | 不能 | **能** |
| 扣分依据在哪 | Agent 转述给你 | **写在报告里，逐条带条件 ID** |
| 能防作弊吗 | 常被宣称 | **不宣称**（题库公开） |

> **实测于 2026-10-29**：我们对虾跑分（paofen.cocoloop.cn）做了一次匿名黑盒走查。
> `finish` 接口正常返回了 `reportUrl`，但该 URL 连续三次（502 / 超时 / 502）都打不开，
> 而同一域名下 `/api/*` 和首页都是 200。
> 完整记录与证据见 [`evidence/research/COMPETITOR_TRIAL.md`](evidence/research/COMPETITOR_TRIAL.md)。
> 这不构成对对方整体产品的判断 —— 只记录我们在那个窗口里实际看到的东西。

---

## 30 秒安装

前置条件：**Node.js ≥ 18.17**。没有 `npm install`，仓库里没有运行时依赖。

```bash
git clone https://github.com/tbj0623/lezibench.git
cd lezibench
node scripts/cli.mjs doctor
```

`doctor` 五项全 ✔ 并打印「全部通过，可以开考。」就可以用。

**想装成 DSH Skill（已实测被发现）：**

```bash
node scripts/sync-skill.mjs --target ~/.agents/skills/lezi-bench
```

> 目录名必须是 **`lezi-bench`**（带连字符）。Agent Skills 规范要求 frontmatter 的 `name`
> 与父目录名完全一致；装成 `lezibench/` 会被静默跳过。

> ⚠️ **`npm link` / `npx lezi-bench` 未实测。** `package.json` 里声明了 `bin`，
> 但我们没有实际执行过这些调用方式，所以不写「可用」。

---

## 一键开考

```bash
node scripts/cli.mjs start --mode standard --seed demo-2026 --json
```

返回 `runId` 和第 1 批的 4 道题。答完写成一个 JSON 文件提交：

```bash
node scripts/cli.mjs submit --run <RUN_ID> --batch 1 --answers-file answers-batch1.json
```

`--batch` 依次 2 / 3 / 4。全部提交后出报告：

```bash
node scripts/cli.mjs report --run <RUN_ID> --format html     # 自包含 HTML，双击即开
node scripts/cli.mjs report --run <RUN_ID> --format summary  # 纯文本，可直接贴进对话
node scripts/cli.mjs report --run <RUN_ID> --format json     # 完整证据
```

答案文件格式（键是本批 4 道题的 id）：

```json
{
  "answers": {
    "I01": { "deadline": "周三上午10点", "budgetAttached": false },
    "R01": { "subtotal": 70, "total": 65 },
    "D01": { "list": ["南京", "苏州", "杭州"] },
    "C01": { "isCorrect": false, "correctTotal": 55 }
  }
}
```

> 上面是格式示意，**数值不是答案** —— 每局的日期、金额、名单都由 seed 生成，照抄这几行拿不到分。
> 实际作答以 `start` 打印的题面为准；每道题后面还会附上「评分条件（公开）」清单。
> （我们实测过：把题面里的 JSON 示例原样提交，16 题 × 200 seed 的平均得分全部为 0。
> 详见 [docs/LIMITATIONS.md §8](docs/LIMITATIONS.md)。）

> **缺答默认阻断提交。** 少答一题会直接报错并列出缺哪几题，避免「只答了 3 题就提交、白丢 6 分却没察觉」。
> 确实要以缺答 0 分提交，才加 `--allow-missing`。

---

## 100 分怎么组成

四个维度各 25 分，**维度之间不加权、不换算** —— 总分就是十六道题得分直接相加。

| 维度 | 题号 | 基础 4 分 | 标准 6 分 × 2 | 挑战 9 分 | 合计 |
|---|---|---|---:|---:|---:|
| **指令理解** | I01–I04 | I01 | I02 · I03 | I04 | 25 |
| **逻辑推理** | R01–R04 | R01 | R02 · R03 | R04 | 25 |
| **信息整理** | D01–D04 | D01 | D02 · D03 | D04 | 25 |
| **状态追踪与纠错** | C01–C04 | C01 | C02 · C03 | C04 | 25 |
| **合计** | 16 题 | 4 题 | 8 题 | 4 题 | **100** |

计分单位是**原子条件**（criterion）：每条带 id、分值和一句可核对的条件文本，判分器逐条判真假，
题目得分 = 通过的条件分值之和。没有半分，没有「整体印象分」。

这些数字不是写在文案里的 —— `assertCatalogIntegrity()` 在每次开考之前逐条校验题数、满分、
维度合计、难度分布、子条件合计，以及 **0–100 每个整数分是否都可达**。任何一条不成立就拒绝出题。

段位：**卓越 90–100 · 优秀 80–89 · 良好 65–79 · 基础 50–64 · 需要提升 0–49**。

逐题、逐条（16 题 / 44 条条件）见 **[docs/SCORING.md](docs/SCORING.md)** —— 那份文件由脚本从源码生成，不手抄。

---

## 扣分长什么样

报告里每条扣分都带条件 ID 和具体理由。下面三条摘自一份演示运行的判分器原始输出
（演示用途，非真实成绩）：

```
R01  购物小票的真实合计   1/4
  FAIL  R01.C2  3分  应付款应为 65，实际为 70

R04  六线索排除推理（唯一解）   3/9
  FAIL  R04.C2  3分  3/4 人颜色正确
  FAIL  R04.C3  3分  3/4 人的位置与颜色同时正确

D02  区分事实、推断与信息不足   0/6
  FAIL  D02.C1  2分  答案应为 C（信息不足），实际为「A」
  FAIL  D02.C2  2分  理由必须同时引用甲、乙的实际支出并说明方向
  FAIL  D02.C3  2分  结论本身错误，无法通过此项
```

三个可以读出来的机制：

- **同一题内的条件独立计分。** R01 算对原价拿 1 分，算错应付款再丢 3 分 —— 不会因为「思路对」给中间分。
- **挑战题要求「全部正确」才给分。** R04 三条各 3 分，位置全对 / 颜色全对 / 配对全对，错一个人同时丢两项。
- **误区会被单独立成一条条件。** D02.C3 专门盯「有没有把预算当成实际支出」，
  即使结论碰巧蒙对，这一条照样独立判定。

> 想看完整的样子：**[website/demo.html](website/demo.html)**（醒目标注 DEMO · 演示数据），
> 或直接打开 **[website/assets/demo-report.html](website/assets/demo-report.html)**。

---

## 支持环境

这张表按「有没有第一手证据」标注，不按「理论上应该能跑」标注。

| 宿主 / 平台 | 状态 | 说明 |
|---|---|---|
| **DSH**（DeepSeek​ Harness） | `VERIFIED` | 用户级 `~/.agents/skills/lezi-bench/` 安装后 skill 目录里出现该条目；完整走完 4 批 16 题并生成三种格式报告 |
| **Node.js** | `VERIFIED` | 实测 v24 通过；`doctor` 要求 ≥ 18.17；CI 矩阵覆盖 18 / 20 / 22 |
| **Windows** | `PARTIAL` | 全流程在本机跑通；路径、编码、原子写的 Windows 分支都有实现，但未做广泛环境矩阵 |
| **macOS / Linux** | `PARTIAL` | 数据目录与路径分支有实现，`doctor` 逻辑一致；没有真机跑完整局的记录 |
| **OpenClaw** | `NOT_TESTED` | 本次出口被封（`docs.openclaw.ai` 连续超时），检索也未命中一手材料。安装命令、目录位置、优先级三项**不给结论** |
| **Codex** | `NOT_TESTED` | 未取得任何一手证据，不写「读某个目录」这类未经验证的说法 |

> `NOT_TESTED` 的意思只是**我们没验证过**，不是断言它不能用。
> 核实记录见 [`evidence/research/PLATFORM_NOTES.md`](evidence/research/PLATFORM_NOTES.md)，逐宿主说明见 [docs/COMPATIBILITY.md](docs/COMPATIBILITY.md)。

---

## 隐私

**不联网、不上传、不建账号。** 不是「默认不上传」，是代码里没有网络调用：

```bash
grep -rnE "fetch\(|node:(http|https|net|dgram)" src/ scripts/   # 无输出
```

答案与报告写在本机数据目录：

| 平台 | 默认路径 |
|---|---|
| Windows | `%LOCALAPPDATA%\LeziBench` |
| macOS | `~/Library/Application Support/LeziBench` |
| Linux | `$XDG_DATA_HOME/lezibench` 或 `~/.local/share/lezibench` |

可用 `LEZIBENCH_HOME` 覆盖。删目录就删干净了 —— 没有注册表项、没有后台服务。

完整说明（含目录结构、只删某次运行、删答案保留分数）：**[docs/PRIVACY.md](docs/PRIVACY.md)**。

---

## 实测样例

**同一版本（v1.2.0）下跑过两局独立的真实考试，题目由 seed 随机生成，两局的具体题目并不相同：**

| 运行 | 分数 | 耗时 | 说明 |
|---|---|---|---|
| **A（主证据）** | **98 / 100** · 卓越 | 96.5s | 漏判一个亏本 SKU，`D03` 扣 2 分 |
| B | **100 / 100** · 卓越 | 123.7s | 另一个 seed，答对全部 16 题 |

两局均为 `examVersion 1.2.0` · `graderVersion 1.2.0`，
`catalogFingerprint` 同为 `a72cf9c4e4ab…`。

> **注意「同指纹」的含义**：指纹只采样 `fp-probe-1` / `fp-probe-2` 两个探针 seed，
> 它保证的是「**评分条件 + 探针 seed 下的题面**」一致，**不保证所有 seed 的题面一致**。
> 这两局的实际题目是完全不同的（例如 `R02` 的正解一局是 `[A,E,D,B,C]`、另一局是 `[C,D,A,E,B]`）。
> 所以准确的说法是**同一把尺子量了两份不同的卷子**，而不是「同一份卷子跑了两遍」。

证据：[`evidence/host/report.html`](evidence/host/report.html)（98 分）·
[`evidence/lead/second-run-100.html`](evidence/lead/second-run-100.html)（100 分）。

### 为什么把 98 分放在前面

因为 98 分那一局**真的答错了一道题，而判分器准确指出了错在哪**：

```
D03.C1  亏本 SKU 应为 A-101, C-315，实际为 C-315
```

供应商进价 `A-101 = 56`、门店售价 `53`；`C-315` 进价 `21`、售价 `16`。
两件都亏本，答题者只挑出了 `C-315`，漏了 `A-101`，扣 2 分。**没有重跑、没有挑分。**

一个带具体失分点的 98 分，比一个满分更能说明：

- 判分器**真的在逐条比对**，不是「答了就给分」；
- 分数**真的会因为漏看一个条件而下降**；
- 你能拿到一份**告诉你具体错在哪**的报告，而不只是一个数字。

两局放在一起还说明：**98 不是「题目太难」，100 也不是「判分放水」**——
同一套评分规则下，答得全对就 100，漏一个条件就 98。
而且这是**两个不同的随机样本**都表现稳定，不是一份卷子跑了两遍。

> ⚠️ **这是两次运行的历史记录，不是本产品的预期分数。**
> 题目由 seed 生成、且随版本变化；你在自己机器上跑出来的分数会不同 ——
> 请以你那份报告里印的版本号与指纹为准，不要拿这两个数字当基准线。

### 题目不是固定答案表

题库把大量题面改成 seed 随机生成，同一道题在不同 seed 下会「反着问」：

| 题 | 第 6 轮 | 第 7 轮 |
|---|---|---|
| `I01` `budgetAttached` | `true` —— 通知 3 说「务必附上」 | `false` —— 通知 3 说「不用交」 |
| `C01` `isCorrect` | `true` —— 18+18+16 = 52，等式成立 | `false` —— 60 ≠ 54，等式不成立 |
| `D03` `onlyInStore` | `[]` | `["C-315", "G-721"]` |
| `D04` `counts.gold` | `2` | `1` |

更直接的一个例子是 **R02（依赖排序）**：v1.2.0 起步骤代号由 seed 随机分配。
某一局题面里「收货入库」代号是 `A`、「开放销售」代号是 `C`，正解是 `["A","E","D","B","C"]`；
另一局里「收货入库」是 `C`、「开放销售」是 `B`，正解是 `["C","D","A","E","B"]`。
**背 `[A,B,C,D,E]` 会直接判错。**

> **背答案能拿多少分？我们量化过。** 「完全不读题面、只给固定答案」的策略跑 400 个 seed 取平均：
> 每题填第一个选项字母约 **5.0 / 100**、每题都答 `C` 约 **1.3 / 100**、全填 `0` 或 `{}` 都是 **0.00**。
> 照抄题面里的 JSON 格式示例更好笑：16 道题 × 200 seed，**平均得分全部为 0**。
> 所以背答案拿不到分。详见 [docs/LIMITATIONS.md §8](docs/LIMITATIONS.md)。
>
> **但这不等于「防作弊」。** 题库、评分条件、判分器全是公开源码，`state.json` 本地无签名校验，16 题固定。
> 「背答案没用」成立，「防作弊」不成立 —— 这两件事不一样。我们**不**把防作弊当卖点。

> 多轮**未满分**与**早期失败**记录一并留档（包括因 R04 题面欠定只拿 3/9 的轮次）。
> 完整 8 轮、种子与指纹见 [`evidence/host/HOST_TRIAL.md` §6](evidence/host/HOST_TRIAL.md)。
>
> 这些数字只说明「这套流程能跑通、判分结果可复现」，**不构成对任何模型能力的评价**。
> 全部为本地公开题库自测，非认证，不防作弊。

---

## 诚实边界

这一节比上面任何一节都重要。

- **不是认证。** 没有第三方见证、没有身份核验、没有被测对象锁定。每份报告自己就印着 `非认证成绩（LOCAL_SELF_TEST）`。
- **不防作弊。** 题库、评分条件、判分器全在源码里，任何人都能读、能改。改了就失去意义 —— 这是设计前提，不是漏洞。
- **跨版本不可比。** 只有 `examVersion` 与 `graderVersion` 相同、且 `catalogFingerprint`（题库指纹）也相同时，
  两次运行才算同源。指纹覆盖「全部评分条件 + 探针 seed 下的题面」，但探针只有两个固定 seed，
  所以它**不能**保证「所有 seed 的题面都逐字相同」—— 这是概率性覆盖，不是完备校验。
- **16 题覆盖面有限。** 测不出长上下文、多轮工具调用、代码工程能力、开放式写作、事实准确性、安全性、多语言。
- **耗时不是能力指标。** 受宿主机、网络往返、框架开销影响，不要用它排名。
- **单次运行的方差不可忽略。** 要比就看分布，别比一次。

完整版（含「什么样的比较没有意义」六种情形）：**[docs/LIMITATIONS.md](docs/LIMITATIONS.md)**。
方法论（为什么这样设计、为什么不用 LLM 当裁判、NEEDS_REVIEW 何时触发、版本化）：**[docs/METHODOLOGY.md](docs/METHODOLOGY.md)**。

---

## 与虾跑分的差异

以下全部来自 **2026-10-29** 的匿名黑盒实测（23 次 HTTP 请求，未登录、未上传任何数据、未复制对方题库）。
每条都标了证据位置；没被证实的事一律不写。

| 实测发现的问题 | LeziBench 的做法 |
|---|---|
| **报告页 502。** `finish` 返回了 `reportUrl`，但连试三次（502 / 超时 / 502）都打不开；同域 `/api/*` 与首页均 200 | 报告**本地生成**为文件，双击即开，断网可看 |
| **重复提交静默跳题。** 重复提交 q04 后，下一题直接变 q06，q05 被永久跳过且无提示 | 提交带 payload 哈希：相同 → `idempotent`，不推进；不同 → 拒绝覆盖 |
| **文档与实现不一致。** 首页 FAQ 说「8 批 × 2 题」，但 API 全程逐题下发、无任何 batch 字段 | 批次是硬约束，题库自检要求每批恰好 4 题，写错批次直接报错 |
| **段位口径三处打架。** 8 级 / 6 档 / 93+ / 90+ 并存 | 只有一套 `LEVELS` 常量，报告、网站、终端引用同一份 |
| **扣分依据只对模型可见。** `details` 只在 API 响应里，需 Agent 主动转述 | 逐条扣分**直接写进报告**，用户可见 |

三条「我们学它的」：逐题 `details` 的思路、统一的中文错误文案、skill 驱动的简单交互模型。
一条「明确不学」：用提示词强制 Agent「必须展示链接」。

证据与完整分析：**[`evidence/research/COMPETITOR_TRIAL.md`](evidence/research/COMPETITOR_TRIAL.md)**。

---

## 开发与测试

```bash
node --test              # 单元测试 + 契约测试 + 回归测试 + 变异测试
node tests/e2e-run.mjs   # 端到端全流程
```

`e2e-run.mjs` 覆盖七组断言：

1. 满分卷必须拿 100，四维各 25；
2. 全错卷必须拿 0 且状态仍为 `COMPLETED`（答案错 ≠ 系统故障）；
3. 只答对第一题时精确得到该题原子分 4；
4. 未答完时状态不是 `COMPLETED`、不给段位；
5. 相同 payload 重复提交按幂等处理、不同 payload 覆盖被拒绝、`regrade` 不改原答案；
6. 无法解析的答案进入 `UNPARSEABLE` 而非当知识错误扣 0；
7. 非法 runId、跨批题目 id、非法批次一律被拒绝。

**改题库后记得重新生成文档与站点**（数字全部自动派生，不手抄）：

```bash
node docs/build/build-scoring.mjs           # 重新生成 docs/SCORING.md
node docs/build/build-scoring.mjs --check   # CI 用：不一致则退出码 1
node website/build/build-site.mjs           # 逐题页 + DEMO 报告 + 首页成绩卡 + 版本号/指纹
```

网站是纯静态、零依赖、全部相对路径，可以直接部署在 `https://<owner>.github.io/<repo>/` 子路径下。

参与贡献之前请读 **[CONTRIBUTING.md](CONTRIBUTING.md)**：
加题必须同时提 oracle 与 ≥5 正例、≥5 反例；**不允许**改判分口径来刷分。

---

## 文档

| 文件 | 内容 |
|---|---|
| [docs/METHODOLOGY.md](docs/METHODOLOGY.md) | 为什么是这 4 维、为什么用原子条件、为什么不用 LLM 当裁判、等价答案怎么归一、NEEDS_REVIEW 何时触发、版本化 |
| [docs/SCORING.md](docs/SCORING.md) | 16 题 44 条评分条件的完整清单（脚本生成，与源码逐字一致） |
| [docs/LIMITATIONS.md](docs/LIMITATIONS.md) | 测不了什么、什么样的比较没有意义、V1 的具体边界 |
| [docs/PRIVACY.md](docs/PRIVACY.md) | 数据存在哪、目录里有什么、怎么删 |
| [docs/FAQ.md](docs/FAQ.md) | 常见问题 |
| [docs/INSTALL.md](docs/INSTALL.md) | 详细安装说明 |
| [docs/COMPATIBILITY.md](docs/COMPATIBILITY.md) | 各宿主适配与验证状态 |

官网（GitHub Pages）：[`website/index.html`](website/index.html) —— 首页 · 评分方法 · 安装 · 演示报告 · 局限 · FAQ

---

## License

[MIT](LICENSE) © LeziBench contributors

题库与判分器公开可审计。改了它当然能拿高分 —— 但那份分数只对你自己有意义。
