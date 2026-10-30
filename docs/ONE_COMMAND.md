<!--
  本文件是「首次一条指令」的唯一真源。
  修改后必须同步到 README.md §0 与 website/ 首屏，并跑 node website/build/build-site.mjs --check。

  ⚠️ 文案纪律：这里出现的每个命令都必须是真的能跑通的。
  任何"已实测"字样，只有真机跑过之后才能写；没跑过就写"未验证"。
-->

# ONE COMMAND — 复制这一条给 Agent，就能装好并开考

用户只需要做一件事：**把下面整段复制，粘贴给你的 Agent**。
剩下的（下载、校验、安装、自检、出题、作答、判分、出报告）全部由 Agent 自己完成。

---

## 复制下面这一段

```text
用 LeziBench「乐子跑分」给我测一下你的能力，全程本地、不联网、不上传任何数据：

1. 从 https://github.com/tbj0623/lezibench/releases/tag/v1.4.0 下载
   lezi-bench-1.4.0.zip 和 SHA256SUMS.txt，先校验 zip 的 sha256 与 SHA256SUMS.txt 一致，
   不一致就停下并告诉我，不要解压。
2. 解压到一个临时目录，在里面执行：node scripts/cli.mjs install
   （这个命令是幂等的：会先备份旧版；如果目标位置是别的项目的同名目录，它会拒绝而不是覆盖。）
   如果机器上没有 Node.js >= 18.17.0，立刻告诉我并停下，不要编一个分数给我。
3. 执行 node scripts/cli.mjs doctor，把题库指纹报给我。
4. 读同目录的 SKILL.md，按里面流程开考并自己完成全部 16 题（4 批 × 4 题）。
   做完直接把这个结果贴给我：总分 x/100、段位、四个维度各自得分、
   每一道没拿满分的题是哪个评分条件失败及原因、HTML 报告的绝对路径。
```

---

## 这段指令能成立的前提

| 前提 | 说明 |
|---|---|
| 宿主能给 Agent 执行 shell 的权限 | DSH / Codex / OpenClaw 等具备该能力的宿主可用。**纯对话、不能执行命令的宿主不支持**，请如实告知用户，不要伪造跑分。 |
| 本机有 Node.js ≥ 18.17.0 | 零 npm 依赖，不需要 `npm install`，也不需要联网跑分（只有第 1 步下载需要网络）。 |
| 用户已授权执行 | 若宿主会弹权限确认，按宿主的提示点一次同意即可。安装器**不会**要求用户贴 Token，也**不会**绕过任何安全提示。 |

## 为什么不是「让用户自己敲一串命令」

因为那等于把安装门槛转嫁给用户。三种安装方式里：

| 方式 | 谁动手 | 适用 |
|---|---|---|
| **上面这条指令** | Agent 全自动 | 推荐，也是首次体验的默认路径 |
| `bash ./install/install.sh` | 用户敲一条 | 喜欢自己控制的用户；Linux / macOS / Git-Bash |
| `install\install.ps1` | 用户敲一条 | Windows PowerShell 用户 |
| `node scripts/cli.mjs install` | 用户敲一条 | 跨平台通用，也是上面三个入口的真正实现 |

后三种都只是**同一条命令**的不同外壳（`install/install.sh` 与 `install/install.ps1` 是薄包装，
真正的逻辑只有 `scripts/install.mjs` 一份），所以不会出现"文档写了一种、脚本实现另一种"的漂移。

## 装好之后：日常只要说一句话

不需要每次重装。装完之后，用户只要说：

- 「跑个分」
- 「测测我的 Agent」
- 「做个能力评测」
- 或直接输入 `/lezi-bench`

Agent 就会按 `SKILL.md` 开考。若宿主没有自动匹配到这个 Skill，用显式命令 `/lezi-bench`，
并让 Agent 跑一次 `node scripts/cli.mjs doctor` 看 Skill 是否真的被安装并被宿主发现。

## 卸载与回滚

```bash
node scripts/cli.mjs install --uninstall     # 只删 lezi-bench/，备份保留
```

安装时如果覆盖了旧版，旧版会备份在 `<技能根>/lezi-bench.bak-<UTC时间戳>/`（只保留最近 2 份），
需要回滚就直接把备份目录改名回 `lezi-bench/`。
