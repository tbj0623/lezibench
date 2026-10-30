# v1.4.0 真实 Agent 试跑记录（原始证据）

> 本文件只记录**真实发生**的运行。任何"未验证"的地方都明确标出来，不用推测填补。

## 0. 运行环境

| 项 | 值 |
|---|---|
| 时间 | 2026-10-30 |
| 宿主 | DSH（DeepSeek Harness）桌面端 |
| 模型 | `deepseek-v4.1-flash` |
| 宿主 OS | Windows 11 x64 |
| Node | v24.20.0 |
| 安装方式 | `node scripts/cli.mjs install --target <临时技能根>`（真实安装器，非直接跑仓库） |
| examVersion / graderVersion | 1.4.0 / 1.4.0 |
| contractVersion | 1.1.0 |
| catalogFingerprint | `565c660612218e0bf2e424cf058e2e50559b97345220a9777b4fddfd5ce03ab8` |
| 答题侧隔离 | 每个考生独立 `LEZIBENCH_HOME`，互不可见 |
| 答题纪律 | 考生只允许读 `SKILL.md` + CLI 输出（题面 / 公开 criteria）；**禁止**读 `src/exam/items/*.mjs`、`scripts/oracle-answers.mjs`、`tests/`、`docs/SCORING.md` |

> ⚠️ 这条纪律**靠执行纪律，不是技术强制**。考生事后均声明未打开禁止文件，
> 并且下文给出了「不是照抄 oracle」的旁证。但请把它当作自律声明，不要当作防作弊保证。

## 1. 两局成绩

| | Run A | Run B |
|---|---|---|
| runId | `run-20261030-043736-07711c` | `run-20261030-043734-2088b5` |
| seed | `exam-run-A-2026` | `exam-run-B-2026` |
| 总分 | **96 / 100** | **100 / 100** |
| 段位 | 卓越 | 卓越 |
| 状态 | `COMPLETED`（16/16 题，pendingCount 0） | `COMPLETED`（16/16 题，pendingCount 0） |
| 耗时 | 271.8 s | 216.4 s |
| 失分题 | D02（2/6） | 无 |
| 报告 | `runA-96-report.{html,json}` · `runA-96-summary.txt` | `runB-100-report.{html,json}` · `runB-100-summary.txt` |

### 逐批（分母 16/24/24/36，累计 16/40/64/100）

| 批 | Run A | 累计 | Run B | 累计 |
|---|---|---|---|---|
| 1 | 16/16 | 16/16 | 16/16 | 16/16 |
| 2 | 20/24 | 36/40 | 24/24 | 24/24 → 40/40 |
| 3 | 24/24 | 60/64 | 24/24 | 64/64 |
| 4 | 36/36 | 96/100 | 36/36 | 100/100 |

### 四维

| 维度 | Run A | Run B |
|---|---|---|
| 指令理解 | 25/25 | 25/25 |
| 逻辑推理 | 25/25 | 25/25 |
| 信息整理 | **21/25** | 25/25 |
| 状态追踪与纠错 | 25/25 | 25/25 |

## 2. Run A 的唯一失分（判分器真的在逐条比对）

```
D02「区分事实、推断与信息不足」  2/6
  ✘ D02.C1  答案应为 C，实际为「A」
  ✘ D02.C3  结论本身错误，无法通过此项
  ✔ D02.C2  依据引用项
```

考生自己复盘：它把「四月｜甲」那一行**实际支出为空、66 万只是"预计、尚未入账"**这个缺口忽略了，
直接拿甲项目的累计实际支出与乙项目比较，得出"甲更省"（选 A）。正确结论是 **C 信息不足**。

> 这条记录的价值：**判分器确实会因为一个具体的推理疏漏扣掉具体分数，并指出扣在哪个条件上。**
> 这正是「成绩认真」要的证据 —— 不是"看起来 96 分"，而是"96 分、差在 D02.C1 和 D02.C3"。

## 3. 为什么可以认为两局不是"照抄标准答案"

考生 B 拿到 100/100，必须排除它读 oracle 的可能。旁证：

1. **R02 的作答与 oracle 不同。** R02 是「求一个合法拓扑序」，合法解不唯一。
   - 考生 B：`L D C K F G B H I E J A`
   - oracle：`K F L D G E C J B H I A`
   两者都是合法序，但**不是同一个** —— 照抄不可能抄出另一个合法解。

2. **考生给了 oracle 里没有的字段。** 例如 R01 的 oracle 只回 `subtotal`/`total`，
   考生 B 回了完整的 `subtotal/afterPromo/couponCut/total`（764 / 646 / 15 / 631，且 764−646−15=631 自洽）。

3. **考生自建了独立求解脚本。** 两位考生都自述写了暴力/DP 脚本（只喂题面约束），
   例如 B 用 `18×e + 3×b = 1101` 并枚举出次优 1104 来自证最优；A 用 518,400 全排列验证 R04 唯一解。

4. **两局对同一题的答案是不同分支。** A、B 的 R02 序不同、R04 座位排列不同、D04 分布不同（seed 不同所致）。

> 仍要说明边界：这些是**旁证**，不是密码学证明。公开题库的本地自测天生无法防作弊。

## 4. 这份数据**不能**证明什么（必须明说）

- **不能证明"v1.4.0 有区分度"。** 两局是**同一个模型**的不同 seed（96 / 100），
  这最多说明"同一模型跑两次会波动 4 分"，**不构成跨模型区分度**。
  跨模型区分度需要至少 3 档不同能力的模型 × 每档 3 seed，本轮**没有**这个资源。
- **不能证明"题目已经够难"。** Run B 拿了 100 分且**全程没有任何一个评分条件失败**。
  按本项目自己定的标准（见 `docs/VALIDITY.md`），这恰恰说明**题目对当前这一档模型仍然偏浅**。
  我们**没有**为了压分去改判分标准或加难度 —— 如实记录，并把这条写进 README 与网站。
- **不能证明"防作弊"。** 见上文第 3 节的边界说明。
- **未覆盖平台**：Linux / macOS 的安装与考试链路本轮**未在真机跑**。
  CI 会在 ubuntu / macos runner 上跑单测，但那是测试层，不等于"装成 Skill 并被宿主发现"。

## 5. 独立校准状态

**`PENDING_INDEPENDENT_CALIBRATION`**

需要补充：至少 2~3 档不同能力（或不同可复核配置）的独立模型，每档 ≥3 个 seed，
统计每局总分 / 四维分 / 逐题通过率 / 标准差 / 中位耗时。
在此之前，本仓库**不宣称**"有区分度"，也**不宣称**"难度验收通过"。

## 6. 复现方式

```bash
# 1) 装到一个临时技能根（不污染你的真实目录）
node scripts/cli.mjs install --target /tmp/lezi-skill

# 2) 开一局（换任意 seed）
LEZIBENCH_HOME=/tmp/lezi-run \
  node /tmp/lezi-skill/lezi-bench/scripts/cli.mjs start --mode standard --seed <任意字符串> --json

# 3) 自己作答 4 批后
LEZIBENCH_HOME=/tmp/lezi-run \
  node /tmp/lezi-skill/lezi-bench/scripts/cli.mjs submit --run <runId> --batch <1..4> --answers-file answers.json

# 4) 出报告
LEZIBENCH_HOME=/tmp/lezi-run \
  node /tmp/lezi-skill/lezi-bench/scripts/cli.mjs report --run <runId> --format html
```
