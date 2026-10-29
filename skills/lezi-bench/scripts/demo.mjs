#!/usr/bin/env node
/**
 * 生成一份**明确标注 DEMO** 的演示报告，用于网站 / README / 文档。
 *
 * 铁律：这是演示数据，不是任何真实模型的成绩。
 *  - 报告里带 DEMO 水印，命令行输出也会提醒
 *  - 分数来自一份刻意设计的「部分正确」答卷，不是满分假图
 *  - 绝不放进 runs/ 里冒充真实运行
 *
 * 用法：node scripts/demo.mjs [--out <dir>]
 */
import { parseArgs } from 'node:util';
import { isMain } from '../src/is-main.mjs';
import path from 'node:path';
import os from 'node:os';
import { mkdir, rm } from 'node:fs/promises';
import { startRun, submitBatch, buildReport, writeReport } from '../src/runner.mjs';
import { renderHtml, renderSummaryText } from '../src/report/html.mjs';
import { itemsForBatch, BATCHES, ITEMS } from '../src/exam/manifest.mjs';
import { instantiateInternal } from '../src/exam/manifest.mjs';
import { atomicWrite, atomicWriteJson } from '../src/storage/store.mjs';

/**
 * 刻意构造一份「看起来像真 Agent 作答」的答卷：
 *  - 基础题基本对，标准题错一两处，挑战题明显薄弱
 *  - 模拟真实的能力分布，而不是均匀的 0 或 100
 */
const DEMO_PLAN = {
  I01: 'correct',      // 4
  R01: 'correct',      // 4
  D01: 'correct',      // 4
  C01: 'correct',      // 4
  I02: 'partial',      // 漏一个例外
  R02: 'correct',      // 6
  D02: 'correct',      // 6
  C02: 'correct',      // 6
  I03: 'wrong',        // 0
  R03: 'partial',      // 满足约束但没到最低价
  D03: 'correct',      // 6
  C03: 'partial',      // 四笔里错一笔
  I04: 'partial',      // 状态对、负责人错
  R04: 'wrong',        // 0
  D04: 'partial',      // 等级对但统计错
  C04: 'partial',      // 根因对、金额错
};

function makeDemoAnswer(item, mode, seed) {
  const internal = instantiateInternal(item, seed);
  const o = item.oracle(internal.facts);
  const correct = correctAnswerFor(item.id, o);
  if (mode === 'correct') return correct;
  if (mode === 'wrong') return wrongAnswerFor(item.id, o, internal);
  return partialAnswerFor(item.id, o, correct, internal);
}

function correctAnswerFor(id, o) {
  switch (id) {
    case 'I01': return { deadline: `${o.day}${o.text}`, budgetAttached: o.budgetAttached };
    case 'I02': return { selected: o.selected, rejected: o.rejected };
    case 'I03': return { rule: o.rule, decision: o.decision, escalate: o.escalate };
    case 'I04': return { status: o.status, owner: o.owner, deadline: o.deadline };
    case 'R01': return { subtotal: o.subtotal, total: o.total };
    case 'R02': { const order = o.validOrders[0]; return { order, first: order[0], last: order[order.length - 1] }; }
    case 'R03': return { veg: o.best.veg, chicken: o.best.chicken, beef: o.best.beef };
    case 'R04': return o.answer;
    case 'D01': return { list: o.unique };
    case 'D02': return { answer: 'C', reason: '甲项目的最终实际支出这一栏是空的，无法与乙比较。' };
    case 'D03': return { lossMaking: o.lossMaking, onlyInStore: o.onlyInStore, commonCount: o.commonCount };
    case 'D04': return { levels: o.levels, counts: o.counts };
    case 'C01': return { isCorrect: o.isCorrect, correctTotal: o.correctTotal };
    case 'C02': return { beforeVoid: o.beforeVoid, finalStock: o.finalStock };
    case 'C03': { const out = {}; for (const [k, v] of Object.entries(o.cases)) out[k] = { rule: v.rule, needManual: v.needManual }; return out; }
    case 'C04': return { rootCause: o.rootCause, fixedSubtotal: o.fixedSubtotal, fixedTotal: o.fixedTotal };
    default: throw new Error(id);
  }
}

