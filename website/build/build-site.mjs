#!/usr/bin/env node
/**
 * 把 website 里所有「必须与代码一致」的片段，从源码重新生成一遍。
 *
 * 目前做两件事：
 *   1. 从 src/exam/manifest.mjs 的 publicCriteria 生成 method.html 的逐题规则区块；
 *   2. 用真实判分器跑一局 DEMO，产出 assets/demo-report.{html,json} 与 demo-summary.txt。
 *
 * 为什么要脚本化：SCORING.md 和网站题库页一旦手抄就会漂移。
 * 源码改一个字，这里重跑一次就同步，顺手打印一份校验摘要。
 *
 * 用法：node website/build/build-site.mjs
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ITEMS, DIMENSIONS, criteriaOf, assertCatalogIntegrity, EXAM_VERSION, GRADER_VERSION } from '../../src/exam/manifest.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SITE = path.resolve(HERE, '..');
const REPO = path.resolve(SITE, '..');

const DIM_LABEL = Object.fromEntries(DIMENSIONS.map((d) => [d.key, d.label]));
const DIFF_LABEL = { easy: '基础', standard: '标准', challenge: '挑战' };
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/* ---------- 1. 逐题规则区块 ---------- */
export function renderCriteria() {
  assertCatalogIntegrity();
  let html = '';
  for (const dim of DIMENSIONS) {
    const items = ITEMS.filter((i) => i.dimension === dim.key);
    html += `\n        <div class="crit-group" id="crit-${dim.key}">\n`;
    html += `          <div class="crit-group-head">\n`;
    html += `            <h3>${esc(dim.label)} <span class="k">${dim.key.toUpperCase()}</span></h3>\n`;
    html += `            <span class="crit-group-sum">${items.length} 题 · ${dim.points} 分</span>\n`;
    html += `          </div>\n          <div class="items">\n`;
    for (const it of items) {
      const crit = criteriaOf(it);
      html += `            <article class="item">\n`;
      html += `              <div class="item-head">\n`;
      html += `                <span class="item-id">${it.id}</span>\n`;
      html += `                <span class="item-title">${esc(it.title)}</span>\n`;
      html += `                <span class="item-meta"><span>${DIFF_LABEL[it.difficulty]}</span><span>第 ${it.batch} 批</span><span class="p">${it.points} 分</span></span>\n`;
      html += `              </div>\n              <ul class="crit">\n`;
      for (const c of crit) {
        html += `                <li><span class="cid">${c.id}</span><span class="cp">${c.points} 分</span><span class="ct">${esc(c.text)}</span></li>\n`;
      }
      html += `              </ul>\n            </article>\n`;
    }
    html += `          </div>\n        </div>\n`;
  }
  return html.trim();
}

async function injectCriteria() {
  const file = path.join(SITE, 'method.html');
  let html = await readFile(file, 'utf8');
  const block = renderCriteria();
  const START = '<!--CRITERIA:START-->';
  const END = '<!--CRITERIA:END-->';
  const full = `${START}\n${block}\n        ${END}`;
  if (html.includes(START) && html.includes(END)) {
    html = html.replace(new RegExp(`${START}[\\s\\S]*?${END}`), full);
  } else if (html.includes('<!--CRITERIA-->')) {
    html = html.replace('<!--CRITERIA-->', full);
  } else {
    throw new Error('method.html 找不到 CRITERIA 标记');
  }
  await writeFile(file, html, 'utf8');
  const n = (html.match(/class="cid"/g) || []).length;
  const total = ITEMS.reduce((s, i) => s + criteriaOf(i).length, 0);
  if (n !== total) throw new Error(`逐题规则条数不符：页面 ${n} 条，代码 ${total} 条`);
  return { items: ITEMS.length, criteria: total };
}

/* ---------- 2. DEMO 报告 ---------- */
async function buildDemo() {
  const { startRun, submitBatch, writeReport, buildReport } = await import('../../src/runner.mjs');
  const { itemsForBatch, BATCHES } = await import('../../src/exam/manifest.mjs');
  const { perfectAnswers } = await import('../../scripts/oracle-answers.mjs');

  const os = await import('node:os');
  const root = path.join(os.tmpdir(), `lezi-site-demo-${process.pid}`);
  const seed = 'lezi-demo-2026';
  const good = perfectAnswers(seed);

  // 六处典型失分，分别覆盖：遗漏覆盖规则 / 忘记应用优惠 / 把预算当实际支出 /
  // 没理解「撤回」语义 / 一对一配错 / 新旧规则混用。全部是真实判分器算出来的。
  const ans = JSON.parse(JSON.stringify(good));
  ans.I01 = { deadline: good.I01.deadline, budgetAttached: true };
  ans.R01 = { subtotal: good.R01.subtotal, total: good.R01.subtotal };
  ans.D02 = { answer: 'A', reason: '甲项目预算比乙低，所以更省钱。' };
  ans.C02 = { beforeVoid: good.C02.beforeVoid, finalStock: good.C02.beforeVoid };
  ans.R04 = Object.fromEntries(
    Object.entries(good.R04).map(([k, v], i) => [k, { position: v.position, color: i === 0 ? '蓝' : v.color }]),
  );
  ans.C03 = JSON.parse(JSON.stringify(good.C03));
  ans.C03.a2 = { rule: '新', needManual: true };

  const { runId } = await startRun({ root, seed, demo: true });
  for (const b of BATCHES) {
    const payload = {};
    for (const it of itemsForBatch(b)) payload[it.id] = ans[it.id];
    await submitBatch({ root, runId, batch: b, answers: payload });
  }

  const assets = path.join(SITE, 'assets');
  await mkdir(assets, { recursive: true });
  await writeReport({ root, runId, format: 'html', out: path.join(assets, 'demo-report.html') });
  await writeReport({ root, runId, format: 'json', out: path.join(assets, 'demo-report.json') });
  await writeReport({ root, runId, format: 'summary', out: path.join(assets, 'demo-summary.txt') });

  const rep = await buildReport({ root, runId });
  if (rep.demo !== true) throw new Error('DEMO 报告没有带上 demo 标记');
  const html = await readFile(path.join(assets, 'demo-report.html'), 'utf8');
  if (!html.includes('DEMO') || !html.includes('演示数据')) throw new Error('DEMO 报告缺少醒目的演示水印');

  const fails = rep.items.flatMap((it) =>
    it.checks.filter((c) => !c.passed).map((c) => ({ item: it.id, crit: c.criterionId, pts: c.points, reason: c.reason })),
  );

  return {
    runId,
    seed,
    total: rep.summary.total,
    level: rep.summary.level,
    status: rep.summary.status,
    durationMs: rep.durationMs,
    dims: rep.summary.dimensions.map((d) => ({ key: d.key, label: d.label, awarded: d.awarded, max: d.max })),
    lost: rep.items.filter((i) => i.awarded < i.maxPoints).map((i) => ({ id: i.id, title: i.title, awarded: i.awarded, max: i.maxPoints })),
    fails,
  };
}

/* ---------- main ---------- */
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  const crit = await injectCriteria();
  const demo = await buildDemo();
  const out = {
    examVersion: EXAM_VERSION,
    graderVersion: GRADER_VERSION,
    criteriaInjected: crit,
    demo,
  };
  console.log(JSON.stringify(out, null, 2));
  // 落一份摘要，供 README / 首页核对数字时直接引用
  await writeFile(path.join(HERE, 'build-summary.json'), `${JSON.stringify(out, null, 2)}\n`, 'utf8');
}
