# 乐子跑分 LeziBench

**名字轻松，成绩认真。**

一个装进 Agent 就能用的能力自测：16 道题、100 分、4 个维度，**本地判分、本地出报告、全程不联网**。

不是学术地狱试卷，也不是娱乐玩具 —— 就是想知道"我这个 Agent 大概什么水平、哪块不稳"时，跑一局。

```bash
# 装好后，对 Agent 说一句就行
跑个分
# 或
/lezi-bench
```

---

## 它解决什么问题

多数"AI 跑分"要么依赖一个随时会挂的在线报告服务器，要么只给你一个总分不告诉你为什么。

LeziBench 的两条硬规定：

1. **每一分都能解释。** 每题拆成 2–3 个原子检查项，报告里逐条给 `PASS/FAIL` 和理由。没有"我觉得答得不错给 3.5 分"。
2. **报告在你自己的机器上。** 自包含 HTML，双击就开，断网也能看。不依赖任何网站活着。

---

## 100 分怎么组成

| 维度 | 题数 | 分值 |
|---|---|---|
| 指令理解（条件、例外、最后有效指令） | 4 | 25 |
| 逻辑推理（数值、约束、确定性推导） | 4 | 25 |
| 信息整理（筛选、去重、证据不足） | 4 | 25 |
| 状态追踪与纠错（更新、撤回、检错修正） | 4 | 25 |
| **合计** | **16** | **100** |

分值结构：4 道基础（4 分）+ 8 道标准（6 分）+ 4 道挑战（9 分）。分 4 批作答，每批 4 题。

段位（公开固定阈值，不随版本调整）：**卓越 90–100 · 优秀 80–89 · 良好 65–79 · 基础 50–64 · 需要提升 0–49**。

---

## 扣分长什么样

不是"扣了 6 分"，而是这样：

```
· R03 满足多条件的最低成本方案　4/6
    - R03.C1 份数 3（需≥4），蛋白质 9（需≥9）
```

或者：

```
· I02 白名单 + 例外 + 状态过滤　4/6
    - I02.C1 遗漏了应上架商品：S09
```

每一条都指名道姓：哪个条件、为什么不过。

---

## 安装

需要 **Node.js ≥ 18**。没有任何 npm 依赖，不联网。

**方式一：装到用户级（所有项目可用）**

```bash
git clone https://github.com/tbj0623/lezibench.git
cd lezibench
node scripts/sync-skill.mjs --target ~/.agents/skills/lezi-bench
```

**方式二：装到当前项目**

```bash
node scripts/sync-skill.mjs --target .agents/skills/lezi-bench
```

**方式三：用安装器（Windows / macOS / Linux）**

```bash
# Windows PowerShell
.\install\install.ps1
# macOS / Linux
bash install/install.sh
```

装完验证：

```bash
cd ~/.agents/skills/lezi-bench && node scripts/cli.mjs doctor
```

看到「全部通过，可以开考。」即成功。

> 各宿主的确切发现路径、已验证/未验证状态，见 [docs/COMPATIBILITY.md](docs/COMPATIBILITY.md)。**不要跳过这份文档** —— 有些平台我们没能实测，就明确标了未验证。

---

## 直接当 CLI 用

不想装成 Skill，也可以直接跑：

```bash
node scripts/cli.mjs doctor
node scripts/cli.mjs start --mode standard --json      # 拿第 1 批 4 题
node scripts/cli.mjs submit --run <RUN_ID> --batch 1 --answers-file answers.json
node scripts/cli.mjs resume --run <RUN_ID>             # 断点续跑
node scripts/cli.mjs report --run <RUN_ID> --format html
node scripts/cli.mjs regrade --run <RUN_ID>            # 只重判，不改原答案
```

答案文件格式：

```json
{
  "answers": {
    "I01": { "deadline": "周三上午10点", "budgetAttached": false },
    "R01": { "subtotal": 57, "total": 52 }
  }
}
```

---

