> ⚠️ **阅读须知**：这份报告是审计员在 **2026-10-30 01:0x** 得出的「**不可发布**」原始结论，
> **此处一字未改**，包括当时的 FAIL 判定与批评意见。
>
> 审计发现的问题已在后续修复，并**逐条转成回归测试**：
> - 「翻转标准答案不被检出」→ 新增 [`tests/golden-fixtures.test.mjs`](../../tests/golden-fixtures.test.mjs)（16 题独立手算，不 import oracle）
> - 版本脱节 → 升到 v1.2.0，`evidence/lead/RELEASE-v1.2.0.*` 与 `package.json` 版本一致
> - `docs/SCORING.md` 过期 → 已重新生成，`--check` 退出码 0
> - 公开 URL 404 → 仓库与 Pages 已发布（见仓库首页）
>
> **保留原始批评意见是刻意的**：一个被质疑过、并公开了质疑与修复记录的项目，
> 比一个从没被质疑过的项目更可信。当前状态请以 `tests/` 实际输出为准。
>
# ACCEPTANCE — 乐子跑分 LeziBench 独立验收审计

> 角色：独立验收审计员（唱反调）。**只写 `qa/audit/`，不改任何被测代码。**
> 基准：执行包 `07_红队验收与基准校准.md` §D 五道门槛。
> 审计对象：`lezibench/`（工作区根 `<workspace>`）
> 环境：Windows 11 · Node **v24.20.0** · `win32/x64`
> 审计时间：2026-10-30 00:33 ~ 01:20（Asia/Shanghai）

---

## 1. 结论

# ❌ 不可发布（NOT RELEASABLE）

理由（任何一条单独成立即足以阻断）：

1. **门槛 5 直接 FAIL**：对外声称的公开仓库与网站在审计时点**均返回 HTTP 404**，且本地仓库 `git remote` 为空。README / 网站 / sitemap / package.json 中出现的 `https://github.com/tbj0623/lezibench` 与 `https://tbj0623.github.io/lezibench/` 全部不可访问。
2. **门槛 2 部分 FAIL**：真实源码变异注入 8 个变异，**2 个漏检**。
   - **M1 翻转标准答案漏检**：把 I01 oracle 的 `budgetAttached` 取反后，**题面要求「附」时诚实作答只得 1/4**，而 `node --test` 仍 **95/95 全绿**。根因是测试的「正确答案」全部由被测的 `oracle()` 生成，检查的是自洽性而非**题面语义**——这正是「翻转标准答案必须被检出」要防的事。
   - **M8 原子写退化漏检**：把 `atomicWrite` 换成裸 `writeFile`（失去原子性），**95/95 仍全绿**。现有测试只验「内容对 + 无 .tmp 残留」，不验「写入过程中旧文件不被截断」。
3. **门槛 3 证据与当前版本脱节**：README 引用的「真实 Agent 100/100」来自 **exam v1.0.0**（runId `run-20261029-162223-19285b`，指纹 `5079d6dd…`），当前是 **v1.1.0**（指纹 `013cc5d8…`）。`qa/host/report.json` 虽已更新到 v1.1.0，但 `qa/lead/` 下的 100pt / 88pt 两份仍是 v1.0.0。
4. **可复现性缺口**：`node docs/build/build-scoring.mjs --check` **退出码 1**（`docs/SCORING.md` 与源码不一致）。

**可以确认做对的部分**（不因结论严厉而抹掉）：A 组 4 条命令全部 exit 0；10 类共 34 条攻击断言 34/34 PASS；阈值/条件/缺答/状态机等 6 个源码变异全部被检出；报告 HTML 真正自包含、DEMO 标注正确、免责声明到位；文档对「防不住篡改 / 无并发保护 / 不防作弊」的承认是诚实且准确的。

---

## 2. 五道门槛逐条判定

