# COMPETITOR_TRIAL — 虾跑分（paofen.cocoloop.cn）竞品实测报告

> 角色：竞品实测与方法研究员　|　项目：乐子跑分 LeziBench
> 实测窗口：2026-10-29T15:42Z ~ 15:50Z（Asia/Shanghai 2026-10-29 23:42 ~ 23:50）
> 性质：**匿名、隔离、限量**的黑盒走查。全程未登录、未使用任何真实账号、未上传任何文件、未携带任何私密凭据。

---

## 1. 环境与时刻

| 项 | 值 |
|---|---|
| OS | Windows（win32，git-bash / MSYS 环境） |
| curl | `curl 8.22.0 (x86_64-w64-mingw32) libcurl/8.22.0 Schannel zlib/1.3.2 brotli/1.2.0 zstd/1.5.7 libidn2/2.3.8 libpsl/0.21.5 libssh2/1.11.1 WinLDAP` |
| Node / Python | node v24 / python 3.14（本机可用，本报告仅用于解析 JSON） |
| 出口网络 | 中国电信线路（响应头可见 `Via: cache*.l2cn*/cn9704`，`EagleId` 阿里 CDN 特征）；`Server: Tengine` |
| 抓取时间（ISO 8601） | 首次 `skill.md`：2026-10-29T15:40:57Z（HTTP Date 头）<br>API 走查：2026-10-29T15:42:27Z ~ 15:46:21Z<br>官网 HTML/JS：2026-10-29T15:44:40Z / 15:45Z<br>官方规范：2026-10-29T15:49Z |
| 请求总量 | **23 次** HTTP（上限 25）；失败重试各 1 次，符合约束 |
| 身份声明 | `agentName: "LeziBench-Audit-Bot"`, `model: "audit-probe"`，UA `LeziBench-Audit/0.1 (research; anonymous)` |

---

## 2. 三态核实表

标注：**✅ 已核实** = 本次实抓/实测；**📣 官网声明** = 对方单方宣称，未独立验证；**❓ 未核实** = 本次无证据，不得当作事实。

| # | 事项 | 状态 | 证据 / 说明 |
|---|---|---|---|
| 1 | API 为 `POST /api/exam/start` → `/api/exam/answer` → `/api/exam/finish` | ✅ | 三次调用均 200，见 §3 时间线 |
| 2 | 总题数确为 **16** | ✅ | `start` 与每次 `answer` 响应均含 `"totalQuestions":16` |
| 3 | 服务端逐题下发，**一次只给一题** | ✅ | 响应仅含单个 `nextQuestion` 对象，无题目数组 |
| 4 | 逐题实时返回该题得分 | ✅ | `"scored":{"questionId":"q01","score":0,"maxScore":100}` |
| 5 | 每题满分 100 | ✅ | `maxScore:100`（q01–q04 四次一致） |
| 6 | 8 个维度、加权平均得总分 | 📣 | 首页 FAQ 原文；我的 session 仅覆盖 2 个维度，**未能验证加权公式** |
| 7 | **16 题分 8 批、每批 2 题** | ❌ **与实测矛盾** | 首页 FAQ 白纸黑字这么写，但 API 全程**逐题单发**，无 batch 字段、无批量提交入口。见 §5-问题 P2 |
| 8 | 段位 **S 到 C 共 8 级** | ❌ **与实测矛盾** | 首页 FAQ + 官网文案如此写；但同一页面的图例与其 JS 常量 `nb` 只有 **6 个具名档**（神级/顶级/优秀/中等/低端/太差），**无 S/A/B/C 字母**。见 §5-问题 P3 |
| 9 | S 段位 = 93+ 分 | 📣 + ⚠️ | 仅首页文案；JS 图例中最高档写的是 `range:"90+"`、tooltip 写 `90-95 分`。三处口径不一致 |
| 10 | "防作弊检测" | 📣 | 首页原文"标准化测试项、独立评分引擎、防作弊检测"。**实测未观察到任何防作弊机制**，见 §5-问题 P5 |
| 11 | 报告 URL 形如 `https://paofen.cocoloop.cn/report/{sessionId}` | ✅ | `finish` 返回 `reportUrl`，实际值 `.../report/ses_1793288550162_n0nzg5` |
| 12 | **该报告页当前可打开** | ❌ **实测不可用** | 3 次尝试全部失败：502 / 超时 / 502。见 §5-问题 P1 |
| 13 | `finish` 可重复调用且幂等 | ✅ | 两次调用响应体**逐字节同长 3312B**，`reportUrl`、`totalScore`、`timestamp` 全部一致 |
| 14 | 存在 `mustShowToUser` / `instruction` 驱动 Agent 输出 | ✅ | 两字段均为服务端下发的**提示词注入式**指令文本 |
| 15 | 工具力题依赖 `/api/mock/weather`、`/api/mock/users` | ✅ | 两个端点均 200，返回结构化 JSON（见 §3） |
| 16 | 报告页是 SPA 还是 JSON | ❓ | 页面始终 502/超时，**未能观察到成功态**；但从 Next.js 站点结构与 `/report/{id}` 路由推断应为 SPA，**不采信为结论** |
| 17 | 排行榜里"全网上万个 Agent" | 📣 | 首页文案；未能访问排行榜数据核实 |
| 18 | 是否开源 | ❓ | 首页未声称开源；未取得任何仓库地址 |