## 支持环境（真实状态，不是宣传口径）

| 环境 | 状态 | 说明 |
|---|---|---|
| Windows + Node 24 | ✅ **VERIFIED** | 两轮真实 Agent 完整考试（100/100、88/100） |
| DSH 桌面端 | ✅ **VERIFIED** | Skill 已被实际发现并从目录触发 |
| macOS / Linux | ⚠️ **PARTIAL** | 代码路径已覆盖、有测试，但未在真机跑完整局 |
| Node 18 / 20 / 22 | ⚠️ **PARTIAL** | 语法与 API 已按 ≥18 编写，CI 覆盖，未逐一真机验证 |
| OpenClaw | ❌ **NOT_TESTED** | 本次未能取得一手证据，**不要采信任何未经核实的安装命令** |
| Codex | ❌ **NOT_TESTED** | 同上 |

---

## 它不是什么（重要）

- **不是认证考试。** 题库、评分规则、判分器全是公开源码，任何人都能读、能改。
- **不能防作弊。** 客户端在你机器上跑，改答案、改判分器都能做到。它的价值是"诚实自测"，不是"可信认证"。
- **不是全球排行榜。** 没有中心服务器收集成绩，也不做跨用户比较。
- **不是全方位能力评估。** 16 道题测的是四个基础方向，测不出创造力、长上下文记忆、工具编排这些。
- **不同版本分数不可比。** 报告里印着 `examVersion` 和 `graderVersion`，跨版本硬比没有意义。

我们宁可把话说小，也不愿意给你一个看起来很厉害但站不住的数字。

---

## 与虾跑分的差异（有实测依据）

2026-10-29 在隔离环境实测了虾跑分（`paofen.cocoloop.cn`），完整记录见 [research/COMPETITOR_TRIAL.md](../research/COMPETITOR_TRIAL.md)。三条可复现的观察：

1. **报告页 502。** `finish` API 正常返回 `reportUrl`，但该 URL 连续 3 次打不开（502 / 超时 / 502），同期 API 与首页均为 200。而它的 skill.md 写明"报告链接是用户查看详细报告的**唯一途径**"。
2. **重复提交会静默跳题。** 重复提交已答题目，服务返回 200 但 `nextQuestion` 直接跳到下下题，被跳过那题永久丢失且无提示。任何"超时重试"的客户端都会静默丢分。
3. **段位口径不一致。** 首页文案称 8 个等级、S=93+，但同页图例与前端常量只有 6 档且无字母等级。

LeziBench 对应的做法：报告本地生成、提交严格幂等（相同 payload 重复提交不重复计分、不同 payload 拒绝覆盖）、段位表写死在代码里并被测试锁定。

**这不是说我们更好。** 我们是新项目、题量小、没有真实用户量。这三条只说明我们刻意避开了这几个具体问题。

---

## 开发

```bash
node --test "tests/*.test.mjs"   # 单元 + 契约 + 回归测试
node tests/e2e-run.mjs           # 端到端：满分卷=100 / 全错卷=0 / 部分卷=原子分
node tests/mutation.mjs          # 变异测试：证明测试真的会失败
node scripts/sync-skill.mjs      # 构建可安装的 Skill 包并校验
node scripts/demo.mjs            # 生成带 DEMO 水印的演示报告
```

测试里锁着的关键不变量：

- 16 题 / 100 分 / 4 维各 25 / 0–100 每个整数都可达
- 正确答案必定满分，错误答案必定 0 分，部分正确得对应原子分
- 分值越界、NaN、Infinity、负数一律拒绝
- 冲突答案不得被"挑一个有利的"
- 缺答默认阻断提交（除非显式 `--allow-missing`）
- 重判必须从原始答案重算哈希，不信任文件里的字段

---

## 许可

MIT。见 [LICENSE](LICENSE)。

题目与评分规则欢迎审计、提 issue、提 PR —— 但**不要**提"让我这题更容易得分"的 PR。
