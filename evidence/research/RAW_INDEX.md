# RAW_INDEX — `research/raw/` 证据文件索引

> 采集窗口：2026-10-29T15:40:57Z ~ 15:49Z（Asia/Shanghai 2026-10-29 23:40:57 ~ 23:49）
> 目标主机：`https://paofen.cocoloop.cn`（除最后的官方规范抓取外）
> 抓取方式：`curl 8.22.0 (x86_64-w64-mingw32)`，UA `LeziBench-Audit/0.1 (research; anonymous)`
> 目录：`research/raw/`，子目录 `research/raw/js/`

## 脱敏说明（对全部文件统一生效）

- 本次所有响应中**不存在** token、cookie、`Set-Cookie`、`Authorization`、`WWW-Authenticate` 等凭据类内容；已用
  `grep -i -E 'set-cookie|authorization|www-authenticate' research/raw/*.headers.txt` 核验，**零命中**。
- `sessionId`（`ses_1793288550162_n0nzg5`）与 `exam id`（`exam_1793288621318`）为本次审计**临时匿名会话**标识，
  由匿名 `start` 现场生成、不含任何个人信息，且 `agentName` 为虚构值 `LeziBench-Audit-Bot`。为便于复现，文件中**保留原值**。
- 未记录、未保存任何真实账号、邮箱、手机号或本机路径信息。
- **题目原文**：响应体按原样保存（这是黑盒走查的必要证据），但**主报告 COMPETITOR_TRIAL.md 中每题引文 ≤80 字**，
  且本目录**仅用于内部审计比对，不得进入 LeziBench 产品包**。这一点请下游工程师务必遵守。

---

## 1. 预先存在的文件（非本次采集）

| 文件 | 字节 | 说明 |
|---|---|---|
| `skillmd.headers.txt` | 890 | `GET https://paofen.cocoloop.cn/skill.md` 响应头。HTTP **200**，`Content-Type: text/markdown; charset=UTF-8`，`Content-Length: 3470`，`Last-Modified: Thu, 16 Apr 2026 08:27:22 GMT`，`Date: Thu, 29 Oct 2026 15:40:57 GMT`，`Server: Tengine`。 |
| `skillmd.body.txt` | 3470 | 同上响应体，111 行。**这是对方"协议文档"的唯一权威来源**，本报告 §2/§4 的文档侧结论均出自此文件。 |

---

## 2. 主 API 走查（会话 `ses_1793288550162_n0nzg5`）

每个请求一组三件套：`.body.*`（响应体）、`.headers.txt`（响应头）、`.meta.txt`（本次请求的 method/url/时间/字节/耗时）。
`start` 与 `answer_q01` 因用内联命令抓取，命名带时间戳且无 `.meta.txt`，其元数据已在下表补全。

| # | 文件前缀 | 时间 (UTC) | Method | Path | HTTP | 耗时 ms | 上行 B | 下行 B |
|---|---|---|---|---|---|---|---|---|
| 1 | `start_20261029T154227Z` | 15:42:27 | POST | `/api/exam/start` | 200 | 5673.9 | 57 | 1668 |
| 2 | `answer_q01_20261029T154238Z` | 15:42:38 | POST | `/api/exam/answer` | 200 | 4801.5 | 71 | 921 |
| 3 | `answer_q02_minimal` | 15:42:58 | POST | `/api/exam/answer` | 200 | 4991.5 | 142 | 929 |
| 4 | `answer_q03_wrong` | 15:43:08 | POST | `/api/exam/answer` | 200 | 4566.3 | 166 | 1249 |
| 5 | `answer_q04_minimal` | 15:43:17 | POST | `/api/exam/answer` | 200 | 4315.3 | 71 | 1877 |

**请求体（全部，逐字）**

