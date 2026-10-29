# 证据目录（EVIDENCE）

这个目录收录 LeziBench 的**真实运行证据**：不靠"我们测试过了"这种说法，
而是把命令输出、报告原文、失败轮次一并留档，供任何人复核。

> 全部数据来自 Windows 11 + Node v24.20.0 + DSH 桌面端的真实执行。
> 每题作答由 Agent 逐题读题面完成，**未使用** `scripts/oracle-answers.mjs`。

---

## 一、发布版成绩（exam v1.2.0 / grader v1.2.0）

| 文件 | 说明 |
|---|---|
| [`lead/RELEASE-v1.2.0.html`](lead/RELEASE-v1.2.0.html) | **自包含 HTML 报告**（零外链，可直接双击打开） |
| [`lead/RELEASE-v1.2.0.json`](lead/RELEASE-v1.2.0.json) | 结构化报告（含逐条 PASS/FAIL 依据） |
| [`lead/RELEASE-v1.2.0.txt`](lead/RELEASE-v1.2.0.txt) | 终端摘要 |

```
总分 100/100 · 卓越 · 四维各 25/25
exam v1.2.0 · grader v1.2.0
catalogFingerprint 4fa6c87169d69155c130e71c99d5d70b5639b1f64fad15a35069d47f9fa78330
seed final-release-120 · runId run-20261029-175734-f6bf0a
耗时 83.3 秒 · 16 题全 GRADED · 无 NEEDS_REVIEW
```

**这局的关键：代码版本、题库指纹、成绩三者完全对齐。**
报告里印的 `exam v1.2.0` 就是仓库 `package.json` 的版本 —— 不存在"拿旧版成绩宣传新版"的问题。

### 这不是背出来的：四道题的答案方向在两轮里完全相反

| 题 | 第 6 轮 | 第 7 轮 |
|---|---|---|
| `I01` `budgetAttached` | `true`（通知3 说"务必附上"） | `false`（通知3 说"不用交"） |
| `C01` `isCorrect` | `true`（18+18+16=52 成立） | `false`（60 ≠ 54） |
| `D03` `onlyInStore` | `[]` | `["C-315","G-721"]` |
| `D04` `counts.gold` | `2` | `1` |

两轮都满分。**记住上一轮答案、或照抄题面示例，在这四道上会直接判错。**

---

## 二、独立视角的真实考试（`host/`）

另一位验证者（skill-host）在同一台机器上独立完成的 7 轮真实考试，
包含**失败轮**与诊断过程，不是只挑高分轮。

| 文件 | 说明 |
|---|---|
| [`host/HOST_TRIAL.md`](host/HOST_TRIAL.md) | 完整流水：安装 → 发现 → 16 题作答 → 报告；含 §6 全部轮次指纹表 |
| [`host/report.html`](host/report.html) / [`host/report.json`](host/report.json) | 最新一轮（round 7，100/100，186.6 秒） |
| [`host/FINAL_CHECK.md`](host/FINAL_CHECK.md) | 交付前自检清单 |

**早期失败轮一并留档**：round 1/2 因 R04 题面欠定只拿到 3/9（94/100），
这个失败直接驱动了 R04 题面的修复。修复前后**不可比**（指纹不同），报告里如实标注。

---

## 三、验收审计（`audit/`）

独立审计员按"假定这个项目还没做完"的立场做对抗性验收，**结论一度是"不可发布"**。

| 文件 | 说明 |
|---|---|
| [`audit/ACCEPTANCE.md`](audit/ACCEPTANCE.md) | 五道门槛判定 + 34 条攻击测试 + 声称vs事实对照 |
| [`audit/attack.mjs`](audit/attack.mjs) | 10 类攻击脚本（路径穿越、注入、篡改、并发…） |
| [`audit/mutation-inject.mjs`](audit/mutation-inject.mjs) | 真实源码变异注入（比项目自带的变异测试更硬） |

**审计发现的最严重问题及处置**：

1. **测试自洽（已修）** — 早期所有测试的期望值都由被测的 `oracle()` 生成，
   `grade()` 内部又调同一个 oracle，等于"自洽即通过"。
   实证：把 I01 的 `budgetAttached` 取反后按题面诚实作答只得 1/4，但 `node --test` 仍 **95/95 全绿**。
   → 新增 [`tests/golden-fixtures.test.mjs`](../tests/golden-fixtures.test.mjs)：
   16 题**全部独立手算**（自写穷举、自己算小票、自己拓扑排序），不 import 任何 oracle 代码。
   已复验：在副本里翻转 I01 oracle → 立刻 3 条测试变红。

2. **版本号漂移（已修）** — 题目内容改过三次但版本号没动。→ 升到 1.2.0，并在报告中同时展示版本号与指纹。

3. **`docs/SCORING.md` 过期（已修）** — `build-scoring --check` 退出码 1。→ 重新生成，现与源码逐字一致。

> 审计的原始报告保留其**当时的结论**，未做美化改写。修复后的状态以本文件与
> `tests/` 的实际输出为准。这份"被发现→被修复"的记录本身，比一个从没被质疑过的项目更可信。

---

## 四、校准与区分度（`calibration/`）

| 文件 | 说明 |
|---|---|
| [`calibration/CALIBRATION.md`](calibration/CALIBRATION.md) | 多轮考试的分数分布、耗时、逐题通过率 |
| `calibration/reports/*.json` | 每局的原始 JSON 报告 |
| `calibration/answers/*.json` | 每局提交的原始答案 |

⚠️ **重要口径**：这里的"档位"是**同一个模型的不同作答策略**（仔细 / 正常 / 马虎），
**不是多个模型的横向对比**。不构成排行榜，不能用来评价任何模型的能力。

---

## 五、红队测试（项目根 `qa/` 下）

| 文件 | 说明 |
|---|---|
| [`equivalence.test.mjs`](equivalence.test.mjs) | 每题 ≥5 个等价答案必须满分 + ≥5 个对抗答案必须失分 |
| [`seeds.test.mjs`](seeds.test.mjs) | 15 个 seed × 16 题的稳定性 |
| [`antileak.test.mjs`](antileak.test.mjs) | 反泄漏：示例不得等于答案、答案不得跨 seed 恒定 |
| [`mutation-check.mjs`](mutation-check.mjs) | 变异检出率 |

红队累计报告并推动修复了 **25+ 个真实缺陷**，包括：
- 题目示例里直接印着正确答案（照抄就白拿分）
- D02 的答案恒为 C，一个字符串打穿整题
- C04 判分器引用未定义变量，导致整题 `SCORER_ERROR`
- R04 题面漏掉第 4 个人名，理论上限永远拿不到满分
- `publicCriteria` 文本与正确答案矛盾（比如文本写"必须答 false"，但正确答案是 true）

---

## 六、怎么自己复核

```bash
cd lezibench

# 1. 全部单元测试（含 16 道题的独立手算夹具）
node --test "tests/*.test.mjs"

# 2. 端到端（满分卷=100 / 全错卷=0 / 部分卷=原子分 / 幂等 / 路径安全）
node tests/e2e-run.mjs

# 3. 变异测试（证明测试真的会失败，不是摆设）
node tests/mutation.mjs

# 4. 文档与源码一致性
node docs/build/build-scoring.mjs --check

# 5. Skill 包合规
node scripts/sync-skill.mjs

# 6. 自己跑一局
node scripts/cli.mjs doctor
node scripts/cli.mjs start --mode standard --seed my-seed
```

**你那份报告里印的指纹，才是判断"能不能和别人的成绩比"的唯一依据。**
同版本号但不同指纹 = 两把不同的尺子，不可比。
