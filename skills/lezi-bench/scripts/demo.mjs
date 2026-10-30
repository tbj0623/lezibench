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
import { fileURLToPath } from 'node:url';
import { isMain } from '../src/is-main.mjs';
import path from 'node:path';
import os from 'node:os';
import { mkdir, rm } from 'node:fs/promises';
import { startRun, submitBatch, buildReport, writeReport } from '../src/runner.mjs';
import { perfectAnswers } from './oracle-answers.mjs';
import { gradeItem } from '../src/grading/grade.mjs';
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

/**
 * 生成演示用答案。
 *
 * 设计原则：**不硬编码任何一道题的字段形状**。
 * 「标准答案」直接取 oracle-answers 的 perfectAnswers（随题目实现同步维护），
 * 再用通用降级逻辑制造「部分正确 / 全错」的效果。
 *
 * 为什么值得这样改：原实现对每道题各写死一次答案字段，
 * 题目一改（R03 从 3 种餐盒变成 6 种模块）演示报告就立刻崩成
 * UNPARSEABLE → 整场 PARTIAL → 段位 null，而测试完全没覆盖这条路径。
 */
function leafPaths(node, prefix = [], out = []) {
  if (Array.isArray(node)) {
    if (node.length === 0) out.push(prefix);
    else node.forEach((v, i) => leafPaths(v, [...prefix, i], out));
    return out;
  }
  if (node && typeof node === 'object') {
    const keys = Object.keys(node);
    if (keys.length === 0) out.push(prefix);
    else for (const k of keys) leafPaths(node[k], [...prefix, k], out);
    return out;
  }
  out.push(prefix);
  return out;
}

/** 把一个标量改成「结构合法但值错」的值 */
function badScalar(v) {
  if (typeof v === 'number') return v + 1;
  if (typeof v === 'boolean') return !v;
  if (typeof v === 'string') {
    if (/^[A-Z]$/.test(v)) return v === 'A' ? 'B' : 'A';
    if (/^\d+$/.test(v)) return String(Number(v) + 1);
    return '错误值';
  }
  return v;
}

function cloneWithCorruptions(answer, indices) {
  const clone = JSON.parse(JSON.stringify(answer));
  const paths = leafPaths(answer);
  for (const idx of indices) {
    const path = paths[idx];
    if (!path || path.length === 0) continue;
    let node = clone;
    for (let i = 0; i < path.length - 1; i++) node = node[path[i]];
    if (node === undefined || node === null) continue;
    const last = path[path.length - 1];
    node[last] = badScalar(node[last]);
  }
  return clone;
}

function makeDemoAnswer(item, mode, seed) {
  const correct = perfectAnswers(seed)[item.id];
  if (mode === 'correct') return correct;

  const internal = instantiateInternal(item, seed);
  const paths = leafPaths(correct);
  const score = (ans) => gradeItem(internal, ans, { seed }).awarded;

  if (mode === 'wrong') {
    const all = paths.map((_, i) => i);
    const cand = cloneWithCorruptions(correct, all);
    if (score(cand) === 0) return cand;
    for (let i = 0; i < paths.length; i++) {
      const c = cloneWithCorruptions(correct, [i]);
      if (score(c) === 0) return c;
    }
    return cand;
  }

  // partial：制造一个「真的掉分但没归零」的答案
  for (let i = 0; i < paths.length; i++) {
    const cand = cloneWithCorruptions(correct, [i]);
    const got = score(cand);
    if (got > 0 && got < item.points) return cand;
  }
  return cloneWithCorruptions(correct, paths.map((_, i) => i));
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
  const outDir = values.out ? path.resolve(values.out) : path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'website', 'assets');
  const { htmlPath, jsonPath, txtPath, report } = await generateDemo(outDir);
  console.log('⚠️  这是一份 DEMO 演示数据，不是任何真实模型的成绩。');
  console.log(`   总分 ${report.summary.total}/100　段位 ${report.summary.level}`);
  console.log(`   HTML：${htmlPath}`);
  console.log(`   JSON：${jsonPath}`);
  console.log(`   摘要：${txtPath}`);
}