| # | 门槛 | 判定 | 证据路径 | 备注 |
|---|---|---|---|---|
| 1 | 可复现的 `node --test` 全绿；关键函数有独立测试；**测试真的会失败** | **PARTIAL** | `qa/audit/test-run.log`、`qa/audit/mutation-run.log`、`qa/audit/mutation-inject.json` | 全绿成立（**95 pass / 0 fail**，22.0s），自带变异测试 22/22 检出。但**我做的真实源码变异有 2 个漏检（M1、M8）**，见 §3.2。 |
| 2 | 版本化总分合同校验通过；**强制错误注入（翻转标准答案/删条件/破阈值）必须检出** | **FAIL** | `qa/audit/mutation-inject.json`、`/tmp/m1probe` 复现 | 合同校验本身通过（16 题/100 分/4 维各 25/44 条件）。**「翻转标准答案」未被检出**——这是本门槛点名的必测项，故判 FAIL。（删条件 M2、破阈值 M3 均检出。） |
| 3 | 至少一台真 Agent 宿主完成标准局，得到**不依赖网站**的本地 HTML | **PARTIAL** | `qa/host/report.html`、`qa/host/report.json`、`qa/host/HOST_TRIAL.md` | DSH 真机链路成立：`report.html` 零外链、零 http(s)、`file://` 可看，runId/分数与 JSON 一致（`run-…170001-9300ba`，100/100）。**但**：①该局 16 题中 **15 题与 `perfectAnswers(seed)` 逐字段相同**，仅 D02 自由文本不同，**无法排除「照抄 oracle」**；②`qa/lead/` 两份「两轮真实考试」是旧版 v1.0.0，与当前 v1.1.0 不可比。 |
| 4 | 报告含证据与状态；模拟报告明确 DEMO；**NEEDS_REVIEW 不得发布完整认证成绩** | **PASS** | `src/grading/grade.mjs:189-191`、`qa/host/report.html`、`website/assets/demo-report.html` | `complete = 题数齐全 && pending==0`，否则 `PARTIAL` 且 `level=null`；实测「只 1 批 → PARTIAL、无段位」通过（攻击 A7/A7b）。DEMO 报告含 `DEMO · 演示数据` 且 `demo.html` 有 `robots noindex`。真实报告印有「非认证成绩（LOCAL_SELF_TEST）」及「不能防止改题/改判分器」声明。 |
| 5 | GitHub 仓库与网站如声称公开，必须真实 URL 与访问检查 | **FAIL** | `curl` 实测、`git remote -v` | `https://github.com/tbj0623/lezibench` → **HTTP 404**；`https://tbj0623.github.io/lezibench/` → **HTTP 404**；`git remote` 数量 **0**。而 `package.json`、README、`website/sitemap.xml`、各页页脚均把这两个地址当作**已存在**的公开地址引用。 |

> 判定口径：一条门槛内只要存在未满足的必测项即 FAIL；有实质证据但有明确缺口判 PARTIAL。

---

## 3. 攻击测试结果（10 类 / 34 条断言）

复现命令：

```bash
cd "<workspace>"
node qa/audit/attack.mjs          # 10 类攻击，34 条断言
```

**汇总：34 条断言，PASS 34，FAIL 0（exit 0）** · 完整日志 `qa/audit/attack-out.log`