```jsonc
// #1 start
{"agentName":"LeziBench-Audit-Bot","model":"audit-probe"}

// #2 q01 —— "故意错误的空答案"
{"sessionId":"ses_1793288550162_n0nzg5","questionId":"q01","answer":{}}

// #3 q02 —— schema 最小合法值，内容故意无意义
{"sessionId":"...","questionId":"q02","answer":{"inferredTarget":"x","inferredAction":"y","confidence":0,"reasoning":""}}

// #4 q03 —— 故意全错（未过滤、未排序、平均数填 0）
{"sessionId":"...","questionId":"q03","answer":{"step1":[3,7,2,9,1,5,8,4,6],"step2":[3,7,2,9,1,5,8,4,6],"step3":[3,7,2,9,1],"step4":0,"step5":0}}

// #5 q04 —— 空对象
{"sessionId":"...","questionId":"q04","answer":{}}
```

> ⚠️ 请求体按"故意错误/最小合法"原则构造，**目的是观察反馈 schema 而非刷分**，且**主动停在 4 题**（远低于 16 题），
> 以免产生一个看似真实的低分成绩单污染对方排行榜。

---

## 3. 错误处理走查（每类各 1 次）

| 文件前缀 | 时间 (UTC) | HTTP | 耗时 ms | 上行 B | 下行 B | 触发条件 | 响应体全文 |
|---|---|---|---|---|---|---|---|
| `err_empty_body` | 15:43:27 | **400** | 224.8 | 0 | 30 | 空 body | `{"error":"请求格式错误"}` |
| `err_missing_session` | 15:43:28 | **400** | 229.6 | 32 | 48 | 缺 `sessionId` | `{"error":"sessionId, questionId, answer 必填"}` |
| `err_forged_questionid` | 15:43:28 | **400** | 200.0 | 71 | 32 | 伪造 `questionId:"q99"` | `{"error":"题目 q99 不存在"}` |
| `err_dup_answer_q04` | 15:43:29 | **200** | 4576.1 | 85 | **5169** | **重复提交已答的 q04** | 见下方重点说明 |

**`err_dup_answer_q04` 是本轮最重要的证据文件**：响应 200，`scored.questionId` 回显 `q04`，但
`nextQuestion.questionId` 直接跳到 **`q06`**，`currentIndex:5`、`progress:31` —— 说明 **q05 被静默跳过**（对应主报告 P4）。

```jsonc
// 请求
{"sessionId":"ses_1793288550162_n0nzg5","questionId":"q04","answer":{"employees":[]}}
// 响应关键字段
{"scored":{"questionId":"q04","score":0,"maxScore":100},
 "nextQuestion":{"questionId":"q06", ...},
 "currentIndex":5, "totalQuestions":16, "progress":31}
```

---

## 4. 结束与报告

| 文件前缀 | 时间 (UTC) | HTTP | 耗时 ms | 上行 B | 下行 B | 说明 |
|---|---|---|---|---|---|---|
| `finish_probe` | 15:43:39 | 200 | 4128.2 | 40 | 3312 | 首次 `POST /api/exam/finish`。返回 `result`(13 键) + `reportUrl` + `shareUrl` + `mustShowToUser` + `instruction` |
| `finish_repeat` | 15:46:08 | 200 | 277.6 | 40 | 3312 | 重复调用。**响应体逐字节等长、`reportUrl`/`totalScore`/`timestamp` 完全一致 → 幂等** |
| `report_page` | 15:43:57 | **502** | 9337.6 | 0 | 150 | `GET /report/ses_1793288550162_n0nzg5` → nginx 502。⚠️ 该次 curl 的 `-H` 被错拆，stderr 有 `Could not resolve host: text`，但 502 响应体真实有效 |
| `report_page_retry` | 15:44:14 | **000** | 20005 | 0 | 0 | 重试 1：`curl: (28) Operation timed out after 20004 ms`。仅 `.meta.txt` + 空 `.headers.txt`，无 body 文件 |
| `report_page_check2` | 15:46:08 | **502** | 4851.7 | 0 | 150 | 第 3 次（干净请求）：仍 502。与首次一致，**排除偶发** |

> 结论：`reportUrl` **确实拿到了**：`https://paofen.cocoloop.cn/report/ses_1793288550162_n0nzg5`
> 但**该页 3/3 次不可访问**。主报告 P1 即基于这三份文件。

---

## 5. 公开站点（首页与前端 JS）

