# 文档索引

> LeziBench 的文档按「**先回答你此刻的问题**」排序，而不是按文件名的字母。
> 如果你只想读一份，读 [../README.md](../README.md)；如果你想判断这份成绩能不能信，读 [LIMITATIONS.md](LIMITATIONS.md)。

仓库根目录的 [README.md](../README.md) 是产品总览（定位、分值结构、安装、支持矩阵、它不是什么）；
本页是 `docs/` 下各份文档的导览。

---

## 1. 按「你想干什么」找

| 你想…… | 看这份 | 一句话 |
|---|---|---|
| 先搞清楚这是个什么东西 | [../README.md](../README.md) | 16 题、100 分、4 维、本地判分、全程不联网 |
| 把它装进 Agent | [INSTALL.md](INSTALL.md) | 三种安装方式，含最容易踩的坑（名字是 `lezi-bench` 不是 `lezibench`） |
| 确认它在我这个平台上能不能用 | [COMPATIBILITY.md](COMPATIBILITY.md) | 三级证据：**VERIFIED / PARTIAL / NOT_TESTED**，未实测的明确标出来 |
| 知道我这一分是怎么扣的 | [SCORING.md](SCORING.md) | 16 道题逐题的评分条件与分值 |
| 知道这套分数凭什么算数 | [METHODOLOGY.md](METHODOLOGY.md) | 判分方法论：为什么用确定性代码判、条件怎么拆、指纹怎么算 |
| 知道它**测不了**什么 | [LIMITATIONS.md](LIMITATIONS.md) | 能力边界 + 信任边界 + 什么样的比较没有意义 |
| 知道数据存在哪、怎么删 | [PRIVACY.md](PRIVACY.md) | 没有服务器就没有上传；附各平台数据目录与删除命令 |
| 有具体疑问 | [FAQ.md](FAQ.md) | 按「最容易被误解的排前面」排序 |
| 想贡献一道题 / 改判分器 | [../CONTRIBUTING.md](../CONTRIBUTING.md) | 七项必交材料 + 零容忍红线 + commit/PR 约定 |
| 想报安全漏洞 | [../SECURITY.md](../SECURITY.md) | 走 GitHub Security Advisory；含已知风险清单与诚实边界 |
| 想知道这一版有什么、缺什么 | [../CHANGELOG.md](../CHANGELOG.md) | `0.1.0` 的功能清单与已知限制 |
| 参与讨论的行为底线 | [../CODE_OF_CONDUCT.md](../CODE_OF_CONDUCT.md) | Contributor Covenant 2.1 精简版 |
| 各宿主适配的说明 | [../adapters/README.md](../adapters/README.md) | 适配层文档入口 |

---

## 2. 全部文档

### 2.1 面向使用者

| 文件 | 内容 | 状态 |
|---|---|---|
| [../README.md](../README.md) | 产品总览、分值结构、安装、支持环境真实状态、与竞品的实测差异 | ✅ 已有 |
| [INSTALL.md](INSTALL.md) | 安装到用户级 / 项目级 / 用安装器；装后自检；卸载 | ✅ 已有 |
| [COMPATIBILITY.md](COMPATIBILITY.md) | 各宿主兼容性**证据分级**（VERIFIED / PARTIAL / NOT_TESTED）与「文档作者硬性规则」 | ✅ 已有 |
| [SCORING.md](SCORING.md) | 逐题评分规则与分值（由 `docs/build/build-scoring.mjs` 从题库自动生成） | ✅ 已有 |
| [METHODOLOGY.md](METHODOLOGY.md) | 评分方法论：设计取舍、条件拆分、题库指纹、为什么不用模型判分 | ✅ 已有 |
| [LIMITATIONS.md](LIMITATIONS.md) | 能力边界（测不到什么）、信任边界（不防作弊/不认证）、无意义的比较方式 | ✅ 已有 |
| [PRIVACY.md](PRIVACY.md) | 收集什么（几乎什么都不收集）、数据落盘位置、怎么删干净、网站本身 | ✅ 已有 |
| [FAQ.md](FAQ.md) | 常见问题与误解 | ✅ 已有 |

