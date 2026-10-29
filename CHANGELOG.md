# Changelog

本文件记录 LeziBench 的重要变更。

格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

> **关于分数可比性：**
> 版本号是手动升的，可能漏升。判断两份成绩能不能比，请以报告里的 **`catalogFingerprint`（题库指纹）** 为准，
> 而不是看 `examVersion` / `graderVersion`。
>
> **但要注意指纹的边界：** 指纹只采样 **2 个探针 seed**（`fp-probe-1` / `fp-probe-2`）。
> 所以「指纹相同」只说明这 2 个 seed 下的题面与全部评分条件一致，
> **不等于所有 seed 的题面逐字相同**。详见 [docs/LIMITATIONS.md §4.1](docs/LIMITATIONS.md)。

---

## [Unreleased]

（暂无）

---

## [0.2.0] - 2026-10-30

**发布版本。** `examVersion 1.2.0` · `graderVersion 1.2.0` · `scoringContractVersion 1.0.0`。

相对上一个未发布的开发快照，本版的核心是**把「测试自证」这个致命缺陷补掉**（见下方「测试」一节的 `tests/golden-fixtures.test.mjs`）。

### 新增

**题库与评分**

- **16 道题、100 分、4 个维度**（指令理解 / 逻辑推理 / 信息整理 / 状态追踪与纠错），每维 25 分。
- **44 条评分条件**（每题 2–3 条原子检查项），逐条给出 `PASS/FAIL` 与**人能读懂的中文失败理由**（例如「份数 3（需 ≥4）」）。
- 分值结构：4 道基础（4 分）+ 8 道标准（6 分）+ 4 道挑战（9 分）；每个维度恰好 `[4, 6, 6, 9]`。
- 分 4 批作答，每批 4 题。
- 题目由 seed 驱动生成（`generate(seed)`），同 seed 逐字节一致、不同 seed 题面不同。
- 段位阈值写死在代码里并被测试锁定：**卓越 90–100 · 优秀 80–89 · 良好 65–79 · 基础 50–64 · 需要提升 0–49**。
- 题库契约自检（`assertCatalogIntegrity()`）：题数、维度分值、难度分布、子条件合计、以及 **0–100 每个整数都必须可达**，任一不成立直接拒绝开考。

**运行器与 CLI**

- 状态机 `created → in_progress → completed`，支持断点续跑（`resume`）。
- CLI 命令：`doctor` / `start` / `submit` / `status` / `resume` / `report` / `regrade` / `list` / `version`。
- 退出码约定：成功 `0`，运行/环境错误 `1`，参数或用法错误 `2`。
- **提交幂等**：相同 payload 重复提交返回同一结果、不重复计分；不同 payload 拒绝覆盖。
- **缺答默认阻断**提交，并点名缺哪几题；确实要按缺答 0 分提交需显式 `--allow-missing`。
- **重判（`regrade`）只改判分器版本、不改原始答案**：从 `answers/` 里的 `rawAnswer` 重新计算 SHA-256 再比对，不信任文件内自带的哈希字段。
- 数据目录跨平台（Windows / macOS / Linux），可用 `LEZIBENCH_HOME` 覆盖；写入走原子写（临时文件 → fsync → rename）。
- `runId` 做字符与路径穿越校验；答案文件大小上限 256 KB。

**报告**

- 三种格式：`html`（自包含、零外部资源、断网可看）/ `json` / `summary`（纯文本）。
- 报告包含：总分、四维得分、逐题逐条件的通过情况与失败理由、段位、`examVersion` / `graderVersion` / `catalogFingerprint`、实测耗时。
- 报告自印「本地规则核验 · 非认证成绩（LOCAL_SELF_TEST）」。
- 未答满时状态降级为 `PARTIAL`，不给段位——不把「没跑完」伪装成「考完了但分低」。
- 答案有内容但无法解析时进入 `UNPARSEABLE` 待复核，不静默当 0 分知识错误。

**测试**