| # | 攻击 | 期望 | 结果 | 实际现象（证据片段） |
|---|---|---|---|---|
| **A1** | 边界分数：全对但改成 99.9 | 不得 100 | **PASS** | 三种写法：①第 1 批数值全转 99.9 → 本批非满分；②R01 写 99.9 → `awarded=0`（不四舍五入）；③整卷 4 批全 99.9 → 总分 < 100。 |
| **A2** | 越权 runId：`../../etc/passwd`、`..\..\windows`、`/etc/passwd`、`C:\Windows\…`、5000 字符、`.../.../...`、URL 编码 | 必须拒绝 | **PASS** | 7 个变体 `status`/`report` 双入口 **exit 1**，统一报 `runId 含非法字符`；数据根外未产生任何文件。 |
| **A3** | 注入：`__proto__` / 10MB 字符串 / `"1); process.exit(1);//"` | 不得污染/不得退出 | **PASS** | `__proto__` 被当作未知题号拒绝，`Object.prototype.polluted=undefined`；10MB 答案（40MB 文件）被 **256KB 上限**拦住；S 表达式字符串 → `UNPARSEABLE`、0 分，**进程未退出（code=0）**。 |
| **A4** | 覆盖：同批第二次提交不同答案 | 必须拒绝 | **PASS** | 第 2 次 **exit 1**：`拒绝用不同答案覆盖（payload 哈希不一致）`；原分仍 16/16。相同 payload 重提 → `idempotent=true`、不重复计分。 |
| **A5** | 篡改：手改 `state.json` 分数后出报告 | 能看出不一致，**或文档明确承认防不住** | **PASS（文档承认）** | 直接把 4 题 `awarded` 改成满分，`report` **完全采信**（总分随之为假分）；`docs/LIMITATIONS.md §7` 明示「`state.json`、答案文件、判分器都在本地，**没有签名校验**」「题库指纹不防篡改」。→ 符合门槛「或文档明确承认」。**额外发现**：`regrade` 能还原真分（`beforeTotal=16 → afterTotal=0`），说明原始答案指纹链是有效的。 |
| **A6** | 缺答：只答 3/4 题 | 必须阻断 | **PASS** | 默认 **exit 1**，明确列出缺失题号，且 `batches[1]` 未写入；加 `--allow-missing` 才放行，缺失题 `MISSING_ANSWER` + 0 分。 |
| **A7** | 未答完出报告（仅 1/4 批） | `PARTIAL` 且**无段位** | **PASS** | `status=PARTIAL`、`level=null`、`completed=false`；HTML 中不含「段位：」「标准局成绩」，含「部分完成/待复核」。 |
| **A8** | 答案文件攻击：非 JSON / 数组 / 空 / `null` / 字符串 / 数字 / 超大 | 必须明确报错 | **PASS** | 7 类全部 `exit 1` 且文案可读（如 `答案文件不是合法 JSON`、`必须是一个对象`）；1MB 文件报 `过大（上限 256KB）`。**例外符合预期**：直接 `{...}` 对象形态是官方支持格式，正确放行。 |
| **A9** | 并发：两个 `submit` 同时打同一批 | state 不得写坏/不得重复计分 | **PASS（但有保留）** | `state.json` 可解析、`gradedItems=4`、**无重复题号**。**但两次都 exit 0**，最终只保留其中一份（`12/16`，丢失另一方结果）——静默丢更新，属「行为未定义」，与 `LIMITATIONS §7`「无并发保护」一致。不阻断，但见 §6 建议。 |
| **A10** | 中文 + 空格路径全流程 | 必须能跑 | **PASS** | `LEZIBENCH_HOME=…\乐子 跑分 数据 目录\with space`，doctor → start → submit×4 → report(html/json) **全部 exit 0**，满分卷得 **100**。 |

### 3.1 攻击脚本本身的两次修正（透明记录）

初次运行有 3 条「FAIL」经排查**是我脚本的 bug**，已修正后重跑：

- `report --format json` 是把报告**写文件**、stdout 只打摘要——我误从 stdout 解析（已改用 `--out` 读文件）。
- A1 用正则替换数字时**误改 JSON 键**（`I01`→`I99.9`），导致「本批不包含该题目」（已改为只替换**值**）。
- A3 的 `__proto__` 断言把「按未知题号拒绝」误判为失败（实际是**正确的防御**，已修正期望）。

→ 修正后 34/34 PASS。此处保留说明，避免读者误以为攻击一次就全绿。

### 3.2 真实源码变异注入（我额外加的，比项目自带 mutation 更硬）

自带 `tests/mutation.mjs` 是**在内存里构造错误答案看是否扣分**（行为测试）；我做的是**改源码 → 跑 `node --test` → 必须变红**。

```bash
node qa/audit/mutation-inject.mjs      # 复制到临时目录改源码，绝不碰工作区
```

基线：未变异副本 **95 pass / 0 fail**（先证明基线绿，否则「变红」无意义）。

| 变异 | 内容 | 结果 |
|---|---|---|
| M1 | **翻转标准答案**：I01 `oracle` 的 `budgetAttached` 取反 | ❌ **漏检**（exit 0，95 全绿） |
| M2 | 删掉评分条件 I02.C2 | ✅ 检出（19 fail） |
| M3 | 破坏阈值：卓越 90→95 | ✅ 检出（5 fail） |
| M4 | 改题分 I01 4→5（破坏 100 分合同） | ✅ 检出（17 fail） |
| M5 | 判分器放水：`awarded` 恒等于满分 | ✅ 检出（2 fail） |
| M6 | 缺答闸门失效 | ✅ 检出（1 fail） |
| M7 | 未答完也报 COMPLETED | ✅ 检出（2 fail） |
| M8 | **原子写退化**：`atomicWrite` → 裸 `writeFile` | ❌ **漏检**（95 全绿） |