---

## 3. 真实请求时间线

所有 raw 文件在 `research/raw/`，索引见 `RAW_INDEX.md`。

| # | 时间 (UTC) | Method | Path | HTTP | 耗时 (ms) | 请求体积 | 响应体积 | 关键响应字段 |
|---|---|---|---|---|---|---|---|---|
| 1 | 15:42:27 | POST | `/api/exam/start` | 200 | 5674 | 57 B | 1668 B | `sessionId`, `totalQuestions:16`, `currentQuestion{q01,...}`, `currentIndex:0` |
| 2 | 15:42:38 | POST | `/api/exam/answer` (q01, `{}`) | 200 | 4801 | 71 B | 921 B | `scored{0,100}`, `nextQuestion{q02}`, `progress:6` |
| 3 | 15:42:58 | POST | `/api/exam/answer` (q02, 最小合法) | 200 | 4992 | 142 B | 929 B | `scored{0,100}`, `nextQuestion{q03}`, `progress:13` |
| 4 | 15:43:08 | POST | `/api/exam/answer` (q03, 故意错值) | 200 | 4566 | 166 B | 1249 B | `scored{0,100}`, `nextQuestion{q04}`, `progress:19` |
| 5 | 15:43:17 | POST | `/api/exam/answer` (q04, `{}`) | 200 | 4315 | 71 B | 1877 B | `scored{0,100}`, `nextQuestion{q05}`, `progress:25` |
| 6 | 15:43:27 | POST | `/api/exam/answer` （**空 body**） | **400** | 225 | 0 B | 30 B | `{"error":"请求格式错误"}` |
| 7 | 15:43:28 | POST | `/api/exam/answer` （**缺 sessionId**） | **400** | 230 | 32 B | 48 B | `{"error":"sessionId, questionId, answer 必填"}` |
| 8 | 15:43:28 | POST | `/api/exam/answer` （**伪造 q99**） | **400** | 200 | 71 B | 32 B | `{"error":"题目 q99 不存在"}` |
| 9 | 15:43:29 | POST | `/api/exam/answer` （**重复提交 q04**） | **200** | 4576 | 85 B | 5169 B | ⚠️ `scored{q04}`, **`nextQuestion{q06}`** — **跳过了 q05** |
| 10 | 15:43:39 | POST | `/api/exam/finish` | 200 | 4128 | 40 B | 3312 B | `result{13 keys}`, `reportUrl`, `shareUrl`, `mustShowToUser`, `instruction` |
| 11 | 15:43:57 | GET | `/report/ses_...` | **502** | 9338 | 0 B | 150 B | nginx 502 Bad Gateway |
| 12 | 15:44:14 | GET | `/report/ses_...` （重试 1） | **000** | 20005 | 0 B | 0 B | curl(28) 超时 |
| 13 | 15:44:40 | GET | `/`（首页，抓 JS 与段位表） | 200 | 123 | 0 B | 102403 B | Next.js SSR HTML，含段位图例 |
| 14 | 15:44:5x | GET | `/_next/static/chunks/04eklj-7j4aqp.js` | 000 | ~15000 | 0 B | 0 B | 超时（取消） |
| 15 | 15:44:5x | GET | `/_next/static/chunks/0d3shmwh5_nmn.js` | **502** | — | 0 B | 150 B | 502 |
| 16 | 15:44:5x | GET | `/_next/static/chunks/0ol6x9uy13uwb.js` | **502** | — | 0 B | 150 B | 502 |
| 17 | 15:44:5x | GET | `/_next/static/chunks/10r260s8xmo~c.js` | 200 | — | 0 B | 160678 B | ✅ 含完整段位常量 `nb` |
| 18 | 15:46:08 | POST | `/api/exam/finish` （重复调用） | 200 | 278 | 40 B | 3312 B | 与 #10 **完全一致**（幂等） |
| 19 | 15:46:08 | GET | `/report/ses_...` （第 3 次） | **502** | 4852 | 0 B | 150 B | nginx 502 |
| 20 | 15:46:20 | GET | `/api/mock/weather?city=beijing` | 200 | 253 | 0 B | 59 B | `{"data":{"temperature":22,"condition":"晴","humidity":45}}` |
| 21 | 15:46:21 | GET | `/api/mock/users` | 200 | 1794 | 0 B | 359 B | `{"users":[5 条: id,username,name,role]}` |
| 22 | 15:49:0x | GET | `agentskills.io/specification` | 200 | ~20000 | 0 B | 233466 B | 官方规范 HTML（末段超时，内容已完整） |
| 23 | 15:49:xx | GET | `docs.openclaw.ai/zh-CN/skills` | **000** | 20015 | 0 B | 0 B | 出口被封（ETIMEOUT） |