| 文件 | 时间 (UTC) | URL | HTTP | 字节 | 说明 |
|---|---|---|---|---|---|
| `homepage.body.txt` | 15:44:40 | `https://paofen.cocoloop.cn/` | 200 | 102403 | Next.js SSR 首页。含 FAQ 全文（**"16 题分 8 批、每批 2 题"**、**"段位从 S 到 C 共 8 级，S 段位 93+"**）、段位图例、8 维度文案、"防作弊检测"营销语 |
| `homepage.headers.txt` | 15:44:40 | 同上 | 200 | 1059 | `Content-Type: text/html`、`Server: Tengine`、阿里 CDN `Via`/`EagleId` |
| `js/10r260s8xmo~c.js` | 15:45Z | `/_next/static/chunks/10r260s8xmo~c.js` | 200 | 160678 | ✅ 唯一抓取成功的 chunk。含**段位常量 `nb`（6 档）** 与 8 个维度图标键。**只取阈值数字，未取任何题目内容**（该 chunk 内也不含题目） |
| `js/0d3shmwh5_nmn.js` | 15:45Z | 同名路径 | **502** | 150 | 502 错误页，非 JS |
| `js/0ol6x9uy13uwb.js` | 15:45Z | 同名路径 | **502** | 150 | 502 错误页，非 JS |
| `js/04eklj-7j4aqp.js` | 15:45Z | 同名路径 | 000 | 0 | 抓取超时被取消，**无文件**（未落盘） |

> 说明：首页共引用 12 个 chunk，本次**抽样 4 个**即停止（2 个 502、1 超时、1 成功），
> 因为在成功的 `10r260s8xmo~c.js` 中已取得所需的段位阈值，**不再扩大抓取面**。

---

## 6. 文档声明的 mock 端点（工具力题依赖）

| 文件前缀 | 时间 (UTC) | URL | HTTP | 耗时 ms | 下行 B | 响应体 |
|---|---|---|---|---|---|---|
| `mock_weather` | 15:46:20 | `/api/mock/weather?city=beijing` | 200 | 253.2 | 59 | `{"data":{"temperature":22,"condition":"晴","humidity":45}}` |
| `mock_users` | 15:46:21 | `/api/mock/users` | 200 | 1793.7 | 359 | `{"users":[{"id":1,"username":"alice_dev","name":"Alice Chen","role":"developer"}, …共 5 条]}` |

> 两者均为**公共、无鉴权、只读**的假数据端点，验证了 skill.md 中 q09/q10 的可调用前提。
> 未调用 `/api/mock/users/{id}/orders`（预算控制；`/api/mock/users` 已足以证明 mock 家族存在）。

---

## 7. 官方规范抓取（非竞品，服务于 PLATFORM_NOTES.md）

| 文件 | 时间 (UTC) | URL | HTTP | 字节 | 说明 |
|---|---|---|---|---|---|
| `agentskills_spec.html` | 15:49Z | `https://agentskills.io/specification` | 200 | 233466 | Agent Skills 官方规范全文 HTML。**末尾 20s 超时，但正文已完整落盘**（`name` 1-64 / kebab / 必须等于父目录名、`description` 1-1024 等硬性约束均在其中） |

---

## 8. 未落盘但已记录的请求（无文件，仅供计数）

| 时间 (UTC) | 目标 | 结果 |
|---|---|---|
| 15:44:5x | `/_next/static/chunks/04eklj-7j4aqp.js` | 超时取消（000） |
| 15:49Z | `https://docs.openclaw.ai/zh-CN/skills` | **出口被封**，`curl: (28) Connection timed out`，000，0 B |
| 15:49Z | `https://raw.githubusercontent.com/.../skill-filesystem/README.md` | 200（内容已写入 PLATFORM_NOTES，未单独落盘） |
| 15:49Z | `https://raw.githubusercontent.com/.../tool-skill/README.md` | 200（同上） |

---

## 9. 汇总

- **文件总数**：见 `ls research/raw`；核心证据 15 组（start 1 + answer 4 + error 4 + finish 2 + report 3 + homepage 1）。
- **HTTP 请求总数**：**23 次**（预算 25）。
- **失败重试**：报告页重试 1 次，符合"每类最多 1 次"。
- **凭据泄露**：无。
- **题库复制**：无（原始响应含题面，但已在 §脱敏说明中限定用途，且主报告引用 ≤80 字/题）。