**M1 最小复现（最严重）**：

```bash
cp -r lezibench /tmp/m1probe
sed -i 's/budgetAttached: facts.attachRequired,/budgetAttached: !facts.attachRequired,/' \
  /tmp/m1probe/src/exam/items/instruction.mjs
cd /tmp/m1probe && node --test "tests/*.test.mjs"   # → 95 pass / 0 fail
```

在被变异的副本里按**题面**诚实作答（通知3 要求「附」，就答 `true`）：

```
prompt 通知3 says attachRequired = true
HONEST answer {"deadline":"周四上午9点30分","budgetAttached":true} → 1/4 GRADED
C2 reason: 附件要求判断错误：应为 不附，实际为 需要附
Mutated oracle now says: {"deadline":"周四上午9点30分","budgetAttached":false}
```

即：**标准答案被翻转后，判分口径随之反转，而 95 个测试没有一个发现**。
根因：`tests/` 中 `perfectAnswers` / `.oracle(` 共出现 **90 次**，正确答案全部由被测的 `oracle()` 生成，
`grade()` 又内部调用同一个 `I01.oracle(facts)`（`instruction.mjs` 中 `grade` 首行 `const o = I01.oracle(facts)`）。
→ 「标准答案」与「判分依据」是**同一份代码**，任何只改 oracle 的变异都自洽，测试天然测不出。

**M8 说明**：`tests/cli.test.mjs:80` 只断言「内容正确 + 目录里无 `.tmp` 残留」，
裸 `writeFile` 两条都满足。故判为**真实覆盖缺口**（非等价变异）。

---

## 4. 声称 vs 事实

| # | 声称（出处） | 事实 | 判定 |
|---|---|---|---|
| 1 | README：「**两轮真实 Agent 完整考试（100/100、88/100）**」 | 审计中该表已被改写为 DSH/Node/Windows 分列，**不再出现「两轮 100/88」字样**（README 现仅有「实测样例（单次）」100/100）。但 `qa/lead/` 仍以 `REAL-agent-100pt.*` / `lead-exam-run1-88pt.*` 命名，二者均为 **exam v1.0.0**（指纹 `5079d6dd…` / `255c5caa…`），与当前 **v1.1.0**（`013cc5d8…`）**不可比**。且 88 分那局的失分是 **C02、C03 两题 `MISSING_ANSWER`**——是「没答」，不是「答错」。 | ⚠️ **表述已收敛，但证据未更新** |
| 2 | README 支持矩阵：DSH `VERIFIED` / OpenClaw `NOT_TESTED` | 与 `docs/COMPATIBILITY.md` **完全一致**：DSH=VERIFIED（有命令+输出）、通用 Agent Skills=PARTIAL、OpenClaw/Codex=NOT_TESTED（明确写「出口被封/零一手证据」，且**未给**安装命令与路径）。这是**罕见的高质量自我克制**，无夸大。 | ✅ **相符** |
| 3 | 网站/README 是否出现「认证 / 全球排名 / 防作弊 / 全平台兼容」等违规词 | 命中处**全部是否定式**：`不搞排行榜`、`不宣称防作弊`、`不宣称全平台兼容`、`不是认证`、`非认证成绩（LOCAL_SELF_TEST）`。未发现任何肯定式违规宣称。 | ✅ **无违规** |
| 4 | `website/` 所有页面零外链 | **资源层面零外链**：无 CDN、无远程字体、无统计脚本、无 `@import`；唯一 `<script src>` 是本地 `assets/site.js`。**但**存在**出站 `<a>` 链接**指向 `https://github.com/tbj0623/lezibench…`（页脚/证据引用），这些地址当前 **404**。 | ⚠️ **资源零外链成立；出站链接指向 404** |
| 5 | 报告 HTML 真正自包含 | `qa/host/report.html`：`http(s)` 计数 **0**、`src=` **0**、`@import` **0**；`website/assets/demo-report.html` 同为 0/0/0。样式全内联，字体用系统字体栈。 | ✅ **成立** |
| 6 | 模拟报告明确 DEMO | `website/assets/demo-report.html` 含 1 处 `DEMO · 演示数据` 徽章 + 页脚免责；`website/demo.html` 有 `<meta name="robots" content="noindex">`。 | ✅ **成立** |
| 7 | 版本化总分合同 | 当前 `exam 1.1.0 / grader 1.1.0 / contract 1.0.0`，指纹 `013cc5d8…`；`docs/SCORING.md` **与源码不一致（`--check` exit 1）**——报头指纹仍写 `bb5fbe03…`，且 `I01.C2`、`I04.C1`、`C03.C3` 三条条件文本是旧版。 | ❌ **文档已过期** |
| 8 | `package.json` 仓库地址 | `https://github.com/tbj0623/lezibench.git` → **404**；`git remote` 为空，`git log` 仅 1 个 commit。 | ❌ **未发布却已写死** |