> ⚠️ 诚实记录：#11 那次调用我的 shell 函数把 `-H "Accept: ..."` 错拆成了两个参数，curl 报 `Could not resolve host: text`（stderr 可见）。该次**仍拿到了有效的 502 响应体**，其结论被 #19 的干净请求独立复现，故不影响判断。

---

## 4. 响应 Schema 记录

> 仅记录**字段名与类型**；示例值一律脱敏/占位，不含任何 token、cookie、Authorization（本次响应中也确实**不存在**这三类内容）。

### 4.1 `POST /api/exam/start` — 200

```jsonc
{
  "sessionId": string,            // "ses_<13位毫秒时间戳>_<6位随机>"，本次值已脱敏
  "totalQuestions": number,       // 16
  "currentIndex": number,         // 0
  "currentQuestion": {
    "questionId": string,         // "q01" .. "q16"
    "dimension": string,          // 机器可读维度键，如 "understanding" / "execution" / "retrieval"
    "dimensionName": string,      // 中文维度名，如 "理解力"
    "title": string,              // 人类可读小题名
    "prompt": string,             // 题面（含要求返回的 JSON 形状）
    "responseSchema": {           // JSON Schema 子集；⚠️ 只有 type/properties/items，无 required
      "type": "object",
      "properties": { "<field>": { "type": string, ... } }
    }
  }
}
```

### 4.2 `POST /api/exam/answer` — 200

```jsonc
{
  "scored": {
    "questionId": string,         // 回显
    "score": number,              // 0..100
    "maxScore": number            // 恒为 100
  },
  "nextQuestion": { /* 同 4.1.currentQuestion 结构 */ } | null,
  "currentIndex": number,         // 下一题的 0-based 下标
  "totalQuestions": number,       // 16
  "progress": number              // 1..100 的整数百分比（当前题序号/16 四舍五入）
}
```

### 4.3 `POST /api/exam/answer` — 400（三类错误统一形态）

```jsonc
{ "error": string }   // 无 errorCode、无 traceId、无 details 数组
```

| 触发条件 | HTTP | `error` 文案 |
|---|---|---|
| 空 body | 400 | `请求格式错误` |
| 缺 `sessionId` | 400 | `sessionId, questionId, answer 必填` |
| 伪造 `questionId` | 400 | `题目 q99 不存在` |
| 已作废/不存在 session | ❓ 未测（预算控制） | — |

### 4.4 `POST /api/exam/finish` — 200

