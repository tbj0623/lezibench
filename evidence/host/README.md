# evidence/host — 真机考试证据（DSH 宿主）

> 本目录是 **一次真实 Agent 考试**的完整留档，用于回答「你们到底跑没跑过」这个问题。
> 全部文件由脚本从工作区生成并**脱敏**（个人绝对路径 → `<repo>` / `<home>` / `<LEZIBENCH_HOME>`），可用 `qa/host/publish-to-evidence.mjs` 复现。

## 1. 这一局的结果

| 项 | 值 |
|---|---|
| runId | `run-20261029-185817-d153d2` |
| seed | `host-trial-v13` |
| **总分** | **98 / 100　段位：卓越** |
| 四维 | 指令理解 25/25 · 逻辑推理 25/25 · **信息整理 23/25** · 状态追踪与纠错 25/25 |
| 耗时 | 96.5 秒（`durationMs` 96531） |
| exam / grader / contract | **v1.2.0** / **v1.2.0** / v1.0.0 |
| `catalogFingerprint` | `a72cf9c4e4abcd1f7474e4fc83f30e7f0b9c69b4a7ff3bfe26015a370b7a5026` |
| 宿主 | DSH（DeepSeek Harness）· Windows 11 · Node v24.20.0 |

**失分原因（如实记录）**：D03「两表合并与冲突检测」漏判了一个亏本 SKU。
供应商进价 `A-101=56`、`C-315=21`；门店售价 `A-101=53`、`C-315=16`。
只填了 `C-315`（16 < 21 亏本），**漏了 `A-101`（53 < 56 同样亏本）**，得 4/6。

> 我们刻意保留这个失分点对外展示 —— 它证明判分器在**逐条比对**，而不是「怎么答都满分」。

## 2. 文件索引

| 文件 | 内容 |
|---|---|
| `report.html` | **自包含 HTML 报告**（零外链，双击即可打开） |
| `report.json` | 完整报告数据（含逐题 `parsedAnswer`、每条 criterion 的 PASS/FAIL 与理由） |
| `report-summary.txt` | 终端版成绩摘要 |
| `HOST_TRIAL.md` | 完整命令流水、8 轮历史、问题清单、证据链 |
| `FINAL_CHECK.md` | 交付前校验记录（测试、同步、报告一致性） |
| `answers-batch1..4.json` | **我逐题作答的原始答案**（证明不是 oracle 生成） |
| `submit-batch1..4.log` | 四批 `submit` 的 CLI 原始输出 |
| `batch1-v13.json` | `start --json` 的完整返回 |
| `report-*.log` | 三次 `report` 命令输出 |
| `verify-skill.mjs` / `verify-skill.log` | Skill 结构 + 可执行性验证 |

## 3. 如何自行核验

```bash
# 1) 报告里的数字自己算得出来
node -e "const j=require('./report.json');console.log(j.summary.total, j.summary.dimensions.map(d=>d.awarded+'/'+d.max).join(' '))"

# 2) 每一题都有逐条判分证据
node -e "const j=require('./report.json');for(const it of j.items)console.log(it.id,it.awarded+'/'+it.maxPoints,it.gradingStatus)"

# 3) HTML 报告是自包含的（无任何外链）
node -e "const h=require('fs').readFileSync('./report.html','utf8');console.log('external:',/https?:\/\//.test(h))"

# 4) 答案文件里没有 oracle 痕迹（是我们自己写的 JSON）
cat answers-batch3.json
```

## 4. 诚实边界（务必连同数字一起引用）

- 这是**本地公开题库自测**：题目、评分条件、判分器全部开源可读。
- **不是认证、不是全球排名、不能防作弊**。
- 只能与 **同 `examVersion` + 同 `graderVersion` + 同 `catalogFingerprint`** 的成绩比较；三者缺一不可。
- 指纹通过 **2 个探针 seed** 采样题面 —— 「同指纹」只保证**探针 seed 下的题面 + 全部评分条件**相同，**不等于所有 seed 的题面都相同**（概率性覆盖）。
- 跨指纹算法版本，指纹数值本身不可直接比较。
- 单次分数有随机性，**不代表模型能力上限**。
