#!/usr/bin/env node
/**
 * 从 src/exam/** 直接生成 docs/SCORING.md。
 *
 * 目的：SCORING.md 是要「对得上代码」的文档。手抄一定会漂移，
 * 所以这文件不手写 —— 每次题库改动后跑一次这个脚本。
 *
 * 用法：node docs/build/build-scoring.mjs [--check]
 *   --check  只比对，不写盘；不一致时退出码 1（给 CI 用）
 */
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ITEMS, DIMENSIONS, BATCHES, LEVELS, criteriaOf,
  assertCatalogIntegrity, catalogFingerprint,
  EXAM_VERSION, GRADER_VERSION, SCORING_CONTRACT_VERSION,
} from '../../src/exam/manifest.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(HERE, '..', 'SCORING.md');

const DIM_NOTE = {
  instruction: '多条要求叠在一起，后面的话覆盖前面的话，还夹着「这次不用交了」这类撤回。',
  reasoning: '算账、排依赖顺序、在多个约束下找最优解、从线索里做排除。',
  data: '去重排序、区分事实与推断、两张表合并且找出冲突、按一串规则分类。',
  correction: '状态改来改去之后是什么、算式错在哪、新旧规则按哪个算、bug 根因是什么。',
};

const DIFF_NOTE = {
  easy: '基础 · 4 分',
  standard: '标准 · 6 分',
  challenge: '挑战 · 9 分',
};