function wrongAnswerFor(id, o, internal) {
  switch (id) {
    case 'I03': return { rule: 'R1', decision: '转人工', escalate: true };
    case 'R04': {
      // 一个看起来合理但错的座位表
      const names = internal.facts.names;
      return Object.fromEntries(names.map((n, i) => [n, { position: i + 1, color: ['红', '蓝', '绿', '黄'][(i + 1) % 4] }]));
    }
    default: return {};
  }
}

function partialAnswerFor(id, o, correct, internal) {
  switch (id) {
    case 'I02': {
      // 漏掉那个「例外」商品
      const missing = o.selected[o.selected.length - 1];
      return { selected: o.selected.filter((x) => x !== missing), rejected: o.rejected };
    }
    case 'R03': {
      // 满足下限但不是最低价：在最优解上多加一份素盒
      return { veg: o.best.veg + 1, chicken: o.best.chicken, beef: o.best.beef };
    }
    case 'C03': {
      const out = {};
      for (const [k, v] of Object.entries(o.cases)) out[k] = { rule: v.rule, needManual: v.needManual };
      out.a3 = { rule: '旧', needManual: false }; // 错一笔
      return out;
    }
    case 'I04': {
      // 状态和截止时间对，负责人没跟上最后一条更新
      const steps = internal.facts.steps;
      return { status: o.status, owner: internal.facts.init.owner, deadline: o.deadline };
    }
    case 'D04': {
      // 等级判对，但统计数错
      return { levels: o.levels, counts: { gold: o.counts.gold, silver: o.counts.silver + 1, normal: o.counts.normal - 1 } };
    }
    case 'C04': {
      // 根因对，但金额没乘折扣
      return { rootCause: o.rootCause, fixedSubtotal: o.fixedSubtotal, fixedTotal: o.fixedSubtotal };
    }
    default: return correct;
  }
}

export async function generateDemo(outDir) {
  const seed = 'lezi-demo-2026';
  const tmpRoot = path.join(os.tmpdir(), `lezi-demo-${Date.now()}`);
  try {
    const { runId } = await startRun({ root: tmpRoot, seed, demo: true });
    for (const b of BATCHES) {
      const items = itemsForBatch(b);
      const answers = {};
      for (const it of items) answers[it.id] = makeDemoAnswer(it, DEMO_PLAN[it.id] || 'correct', seed);
      await submitBatch({ root: tmpRoot, runId, batch: b, answers });
    }
    const report = await buildReport({ root: tmpRoot, runId });
    report.demo = true;

    await mkdir(outDir, { recursive: true });
    const htmlPath = path.join(outDir, 'demo-report.html');
    const jsonPath = path.join(outDir, 'demo-report.json');
    const txtPath = path.join(outDir, 'demo-summary.txt');
    await atomicWrite(htmlPath, renderHtml(report));
    await atomicWriteJson(jsonPath, report);
    await atomicWrite(txtPath, `${renderSummaryText(report)}\n`);
    return { htmlPath, jsonPath, txtPath, report };
  } finally {
    await rm(tmpRoot, { recursive: true, force: true }).catch(() => {});
  }
}

if (isMain(import.meta.url)) {
  const { values } = parseArgs({ options: { out: { type: 'string' } }, allowPositionals: true });
  const outDir = values.out ? path.resolve(values.out) : path.join(import.meta.dirname, '..', 'website', 'assets');
  const { htmlPath, jsonPath, txtPath, report } = await generateDemo(outDir);
  console.log('⚠️  这是一份 DEMO 演示数据，不是任何真实模型的成绩。');
  console.log(`   总分 ${report.summary.total}/100　段位 ${report.summary.level}`);
  console.log(`   HTML：${htmlPath}`);
  console.log(`   JSON：${jsonPath}`);
  console.log(`   摘要：${txtPath}`);
}