- **`tests/*.test.mjs` 共 95+ 条测试**（数量随迭代变化，以 CI 输出为准）。
- **`tests/golden-fixtures.test.mjs`：14 条独立手算夹具。** 这是本版最重要的改动 ——
  每条夹具用固定 seed 抄下题面关键事实、**手工推导**正确答案、再断言 `grade()` 给满分。
  **不调用任何 `oracle()`**。原因见下方「修复」一节的测试自证缺陷。
- `tests/contract.test.mjs`：题库契约（16 题 / 100 分 / 4 维各 25 / 0–100 每整数可达）、fixture 满分/零分、非法输入、报告状态区分。
- `tests/solvability.test.mjs`：在题面允许的完整空间上穷举，证明解唯一且等于 oracle。
- `tests/regression.test.mjs`：把已发现的真实缺陷按 `BUG-1`、`BUG-2`… 顺序编号钉成回归测试，每条注明**发现来源**与**现象**。含「正确答案被判错」与「错误答案该扣分」成对用例（如 `BUG-6`/`BUG-6b`），防止修过头。
- `tests/e2e-run.mjs`：端到端跑完 `start → submit ×4 → report`，断言满分卷 = 100、全错卷 = 0、部分卷 = 原子分、幂等、冲突拒绝、路径安全。
- `tests/mutation.mjs`：22 个变异，全部必须被现有断言检出（证明测试真的会失败，不是摆设）。
- `tests/cli.test.mjs`：CLI 与存储层（含路径穿越、大文件、坏 JSON、原子写）。

**Skill 与安装**

- 符合 Agent Skills 规范的 Skill 包（`skills/lezi-bench/`，`name: lezi-bench`）。
- `node scripts/sync-skill.mjs` 构建可安装的 Skill 包并做结构与 frontmatter 校验。
- 安装器：`install/install.ps1`（Windows）、`install/install.sh`（macOS / Linux）。
- `node scripts/demo.mjs` 生成带 DEMO 水印的演示报告。

**网站**

- `website/` 纯静态站（GitHub Pages 托管）：首页、方法说明、安装、FAQ、局限、隐私、演示报告、404。
- 零外部资源、零 Cookie、零分析脚本；唯一的浏览器存储是 `localStorage['lezi-theme']`。

**文档**

- `README.md`、`docs/INSTALL.md`、`docs/COMPATIBILITY.md`、`docs/SCORING.md`、`docs/METHODOLOGY.md`、`docs/LIMITATIONS.md`、`docs/PRIVACY.md`、`docs/FAQ.md`。
- `docs/README.md`：文档索引（按「你想干什么」组织，并给出引用硬性规则）。
- `docs/COMPATIBILITY.md` 采用三级证据标记（VERIFIED / PARTIAL / NOT_TESTED），未实测的平台明确标注，不写安装命令。
- `CONTRIBUTING.md`（含「禁止为提分改判分口径」红线、新题七项必交材料、手算夹具硬性规定）、`SECURITY.md`（含诚实边界与已知风险清单）、`CODE_OF_CONDUCT.md`、本文件。
- Issue 模板（bug / feature / question + config）、PR 模板。

### 修复

- **测试自证（致命缺陷）。** 修复前，测试里的期望值全部由被测的 `oracle()` 生成，
  而 `grade()` 内部又调用同一个 oracle —— 这叫「自洽即通过」，等于没测。
  **实证事故：** 把 I01 的 oracle 的 `budgetAttached` 取反后，按题面诚实作答只得 1/4，
  但 `node --test` 仍然 **95/95 全绿**，没有任何一条测试变红。
  本版新增 `tests/golden-fixtures.test.mjs` 以独立手算夹具封堵该缺陷，
  并在 `CONTRIBUTING.md` 里把它写成硬性规定（新增/修改题目必须补一条手算夹具，禁止用 oracle 生成期望值）。

### 已知限制

**验证范围（完整支持矩阵）**