### 2.2 面向贡献者与维护者

| 文件 | 内容 | 状态 |
|---|---|---|
| [../CONTRIBUTING.md](../CONTRIBUTING.md) | 加一道题的七项必交材料、**禁止为提分改判分口径**、代码风格、commit 约定、PR 流程、回归测试范式 | ✅ 已有 |
| [../SECURITY.md](../SECURITY.md) | 支持版本、漏洞上报（GitHub Security Advisory）、诚实边界、已知风险清单、数据与隐私 | ✅ 已有 |
| [../CHANGELOG.md](../CHANGELOG.md) | 版本变更记录 | ✅ 已有 |
| [../CODE_OF_CONDUCT.md](../CODE_OF_CONDUCT.md) | 行为准则 | ✅ 已有 |
| [../.github/workflows/ci.yml](../.github/workflows/ci.yml) | CI：Node 18/20/22 矩阵 + Ubuntu/macOS 单测 + 敏感信息扫描（无 secret） | ✅ 已有 |
| [../.github/workflows/pages.yml](../.github/workflows/pages.yml) | Pages 部署（部署前先跑测试） | ✅ 已有 |
| [../.github/ISSUE_TEMPLATE/](../.github/ISSUE_TEMPLATE/) | Issue 模板（bug / feature / question + config） | ✅ 已有 |
| [../.github/PULL_REQUEST_TEMPLATE.md](../.github/PULL_REQUEST_TEMPLATE.md) | PR 模板（含新题与判分改动的专项自查） | ✅ 已有 |
| [../adapters/README.md](../adapters/README.md) | 各宿主适配说明（适配层入口） | ✅ 已有 |

### 2.3 研究记录（不在 `docs/` 下，但引用频繁）

| 文件 | 内容 |
|---|---|
| [../../research/COMPETITOR_TRIAL.md](../../research/COMPETITOR_TRIAL.md) | 虾跑分（`paofen.cocoloop.cn`）竞品实测报告：时间线、三态核实表、可复现问题清单 |
| [../../qa/host/HOST_TRIAL.md](../../qa/host/HOST_TRIAL.md) | DSH 宿主真机安装与完整考试记录 |

> 注意：`research/` 与 `qa/` 是**研究记录**，其中的结论按「已核实 / 官网声明 / 未核实」三态标注。
> 引用时必须带上状态标记，不能当成已证实的结论。

---

## 3. 引用的硬性规则

写文档、写网站、对外发言时，请守住这三条（摘自 [COMPATIBILITY.md §6](COMPATIBILITY.md) 与 [LIMITATIONS.md §8](LIMITATIONS.md)）：

1. **平台结论必须带证据等级。** 只有 **VERIFIED** 的条目才能写成祈使句式的安装步骤；**PARTIAL** 必须同时写出未验证的边界；**NOT_TESTED** 只能写「未核实」。
2. **不得出现「全平台兼容」「防作弊」「认证成绩」这类说法。** 它们是事实错误，不是夸张修辞。
3. **引用分数时必须同时给出**：总分（与四维分）、`examVersion` / `graderVersion` / `catalogFingerprint`、以及「本地公开题库自测 · 非认证 · 不防作弊 · 不与跨版本成绩比较」。

---

## 4. 文档的时效性

- 判分相关的事实（分值、条件、阈值）以 **`src/` 里的代码**为准。`SCORING.md` 是自动生成的，若与代码不一致，是生成器没跑。
- 兼容性事实以 [COMPATIBILITY.md](COMPATIBILITY.md) 为准，且每条都标了证据等级与采集时间。
- 版本变更以 [../CHANGELOG.md](../CHANGELOG.md) 为准。

发现文档与代码不一致，请开 Issue（用 `bug_report.yml`）——**文档写错比不写更糟**。