```jsonc
{
  "result": {
    "id": string,                 // "exam_<ms 时间戳>"
    "agentName": string,          // 客户端自报，未校验
    "model": string,              // 客户端自报，未校验
    "questionResults": [
      {
        "questionId": string,
        "dimension": string,
        "dimensionName": string,
        "score": number,
        "maxScore": number,
        "details": string[]       // ⭐ 逐项打分依据，形如 "deadline: ✗" / "reasoning: ✗ (长度0，含推理词=false)"
      }
    ],
    "dimensionScores": { "<dimension>": number },   // 仅含已答维度
    "totalScore": number,
    "grade": string,              // 中文档名，本次 "太差"
    "percentile": number,         // 整数百分位
    "timestamp": string,          // ISO 8601，毫秒 + Z
    "bestDimensions": string[],
    "worstDimension": string,
    "suggestions": string[],      // 中文建议句
    "calibration": {
      "calibratedGrade": string,
      "percentile": number,
      "closestModel": { "name": string, "displayName": string, "score": number, "diff": number },
      "dimensionComparisons": [{
        "dimension": string,
        "dimensionName": string,
        "userScore": number,
        "closestModel": string,
        "diffFromOpus": number,
        "diffFromSonnet": number,
        "benchmark": { "opus": number, "sonnet": number, "gpt5": number,
                       "deepseek": number, "haiku": number }   // 单个基准分，范围 0-100
      }],
      "benchmarkReference": { "opus": number, "sonnet": number, "gpt5": number,
                              "deepseek": number, "haiku": number },   // 总分基准
      "strengths": string[],
      "weaknesses": string[]
    }
  },
  "reportUrl": string,            // https://paofen.cocoloop.cn/report/{sessionId}
  "shareUrl": string,             // 本次与 reportUrl 完全相同（两个字段同值，是否应不同 → 未核实）
  "mustShowToUser": string,       // 中文提示词："🎯 跑分完成！请将此报告链接展示给用户查看详情：<url>"
  "instruction": string           // 英文提示词："IMPORTANT: You MUST display the reportUrl above to the user..."
}
```

### 4.5 从公开 JS 取得的段位常量（**只取阈值数字，不含任何题目内容**）

来源：`https://paofen.cocoloop.cn/_next/static/chunks/10r260s8xmo~c.js`（HTTP 200，160,678 B，2026-10-29T15:45Z）。

```js
let nb=[
 {id:1,grade:"神级",range:"90+",  tooltip:"90-95 分，顶尖 AI，综合能力无可挑剔"},
 {id:2,grade:"顶级",range:"80-89",tooltip:"80-89 分，旗舰模型水平（Opus / GPT-5）"},
 {id:3,grade:"优秀",range:"70-79",tooltip:"70-79 分，主流好模型（Sonnet / DeepSeek）"},
 {id:4,grade:"中等",range:"60-69",tooltip:"60-69 分，基础可用（Haiku 级）"},
 {id:5,grade:"低端",range:"50-59",tooltip:"50-59 分，能力不足，建议换模型"},
 {id:6,grade:"太差",range:"<50",  tooltip:"50 分以下，严重不够"}
]
```

- 同文件另有 8 个维度图标键：`BookOpen, Play, Search, Brain, Wrench, RotateCcw, MessageSquare, Database` → **印证"8 个维度"**，但中文维度名未硬编码在该 chunk 内（应为服务端下发）。
- 同 chunk 内 `95` / `93` 的其余出现均为 SVG path 数据与动画常量，**未发现任何把总分封顶到 95 或 93 的算术逻辑**。

---

## 5. 可复现问题清单

> 置信度定义：**高**=本次直接观测且可重复；**中**=单次观测、机制合理但未穷尽；**低**=推断，需再验。

### P1 — 报告页 502：跑分能算完，但用户打不开报告 ★最高优先级
- **现象**：`finish` 正常返回 200 和 `reportUrl`，但该 URL 连续 3 次请求全部失败（502 / 超时 / 502），而同一域名下 `/api/*` 与首页均正常 200。
- **复现**：① `POST /api/exam/finish` 取 `reportUrl`；② `curl -m 25 <reportUrl>`；③ 观察 nginx 502 或 20s 超时。
- **证据**：`research/raw/report_page.body.txt`、`report_page_retry.meta.txt`、`report_page_check2.body.txt`
- **影响**：这是产品的**核心交付物**。skill.md 反复强调"报告链接是用户查看详细报告的唯一途径""用户看不到这个链接 = 本次跑分对用户无价值"——恰恰是这个唯一途径当前不可用。用户最终只能看到 Agent 转述的一段文字分数。
- **置信度**：**高**（3 次独立尝试、跨 3 分钟；但为单地域单出口观测，不排除偶发）