---

## 5. 阻断问题清单（必须修，按严重度）

| 严重度 | 问题 | 证据 | 修法 |
|---|---|---|---|
| **P0** | **公开地址全 404**：GitHub 仓库与 Pages 均不可访问，但 `package.json` / README / sitemap / 各页页脚均按「已公开」引用 | `curl` → 404 / 404；`git remote` 空 | 要么真正创建并推送仓库、开启 Pages 并**实测 200**；要么把全部公开表述改为「未发布/本地预览」，删除 `sitemap.xml` 中的 Pages 域名与 `repository.url` |
| **P0** | **翻转标准答案不被检出**（门槛 2 点名的必测项） | `/tmp/m1probe`：翻 oracle 后诚实作答 1/4，测试仍 95/95 绿 | 为每题补**至少 1 条独立硬编码期望值**（例如 I01：给定「通知3=附」的固定 facts，断言 `budgetAttached` 必须为 `true`），不允许全部期望值由 `oracle()` 派生；或把 `grade()` 与 `oracle()` 拆成两套独立实现并交叉验证 |
| **P1** | `docs/SCORING.md` 与源码不一致（`build-scoring --check` exit 1） | 报头指纹 `bb5fbe03…` ≠ 当前 `013cc5d8…`；3 条条件文本为旧版 | 运行 `node docs/build/build-scoring.mjs` 重新生成并提交；CI 增加该 `--check` 步骤 |
| **P1** | 真实考试证据与当前版本脱节，且**无法排除抄 oracle** | `qa/lead/*` = v1.0.0；`qa/host` v1.1.0 那局 16 题中 **15 题与 oracle 逐字段相同** | 用**当前 v1.1.0** 重跑一局；作答时不读取 `scripts/oracle-answers.mjs`，并在 `HOST_TRIAL` 记录「未调用 oracle」的可验证方式（如先改 seed 再人工推导） |
| **P2** | 原子写失去原子性不被检出 | 裸 `writeFile` 变异 → 95/95 绿 | 加测试：写入过程中断言目标路径内容**始终**为旧值/新值之一（可用 mock `rename` 前注入读取），或至少断言存在 `.tmp` 中间文件阶段 |
| **P2** | 并发提交静默丢更新（两次都 exit 0，只保留一份） | 攻击 A9：`退出码=[0,0]`，最终 `12/16` | 已有 `LIMITATIONS §7` 披露，可接受；若要修，用 `state.json` 独占锁（`open(..., 'wx')`）让第二次明确失败 |

---

## 6. 非阻断但建议修

1. **`qa/lead/` 目录命名误导**：`REAL-agent-100pt` 暗示「真实 Agent 能力证据」，但 15/16 题与 oracle 相同。建议改名为 `reference-oracle-run-*`，或补一局可证明独立作答的记录。
2. **88 分那份的失分归因**：C02/C03 是 `MISSING_ANSWER`（漏答），对外引用时应写明「因漏答扣 12 分」，而非笼统「88/100」，否则容易被读成「能力短板」。
3. **并发建议显式失败**：与其静默丢弃，不如第二次返回明确错误，与「不同 payload 拒绝覆盖」的既有严格风格一致。
4. **`A9` 的 `state.json` 原子性**：虽然当前未写坏，但两进程同时 `rename` 在 Windows 上有 `EPERM` 退化路径（`unlink+rename`），极端时序下仍有丢失窗口。
5. **CI 未跑 `build-scoring --check`**：`.github/workflows/ci.yml` 有 test/e2e/mutation/doctor + 跨平台单测 + 密钥扫描，但**没有**文档一致性检查，这正是 §4-7 问题能溜过去的原因。
6. **`docs/SCORING.md` 的「脚本生成」声明**：文件自称「与源码逐字一致」，实测已不一致——这类自指声明应改由 CI 强制，而不是靠人记得跑。

