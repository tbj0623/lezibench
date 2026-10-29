# adapters/ — 各宿主适配说明

本目录存放“**某个宿主上怎么装、怎么触发、边界在哪**”的适配说明。
每份说明开头都标了证据等级，规则见 `docs/COMPATIBILITY.md` §0。

| 文件 | 宿主 | 证据等级 |
|---|---|---|
| `dsh.md` | DSH（DeepSeek​ Harness） | **VERIFIED** |
| `openclaw.md` | OpenClaw | **NOT_TESTED** |
| `codex.md` | Codex | **NOT_TESTED** |
| `generic-agentskills.md` | 任何符合 Agent Skills 规范的宿主 | **PARTIAL** |

**共同前提（与宿主无关）**：

- 目录名必须叫 `lezi-bench`，且与 `SKILL.md` 里的 `name: lezi-bench` 完全一致；
- `SKILL.md` 在包的第一层，`scripts/` 与 `src/` 与它同层；
- 运行时只需要 Node.js >= 18，零依赖、零联网。

**本目录不做的事**：不提供未经实测的平台命令，不猜测目录布局。没有证据就写 NOT_TESTED。