function render() {
  assertCatalogIntegrity();
  const totalCriteria = ITEMS.reduce((s, i) => s + criteriaOf(i).length, 0);
  const L = [];

  L.push('<!-- 本文件由 docs/build/build-scoring.mjs 自动生成，请勿手改。 -->');
  L.push('<!-- 改动题库后运行：node docs/build/build-scoring.mjs -->');
  L.push('');
  L.push('# SCORING — 逐题评分规则与分值');
  L.push('');
  L.push(`> exam v${EXAM_VERSION} · grader v${GRADER_VERSION} · 评分合同 v${SCORING_CONTRACT_VERSION}`);
  L.push('>');
  L.push(`> 题库指纹：\`${catalogFingerprint()}\``);
  L.push('>');
  L.push(`> 本文件由脚本从 \`src/exam/items/*.mjs\` 的 \`publicCriteria\` 直接生成，共 **${ITEMS.length} 题 / ${totalCriteria} 条条件**。`);
  L.push('> 页面上的每一条文本都与源码逐字一致；如果两者对不上，说明有人手改了这份文档，请重新生成。');
  L.push('');
  L.push('---');
  L.push('');
  L.push('## 0. 先读这三条');
  L.push('');
  L.push('1. **条件是判分口径，不是答案。** 题面里的日期、金额、人名、编号都由 seed 生成，每次开考都不同；条件文本描述「什么样的答案算对」，不泄露具体答案。');
  L.push('2. **子条件是最小计分单位。** 没有半分，没有「整体印象分」。题目得分 = 通过的子条件分值之和。');
  L.push('3. **同一份答案重判，分数不变**（除非 grader 版本升级）。判分是确定性代码，不是模型调用。');
  L.push('');
  L.push('---');
  L.push('');
  L.push('## 1. 分值与结构');
  L.push('');
  L.push('四个维度各 25 分，维度之间不加权、不换算。总分 = 十六道题得分直接相加。');
  L.push('每个维度内部固定为「1 道 4 分 + 2 道 6 分 + 1 道 9 分」。');
  L.push('');
  L.push('| 维度 | 中文名 | 满分 | 覆盖内容 |');
  L.push('|---|---|---:|---|');
  for (const d of DIMENSIONS) {
    L.push(`| \`${d.key}\` | ${d.label} | ${d.points} | ${DIM_NOTE[d.key]} |`);
  }
  L.push(`| — | **合计** | **${DIMENSIONS.reduce((s, d) => s + d.points, 0)}** | 16 题 |`);
  L.push('');
  L.push('难度分布：4 道基础（每题 4 分）+ 8 道标准（每题 6 分）+ 4 道挑战（每题 9 分）= 100 分。');
  L.push('');
  L.push('批次：');
  L.push('');
  L.push('| 批次 | 题目 | 本批满分 |');
  L.push('|---|---|---:|');
  for (const b of BATCHES) {
    const items = ITEMS.filter((i) => i.batch === b);
    L.push(`| 第 ${b} 批 | ${items.map((i) => `\`${i.id}\``).join(' · ')} | ${items.reduce((s, i) => s + i.points, 0)} |`);
  }
  L.push('');
  L.push('段位（`LEVELS` 常量，闭区间且首尾相接）：');
  L.push('');
  L.push('| 段位 | English | 分数区间 |');
  L.push('|---|---|---|');
  for (const lv of LEVELS) L.push(`| ${lv.label} | ${lv.en} | ${lv.min} – ${lv.max} |`);
  L.push('');
  L.push('---');
  L.push('');
  L.push('## 2. 逐题规则');
  L.push('');
  L.push('每一题的格式统一：题号 / 维度 / 难度 / 满分 / 批次 / 子条件（id + 分值 + 条件文本）。');
  L.push('');

  for (const d of DIMENSIONS) {
    const items = ITEMS.filter((i) => i.dimension === d.key);
    L.push(`### ${d.label}（\`${d.key}\`）· ${items.reduce((s, i) => s + i.points, 0)} 分`);
    L.push('');
    for (const it of items) {
      const crit = criteriaOf(it);
      const sum = crit.reduce((s, c) => s + c.points, 0);
      if (sum !== it.points) throw new Error(`${it.id} 子条件合计 ${sum} ≠ 满分 ${it.points}`);
      L.push(`#### \`${it.id}\` ${it.title}`);
      L.push('');
      L.push(`- 维度：${d.label}（\`${it.dimension}\`）`);
      L.push(`- 难度：${DIFF_NOTE[it.difficulty]}`);
      L.push(`- 满分：**${it.points} 分**（${crit.length} 条子条件）`);
      L.push(`- 批次：第 ${it.batch} 批`);
      L.push('');
      L.push('| 条件 ID | 分值 | 评分条件 |');
      L.push('|---|---:|---|');
      for (const c of crit) L.push(`| \`${c.id}\` | ${c.points} | ${c.text} |`);
      L.push('');
    }
  }

  L.push('---');
  L.push('');
  L.push('## 3. 结构自检清单');
  L.push('');
  L.push('每次 `start` 前会执行 `assertCatalogIntegrity()`，下面每一条都必须成立，否则拒绝出题：');
  L.push('');
  L.push('- [x] 恰好 16 题，ID 不重复，总分恰好 100');
  L.push('- [x] 四个维度各恰好 25 分');
  L.push('- [x] 每个维度的分值结构恰好是 `[4, 6, 6, 9]`');
  L.push('- [x] 每批恰好 4 题；难度分布恰好 4 / 8 / 4');
  L.push('- [x] 每题子条件分值之和 = 该题满分，且每个子分是正整数');
  L.push('- [x] 0–100 之间每一个整数分都可达（子条件分值组合的完备性枚举）');
  L.push('');
  L.push('判分时还有一层运行期校验：每道题 `grade()` 返回的条件必须与 `publicCriteria` 一一对应、分值一致，');
  L.push('少一条、多一条、分值对不上，判分器立即抛错 —— 不会静默按错的口径给分。');
  L.push('');
  L.push('---');
  L.push('');
  L.push('## 4. 怎么核对这份文档');
  L.push('');
  L.push('```bash');
  L.push('# 重新生成并覆盖');
  L.push('node docs/build/build-scoring.mjs');
  L.push('');
  L.push('# 只比对不写盘；不一致则退出码 1（CI 用这个）');
  L.push('node docs/build/build-scoring.mjs --check');
  L.push('```');
  L.push('');
  L.push('也可以在运行时直接看：`node scripts/cli.mjs start` 打印的每道题后面都跟着「评分条件（公开）」清单，');
  L.push('那一段与这份文件同源。');
  L.push('');
  L.push('---');
  L.push('');
  L.push('## 5. 改题时的规矩');
  L.push('');
  L.push('见 [CONTRIBUTING.md](../CONTRIBUTING.md)。要点：');
  L.push('');
  L.push('- 改条件文本 = 改判分口径，必须同时升 `graderVersion`，并说明旧成绩不可比。');
  L.push('- 改题面数据范围 = 改题库，必须升 `examVersion`。');
  L.push('- 新增题目必须同时提 oracle 与 ≥5 个正例、≥5 个反例。');
  L.push('- **不允许**为了让某个模型的分数变好看而调整条件或分值。');
  L.push('');

  return L.join('\n');
}

const body = render();
const check = process.argv.includes('--check');

if (check) {
  let prev = '';
  try { prev = await readFile(OUT, 'utf8'); } catch { /* 不存在即视为不一致 */ }
  if (prev !== body) {
    console.error('✘ docs/SCORING.md 与源码不一致，请运行：node docs/build/build-scoring.mjs');
    process.exit(1);
  }
  console.log('✔ docs/SCORING.md 与 src/exam 的 publicCriteria 完全一致');
} else {
  await writeFile(OUT, body, 'utf8');
  console.log(`✔ 已生成 docs/SCORING.md（${ITEMS.length} 题 / ${ITEMS.reduce((s, i) => s + criteriaOf(i).length, 0)} 条条件）`);
}