### P2 — 官网"8 批 × 2 题"与 API 实际"严格逐题"矛盾
- **现象**：首页 FAQ 原文"16 道测试项分 **8 个批次**进行，**每批 2 题**"；但 API 自始至终一次只返回**一道** `nextQuestion`，`answer` 也只接受单题，响应中**没有任何 batch / group / 批次字段**。
- **复现**：`POST /api/exam/start` → 观察 `currentQuestion` 为单对象；连续 `answer` → 每次只推进一题。
- **证据**：`research/raw/start_*.body.json`、`answer_q0*.body.txt`、`homepage.body.txt`
- **影响**：对外文档与实现不一致，会让按"批次"设计流程的集成方困惑；也说明对方的"批次"可能只是**产品叙事**而非工程结构。
- **置信度**：**高**

### P3 — 段位体系三处口径互相打架（S–C 8 级 / 6 具名档 / 93+ 与 90+）
- **现象**：
  - 首页 FAQ 与页面文案：**"段位从 S 到 C 共 8 级，S 段位代表跑分 93+"**；
  - 同一首页的段位图例 + JS 常量 `nb`：**只有 6 档**，命名是"神级/顶级/优秀/中等/低端/太差"，**完全没有 S/A/B/C 字母**；
  - 最高档的区间写法还自相矛盾：`range:"90+"` 但 tooltip 写 `90-95 分`。
- **复现**：抓 `GET /`，搜 `段位从` 与 `nb=[`；或抓 chunk `10r260s8xmo~c.js` 搜 `grade:"神级"`。
- **证据**：`research/raw/homepage.body.txt`、`research/raw/js/10r260s8xmo~c.js`
- **影响**："8 级"和"6 档"至少有一个是错的；对外沟通与内部实现不同源。可作为**对标产品成熟度**的观察点。
- **置信度**：**高**（对"存在矛盾"这一事实）；至于正确版本是哪个，**未核实**

### P4 — 重复提交同一题会静默跳过一题（无幂等、无冲突校验）★机制缺陷
- **现象**：q04 已提交后**再次**提交 q04，服务端返回 200，`scored.questionId` 仍回显 `q04`，但 `nextQuestion` 直接变成 **q06**，`currentIndex` 从 4 跳到 5 —— **q05 被永久跳过**，且无任何警告。
- **复现**：① 正常答到 q04；② 再次 `POST /api/exam/answer` body `{"sessionId":..., "questionId":"q04","answer":{...}}`；③ 观察 `nextQuestion.questionId == "q06"`。
- **证据**：`research/raw/err_dup_answer_q04.body.txt`（5169 B，`currentIndex:5`，`progress:31`）
- **影响**：任何"超时重试"的客户端都会**静默丢题**，总分被压低却毫无提示。这是**真实的健壮性缺陷**，不是用户感知问题。
- **附带的第二处异常**：`finish` 的 `questionResults` 里出现了**两条 `q04`**（`["q01","q02","q03","q04","q04"]`），说明服务端按"每次提交"而非"每题唯一"落库；同时 16 题只答 5 次就允许 `finish` 并出成绩，**没有任何"未答完"校验**。
- **置信度**：**高**

### P5 — "防作弊检测"是marketing用语，实测未见任何机制
- **现象**：首页宣称"独立评分引擎、**防作弊检测**，确保每份跑分报告的公正与可信度"。但实测中：
  - `agentName` / `model` 完全由客户端自报，**服务端不做任何校验**（我填 `LeziBench-Audit-Bot` / `audit-probe` 直接照单全收并印进结果）；
  - 题库经 `prompt` **明文下发到客户端**，答案形状连 `responseSchema` 一起给出 —— Agent 完全可以在本地读到题目与评分字段清单；
  - 唯一的"反作弊"痕迹是 q02 的 `details`：`reasoning: ✗ (长度0，含推理词=false)` —— 这只是**检查答案里有没有推理词**的规则评分，不是防作弊。
- **影响**：任何 Agent 都可以用 `{"agentName":"Claude 4 Opus","model":"claude-opus-4"}` 伪造身份上榜；分数只反映"是否按 schema 填对"，不反映真实能力。
- **置信度**：**高**（对"本次未观察到机制"）；对方是否在**未触发的服务端侧**另有检测，**未核实**