---

## 7. 若将来判定「可发布」，必须同时声明的限制

> 本审计结论为**不可发布**；若后续修复 P0/P1 后重新验收并转为可发布，发布时必须**同时**声明：

1. **非认证**：本地公开题库自测，无第三方见证、无身份核验、无签名，报告自带 `LOCAL_SELF_TEST`。
2. **不防作弊**：题库、评分条件、判分器全为公开源码；改题/改分/改 `state.json` 都能拿高分，且 `report` 会直接采信被篡改的 `state.json`（`regrade` 可还原真分）。
3. **跨版本不可比**：仅当 `examVersion` + `graderVersion` + `catalogFingerprint` **三者全同**才可比较；且指纹只采样 2 个固定探针 seed，**不能**保证所有 seed 题面逐字一致（README 已如实说明）。
4. **覆盖率有限**：16 题 / 4 维，不覆盖长上下文、多轮工具调用、代码工程、开放写作、事实准确性、安全性、多语言。
5. **平台边界**：仅 DSH + Windows + Node 24 有完整真机考试；macOS/Linux 仅单测；OpenClaw / Codex **零一手证据**，不得写安装命令或路径。
6. **无并发保护**：同 `runId` 并发提交行为未定义，可能静默丢更新。
7. **分数不构成模型能力评价**：单次运行方差不可忽略；耗时不是能力指标。
8. **当前证据版本**：对外引用任何分数时，必须同时给出 `examVersion` / `graderVersion` / `catalogFingerprint` 与 runId。

---

## 8. 复现清单（全部命令）

```bash
cd "<workspace>"

# ---- A 组：项目自带测试（我亲自复跑）----
cd lezibench
node --test "tests/*.test.mjs"        # exit 0；95 pass / 0 fail / 22.0s
node tests/e2e-run.mjs                # exit 0；7 组断言全过
node tests/mutation.mjs               # exit 0；22 变异 / 22 检出
node scripts/sync-skill.mjs --check   # exit 0；逐文件一致 + 装后 doctor 通过
node docs/build/build-scoring.mjs --check   # ❌ exit 1（文档过期）

# ---- B 组：攻击 ----
cd ..
node qa/audit/attack.mjs              # exit 0；34 断言 / 34 PASS
node qa/audit/mutation-inject.mjs     # exit 1；8 变异 / 6 检出 / M1、M8 漏检

# ---- C 组：公开地址 ----
curl -sS -o /dev/null -w "%{http_code}\n" -L https://github.com/tbj0623/lezibench        # 404
curl -sS -o /dev/null -w "%{http_code}\n" -L https://tbj0623.github.io/lezibench/        # 404
cd lezibench && git remote -v                                                            # 空
```

原始输出留档：`qa/audit/test-run.log`、`e2e-run.log`、`mutation-run.log`、`sync-check.log`、`attack-out.log`、`mutation-inject.json`。

---

## 9. 审计过程声明

- 本审计**未修改任何被测代码**。
- 唯一一次越界：排查 `build-scoring --check` 时误执行了生成命令，改写了 `lezibench/docs/SCORING.md`；**已立即按原文恢复**（内容与修改前逐字一致：v1.1.0 报头 + 旧指纹 `bb5fbe03…`），恢复后 `--check` 仍为 exit 1，与发现该问题时一致。
- 审计期间工作区被其他成员持续修改（`git status` 多次变化）。本报告的数字以**最后一次全量复跑**（Node v24.20.0，2026-10-30 01:15 前后，tree 在 20s 内哈希稳定）为准。
- 攻击脚本自身的 3 处误判已修正并如实记录于 §3.1，未用「改脚本迁就结论」的方式制造全绿。
