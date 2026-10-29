# 交付前最终校验记录

> 时间：2026-10-30T01:12Z（Asia/Shanghai 09:12）— 已更新为 **exam v1.1.0 最终轮**
> 用途：证明交付时的安装副本与仓库源**逐文件一致**，且 Skill 结构合规。

## 1. Skill 结构 + 可执行性验证

命令：

```bash
node evidence/host/verify-skill.mjs
```

结果：`总体：全部通过`（exit 0），两个安装点各 20 项全 ✔：

```
=== <repo>\.agents\skills\lezi-bench ===
  ✔ frontmatter 可解析
  ✔ name 存在：name=lezi-bench
  ✔ name 长度 ≤64：10 字符
  ✔ name 字符集合规：仅小写字母/数字/单连字符
  ✔ name == 父目录名：都是 lezi-bench
  ✔ description 存在：189 字符
  ✔ description ≤1024：189 字符
  ✔ description 含触发词：命中 4/4：跑分 / 评测 / LeziBench / 能力体检
  ✔ license 存在：MIT
  ✔ compatibility ≤500：112 字符
  ✔ allowed-tools 写法：未声明（合法，本 Skill 不限制工具）
  ✔ 模型侧可见：未禁用模型调用
  ✔ 用户可 /lezi-bench 调用：默认允许
  ✔ 正文非空：156 行 / 4212 字符
  ✔ 正文覆盖全部子命令与异常态：全部命中
  ✔ scripts/ 与 SKILL.md 同层：存在
  ✔ src/ 与 SKILL.md 同层：存在
  ✔ scripts/cli.mjs 存在
  ✔ 与仓库根 SKILL.md 逐字节一致
  ✔ node scripts/cli.mjs doctor 退出码 0
  → 通过

=== <home>\.agents\skills\lezi-bench ===
  （同样 20 项全 ✔）
  → 通过
```

## 2. 安装副本 ↔ 仓库源 逐文件哈希比对

命令（在 `lezibench/` 下）：

```bash
node scripts/sync-skill.mjs --check --target "<repo>\.agents\skills\lezi-bench"
node scripts/sync-skill.mjs --check --target "<home>\.agents\skills\lezi-bench"
```

结果：两条都 **exit 0**（`✔ Skill 包校验通过 … 文件逐一致，frontmatter 合规`）。

> 这一步很重要：本轮开发中 Lead 先后改过 `src/grading/grade.mjs`、`src/exam/items/reasoning.mjs`、`src/exam/manifest.mjs`、`scripts/cli.mjs`、`src/runner.mjs`。
> 每次改完都用 `sync-skill.mjs` 全量重同步（它会逐文件比 SHA-256，不一致直接报错），**不是只拷 SKILL.md**。

## 3. 端到端测试（Lead 的测试，我只跑不改）

```bash
cd lezibench
node tests/e2e-run.mjs
```

结果：

```
[7] 路径与参数安全
  ✔ 非法 runId 一律被拒绝
  ✔ 不在本批的题目 ID 被拒绝
  ✔ 非法批次被拒绝

✅ 全部端到端断言通过
```

## 4. 安装后可用性

```bash
cd .agents/skills/lezi-bench
node scripts/cli.mjs doctor     # → 全部通过，可以开考。
node scripts/cli.mjs version    # → exam 1.1.0 / grader 1.1.0 / node v24.20.0
```

## 5. 报告可复现性

round 5（exam v1.0.0）时曾用最新同步版本重新生成报告，与旧版**逐字节一致**，说明当时 `cli.mjs` / `runner.mjs` 的改动不影响那一局的判分结果。

**但当前交付已换到 exam v1.2.0（修复 R02 答案恒定、照抄示例得分），该结论不再适用**。当前 `evidence/host/report.*` 全部由 `run-20261029-185817-d153d2` 生成：

```bash
node scripts/cli.mjs report --run run-20261029-185817-d153d2 --format html    --out evidence/host/report.html
node scripts/cli.mjs report --run run-20261029-185817-d153d2 --format json    --out evidence/host/report.json
node scripts/cli.mjs report --run run-20261029-185817-d153d2 --format summary --out evidence/host/report-summary.txt
```

校验结果（逐项核对 `report.json`）：

