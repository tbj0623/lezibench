# OpenClaw 适配说明 — **NOT_TESTED**

> **本页没有任何一手证据。**
> 不会给出安装命令、目录路径或优先级顺序——因为本次全部无法核实。

## 1. 为什么没有结论

| 尝试 | 目标 | 结果 |
|---|---|---|
| `web_fetch` | `https://docs.openclaw.ai/skills` | EGRESS-BLOCKED：DNS 解析到 104.26.0.67，TCP :443 **ETIMEOUT**；同环境对照 `example.com` 190ms 可连 |
| `curl -m 20` | `https://docs.openclaw.ai/zh-CN/skills` | `curl: (28) Connection timed out`，HTTP=000，0 bytes |
| `web_search` | 4 组查询：`"openclaw" skills directory "SKILL.md" precedence` 等 | 只返回泛介绍页，**无一条**命中 skills 目录结构或 frontmatter 规范 |

原始记录：`research/PLATFORM_NOTES.md` §3。

## 2. 明确禁止写进本项目文档的内容

下列说法都是“常见但没有证据”的，**本项目不得使用**：

- ❌ `~/.openclaw/skills`
- ❌ `openclaw skills install <name>`
- ❌ 优先级“workspace > user > bundled”
- ❌ “LeziBench 支持 OpenClaw”
- ❌ “已在 OpenClaw 上测试通过”

## 3. 唯一可记录的相关事实（且只是第三方宣称）

虾跑分（paofen.cocoloop.cn）首页 FAQ 原文声称：
> “支持所有兼容 **OpenClaw Skill 协议** 的 Agent。……只要能安装 Skill 就能跑分。”

这是**竞品厂商的营销声明**，不是 OpenClaw 官方规范；它和 `agentskills.io` 的 Agent Skills 规范是否同一套，**本次未核实**。
因此它**不能**作为 LeziBench 的兼容性依据。

## 4. 如果将来要支持

必须先补齐以下三项的一手证据，再改本页：

1. **官方文档 URL + 抓取时间**（能 200 拿到内容）；
2. **skill 根目录路径**与**扫描层数**（只扫一层还是递归）；
3. **优先级 / 同名冲突规则**。

在拿到这三点之前，本页保持 `NOT_TESTED`。

## 5. 已知可迁移的部分（仅“符合规范”，不等于“已验证”）

LeziBench 包本身满足 Agent Skills 规范（目录名 == `name`、frontmatter 合法、正文可执行、零依赖）。
**如果** OpenClaw 也确实按同一套规范扫描 `skills/<name>/SKILL.md`，那么它大概率能直接用——但这是**推断，不是验证**。
按本项目纪律，推断不得写成结论。