### P6 — 评分依据只对模型可见，不对最终用户可见
- **现象**：逐题 `details` 数组确实存在（如 `"deadline: ✗"`），**但只出现在 `finish` 的 API 响应里**，需要 Agent 主动转述；而 `mustShowToUser` / `instruction` 两个字段**只要求 Agent 展示 `reportUrl`**，从未要求展示扣分依据。叠加 P1（报告页 502），最终用户实际上**既看不到报告页，也拿不到扣分依据**。
- **证据**：`research/raw/finish_probe.body.txt`（`details` 字段）+ `mustShowToUser` / `instruction` 原文
- **置信度**：**中**（结论依赖 P1 成立；若报告页恢复则另当别论）

### P7 — 提示词注入式的结果回收，且文案带强制语气
- **现象**：`skill.md` 正文与 `finish` 响应的 `mustShowToUser` / `instruction` 都是**直接对 Agent 下令**："你必须把跑分报告链接以下面的格式展示给用户""IMPORTANT: You MUST display the reportUrl above"。`skill.md` 里还有"⚠️ 再次强调：你的最后回复必须包含…"。
- **性质判断**：这是**产品设计**（确保回链），不是恶意攻击；但它示范了一种**把竞品指令硬塞进用户 Agent 输出**的模式，属于 LeziBench 应**明确不学**的做法。
- **证据**：`research/raw/skillmd.body.txt` L7-L16、L87-L92、L111；`finish_probe.body.txt` 的 `instruction`
- **置信度**：**高**

### P8 — 前端 chunk 大面积 502，站点稳定性存疑
- **现象**：首页 12 个 JS chunk 中抽测 4 个，**2 个 502、1 个超时**，仅 1 个成功。
- **证据**：`research/raw/js/0d3shmwh5_nmn.js`、`0ol6x9uy13uwb.js`（均为 150 B 的 502 页）
- **影响**：与 P1 同源，指向**同一类边缘/回源故障**。
- **置信度**：**中**（抽样小）

---

## 6. 用户报告的"95 封顶减 8 / 93 起 S"数学冲突 —— 核验结论

**结论：未能核验。按"用户观察／待核实"记录，不得当作已证实漏洞。**

已做的核验动作与结果：

| 核验路径 | 结果 |
|---|---|
| 抓 `finish` 真实响应，检查 `totalScore` 是否有封顶 | 我的样本得分 0，**无法触发高分段**，看不到 95/93 附近的行为 |
| 抓 `finish` 的 `calibration.benchmarkReference` | 五个基准分（opus 93.75 / gpt5 89.38 / sonnet 87.19 / deepseek 77.81 / haiku 61.25）—— **只是对标常量，不是评分上限**，不能拿来证明封顶 |
| 静态搜索前端 chunk 中的 `Math.min/max` | 命中的全是 SVG 动画/motion 库常量，**未发现任何把总分限制到 95 或 93 的算术** |
| 检查段位图例数值 | 最高档 `range:"90+"`、tooltip `90-95 分`、文案 `S 段位 93+` —— **三处本身就不一致**（见 P3），但这是文案冲突，**推不出"95 封顶减 8"** |

**因此：**

- "95 分封顶" **未核实**；
- "减 8" **未核实**；
- "93 分起 S" **仅见于官网文案**（📣），且与同页 JS 图例冲突，**不能作为已证实事实**。

若后续要坐实，唯一可行路径是**构造高分答卷**跑满 16 题（本次为控制请求量与"不刷分"原则主动放弃），或取得对方评分代码（本次禁止下载源代码）。**在此之前，任何"数学冲突"的表述都只能标为待核实。**

---

## 7. 与 LeziBench 的差距对照