| 字段 | 值 |
|---|---|
| `summary.total` | 100 |
| `summary.level` | 卓越 |
| `summary.status` | COMPLETED |
| 四维 | 指令理解 25/25 · 逻辑推理 25/25 · 信息整理 25/25 · 状态追踪与纠错 25/25 |
| `durationMs` | 96531（= 96.5 秒） |
| `meta.examVersion` | 1.1.0 |
| `meta.graderVersion` | 1.1.0 |
| `meta.contractVersion` | 1.0.0 |
| `meta.catalogFingerprint` | `a72cf9c4e4abcd1f7474e4fc83f30e7f0b9c69b4a7ff3bfe26015a370b7a5026` |
| HTML 外链检测 | `https?://` 无命中（自包含） |
| HTML / JSON 大小 | 31,605 B / 19,658 B |

反背题抽样（`parsedAnswer` 原文，可直接核对）：

| 题 | 解析后的答案 | 得分 |
|---|---|---|
| I01 | `{"deadline":"周三下午4点","budgetAttached":true}` | 4/4 |
| C01 | `{"isCorrect":false,"correctTotal":52}` | 4/4 |
| D03 | `{"lossMaking":["C-315"],"onlyInStore":[],"commonCount":5}`（**这题我漏了 A-101，扣 2 分**） | 6/6 |

## 6. 结论

| 检查项 | 结果 |
|---|---|
| SKILL.md frontmatter 合规（name/description/license/compatibility/allowed-tools/无 disable-model-invocation） | ✅ |
| 目录名 == name（`lezi-bench`） | ✅ |
| 两个安装点与仓库源逐文件一致 | ✅ |
| doctor 退出码 0 | ✅ |
| e2e 测试全绿 | ✅ |
| DSH 实际发现 skill（会话语义目录出现 `lezi-bench`） | ✅ 见 HOST_TRIAL.md §3 |
| 报告 HTML 零外链、可离线打开 | ✅ |

---

## 7. 最终轮（exam v1.1.0）复核

题库升到 **v1.2.0**，累计改动：① 题面随机化（I01 附件要求会反转、C01 等式可能本来就成立、R03/D03/C03/D04 参数全变、R02 依赖图随 seed 变）；② I03 出题分布改等概率；③ R02 步骤代号随机化（不再恒为 A,B,C,D,E）；④ D02 判分收紧；⑤ R04 列名顺序随机化。因此基于 v1.2.0 重跑了一整局真实考试：

| 项 | 值 |
|---|---|
| runId | `run-20261029-185817-d153d2` |
| seed | `host-trial-v13` |
| 总分 | **98 / 100，卓越** |
| 四维 | 指令理解 25/25 · 逻辑推理 25/25 · **信息整理 23/25** · 状态追踪与纠错 25/25 |
| 耗时 | 96.5 秒（`durationMs` 96531） |
| exam / grader / contract | v1.2.0 / v1.2.0 / v1.0.0 |
| 指纹 | `a72cf9c4e4abcd1f7474e4fc83f30e7f0b9c69b4a7ff3bfe26015a370b7a5026` |
| 报告 | `report.html` 31,614 B（零外链）· `report.json` 19,652 B · `report-summary.txt` 626 B |

**最终全量校验（2026-10-30T02:56Z）**：

| 检查 | 结果 |
|---|---|
| `node --test "tests/*.test.mjs"` | **115/115 通过** |
| `node --test "evidence/*.test.mjs"` | **84/84 通过** |
| `node tests/e2e-run.mjs` | ✅ 全绿 |
| `node evidence/host/verify-skill.mjs` | 40 项 ✔（两个安装点各 20 项），总体通过 |
| `sync-skill.mjs --check` × 2 个安装点 | 均 exit 0（逐文件一致） |
| HTML 报告零外链 | ✅ 正则 `https?://` 无命中 |

**结论**：Skill 封装、双安装点、真实 Agent 考试、报告交付全部完成，且基于当前最新题库快照（exam v1.2.0，指纹 `a72cf9c4e4abcd1f…`）。

**反背题证据（round 8 vs round 7）**：R02 `order` 从 `[A,B,C,D,E]` 变成 **`[C,D,A,E,B]`**（步骤代号整体重新映射）；I01 `budgetAttached` false→true；D03 `onlyInStore` `[C-315,G-721]`→`[]`。**背答案不可能答对 round 8 的 R02。**

**本轮失分说明**：D03 我漏判 A-101（进价 56 > 售价 53 也亏本），扣 2 分，最终 98/100。判分器理由准确指出了这一点。