| 环境 | 状态 | 说明 |
|---|---|---|
| Windows + Node 24 | ✅ **VERIFIED** | 两轮真实 Agent 完整考试（100/100、88/100） |
| DSH 桌面端 | ✅ **VERIFIED** | Skill 已被实际发现并从目录触发 |
| macOS / Linux | ⚠️ **PARTIAL** | 代码路径已覆盖、有测试，但**未在真机跑完整局** |
| Node 18 / 20 / 22 | ⚠️ **PARTIAL** | 语法与 API 按 ≥18 编写，CI 覆盖，**未逐一真机验证完整考试** |
| 通用 Agent Skills 宿主 | ⚠️ **PARTIAL** | 包结构与 frontmatter 符合规范；除 DSH 外未在别的宿主实跑 |
| OpenClaw | ❌ **NOT_TESTED** | 本次未能取得一手证据，**不要采信任何未经核实的安装命令** |
| Codex | ❌ **NOT_TESTED** | 同上 |
| npm `bin` / `npx` | ❌ **未实测** | `package.json` 声明了 `bin`，但 `npm install` / `npm link` / `npx` 都没有实际执行过 |

**题库与判分**

- **题库是公开的，可以被读取。** 16 道题的生成逻辑、44 条评分条件、判分器、标准答案推导方式全在 `src/` 里，任何文本编辑器都能读。
- 因此：**模型可能对题面有记忆优势**（若训练数据读过本仓库）；**任何人都能改题、改判分器、改答案文件**。
- **没有「防作弊」这个概念。** 不做，也不宣称做。分数可信度建立在「你没改它」这个前提上。
- **不能作为认证成绩。** 没有第三方见证、没有身份核验、没有签名、没有被测对象锁定。
- **没有排行榜**，不做跨用户比较，也没有中心服务器。
- **不同版本分数不可比。** 以报告里的 `catalogFingerprint` 为准；但该指纹只采样 2 个探针 seed，「同指纹」≠「所有 seed 题面逐字相同」。
- 只有中文题库；只有 16 道题，没有题库轮换，跑第三次开始就会有熟悉度。
- 确定性判分的代价：同义表述覆盖不全（别名表是显式列举的）；散文作答比 JSON 更容易失分；格式不规范可能被判 `UNPARSEABLE`。
- 只支持 `standard` 一种模式，传其它模式会明确报错。

**工程**

- `state.json`、答案文件、判分器都在本地，**没有签名校验**。改 `state.json` 能改成任意分数，`report` 会直接采信。
- 答案文件的 SHA-256 哈希重算保护，能防「无意损坏」和「简单篡改」，但**防不住同时改 `answers/*.json` 与 `state.json`**，更**防不住改判分器本身**。
- 无并发保护：两个进程同时对同一 `runId` 提交，行为未定义。
- 已判分的批次不可覆盖（有意设计，避免刷分）。
- 数据目录是明文 JSON，无加密。
- `catalogFingerprint` 能发现「题库变了」，但不阻止有人改了题库再改代码里的指纹。

**覆盖范围**

16 道题测不到：长上下文、多轮工具调用、代码工程能力、开放式写作与审美、事实准确性/幻觉率、安全性与拒答、多语言能力、推理深度上限、规划与自主性、长期一致性。

完整清单见 [docs/LIMITATIONS.md](docs/LIMITATIONS.md)。

### 安全

- **不提供防作弊保证。** 改 `state.json`、改判分器、改答案文件都在客户端可做；`regrade` 的哈希重算只防「误改/简单篡改」，不防「改判分器」。
- 敏感信息扫描（CI）：扫描常见 GitHub token、OpenAI 风格 key、AWS Access Key、PEM 私钥头等模式，命中即失败。正则定义见 `.github/workflows/ci.yml`。
- 数据与隐私：不联网、不上传、无账号、无埋点。数据落盘位置与删除方法见 [SECURITY.md §5](SECURITY.md) 与 [docs/PRIVACY.md](docs/PRIVACY.md)。

---

## 版本号说明

| 字段 | 当前值 | 变更含义 |
|---|---|---|
| `package.json` `version` | `0.2.0` | 项目发布版本 |
| `examVersion` | `1.2.0` | 题目内容可能变化 |
| `graderVersion` | `1.2.0` | 判分规则变化 |
| `scoringContractVersion` | `1.0.0` | 评分合同（分值与结构）变化 |

前两者都参与运行身份与报告。**跨版本不得直接比较分数。**