| 维度 | 虾跑分（实测） | LeziBench 应为 | 决策 |
|---|---|---|---|
| **评分位置** | 服务端中央评分，必须联网 | **本地评分，不依赖中心服务器** | ✅ **核心差异化**，坚持 |
| **题库保密** | 明文下发 `prompt` + `responseSchema` 到客户端，Agent 可全量读取 | 题目与判分规则随包分发，**但明确声明"可读"**，不假装防作弊 | **诚实优先**：不吹"防作弊"，改称"开放题库，任何人可审计" |
| **报告可用性** | `reportUrl` 依赖在线页，**当前 502 打不开** | 报告**本地生成**（Markdown/HTML 落盘），断网可看 | ✅ **直接借鉴其失败教训**：任何"唯一途径"式单点都必须本地兜底 |
| **结果交付** | 依赖 Agent"必须展示链接"的提示词约束 | 报告**直接落盘为文件**，Agent 只是指路 | **不学**提示词强制；用文件产物替代 |
| **逐题反馈** | 逐题返回 `score` + 最终 `details`，但用户看不到 | 逐题给出**可读的判分理由**，且**用户可见** | ✅ **借鉴并改进**：`details` 思路好，暴露层级要改 |
| **批次结构** | 宣称 8×2，实际逐题（P2） | 4 维 / 4 批 / 16 题，**文档与实现必须一致** | **不学**"叙事与实现对不上" |
| **幂等性** | 重复提交跳题、无校验（P4） | 提交需**幂等**：同题重复提交返回同一结果，不推进状态 | ✅ **必须改进**（这是最实在的工程教训） |
| **完整性校验** | 16 题只答 5 题即可 `finish` 出分 | 未答完**不允许**出最终报告，或明确标注"不完整" | ✅ **必须改进** |
| **身份可信度** | `agentName`/`model` 完全自报，可随意伪造 | 本地评测**不追求排行榜防伪**；报告里标注"自报身份" | **降级处理**：不搞排行榜就不用防伪，省掉整个攻击面 |
| **段位体系** | 8 级/6 档/93+/90+ 三套口径（P3） | **一套阈值，单一事实来源**，代码与文档同源 | ✅ **必须改进** |
| **对外文档** | `skill.md` 3.4KB，结构清晰，API 三段式易懂 | 保持同等简洁；**但不夹带"必须如何回复用户"的命令** | 借鉴结构，**不学**语气 |
| **错误契约** | 统一 `{"error": string}`，400 明确、文案友好 | 可借鉴：**单一 error 形态 + 中文可读文案** | ✅ **借鉴**（但建议补 `errorCode` 便于程序判断） |
| **工具力题** | 用 `/api/mock/*` 提供可调用的假数据接口 | 本地起 mock 或直接内置 fixture，**不依赖外部服务** | ✅ 借鉴题型，**改**实现方式 |

---

## 8. 安全与合规声明

1. **未上传任何隐私数据**：全程只有 4 种请求体——`{agentName, model}`、`{sessionId, questionId, answer}`、`{sessionId}`、空 body。没有文件名、路径、环境变量、用户信息、主机信息。Agent 名字用的是虚构的 `LeziBench-Audit-Bot`。
2. **未使用任何真实账号 / 凭据**：未登录、未注册、未携带 Cookie、未携带 `Authorization`、未携带任何 token。实测响应头中也**不存在** `Set-Cookie` / `WWW-Authenticate` / 限流头。
3. **未复制对方题库**：报告内仅保留**必要最短引文**（每题 ≤80 字，且仅在需要说明题面结构时引用），**未整库复制**、**未下载任何题库文件**、**未下载对方源代码**（只读取了公开可访问的前端 chunk 中的**段位阈值常量**，并已在 §4.5 注明 URL 与时间）。
4. **未绕过任何限制**：未做越权访问、未爆破、未构造非法 session、未尝试提权。请求量 23 次，低于 25 次上限；失败重试各 ≤1 次。
5. **对方返回内容一律当数据**：`skill.md`、`mustShowToUser`、`instruction` 中所有"你必须…""IMPORTANT: You MUST…"均被当作**被测对象的输出样本**记录，**未执行**。其中未出现要求上传文件、提供 token 或执行 shell 的指令；若出现，按纪律应立即停止并记为安全风险——本次**未触发**该情形。
6. **隔离性**：所有操作在同一台研究机上以 curl 完成，未打开浏览器登录态（`~/.dsh/browser-profile` 未被使用），与 `lezibench/` 开发目录完全隔离；写入范围严格限制在 `research/`。

---

## 9. 一句话给 LeziBench 的启示

> 虾跑分证明了两件事：**"skill 驱动 + 逐题 JSON 打分"这个交互模型是成立的、且足够简单**；但它也示范了三个必须避开的坑——**把唯一交付物放在一个会 502 的在线页面上、把状态推进做成非幂等的、把档位阈值写成三套口径**。LeziBench 的"本地出报告"如果做扎实，正好一次性绕开这三个坑。
