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
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
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
  const reportHtmlPath = path.join(assets, 'demo-report.html');
  await writeReport({ root, runId, format: 'html', out: reportHtmlPath });
  await writeReport({ root, runId, format: 'json', out: path.join(assets, 'demo-report.json') });
  await writeReport({ root, runId, format: 'summary', out: path.join(assets, 'demo-summary.txt') });

  // 站点是深色为主；报告的模板默认跟随系统配色，嵌进深色页面里如果用户系统是浅色就会「白框套黑页」。
  // 这是站点里的展示副本，所以钉死成深色 —— 但只改配色块，不动报告内容与结构。
  // 注意：用户自己跑出来的本地报告不受影响（仍跟随系统）。
  let reportHtml = await readFile(reportHtmlPath, 'utf8');
  reportHtml = reportHtml.replace(
    '@media (prefers-color-scheme: light){',
    '@media (prefers-color-scheme: light) and (min-width: 0px) and (max-width: 0px){',
  );
  await writeFile(reportHtmlPath, reportHtml, 'utf8');

  const rep = await buildReport({ root, runId });
  if (rep.demo !== true) throw new Error('DEMO 报告没有带上 demo 标记');
  const html = await readFile(reportHtmlPath, 'utf8');
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

/* ---------- 3. 首页成绩卡（数字全部取自真实 DEMO 运行） ---------- */
function renderScoreCard(demo) {
  const esc2 = esc;
  const dims = demo.dims
    .map((d) => {
      const pct = d.max ? Math.round((d.awarded / d.max) * 100) : 0;
      return `                <div class="dim">
                  <span class="dim-label">${esc2(d.label)}</span>
                  <span class="dim-track"><span class="dim-fill" style="width:${pct}%"></span></span>
                  <span class="dim-val">${d.awarded}<i>/${d.max}</i></span>
                </div>`;
    })
    .join('\n');

  // 卡上只放前 3 条扣分依据，其余用计数带过 —— 一屏能读，细节留给 demo.html
  const shown = demo.fails.slice(0, 3);
  const checks = shown
    .map(
      (f) => `                <div class="rcheck">
                  <span class="cid">${esc2(f.crit)}</span>
                  <span class="txt"><b>−${f.pts} 分</b>　${esc2(f.reason)}</span>
                </div>`,
    )
    .join('\n');
  const rest = demo.fails.length - shown.length;
  const restText = rest > 0 ? `另有 ${rest} 条扣分依据` : '全部条件通过';

  return `          <figure class="report report--demo" aria-labelledby="card-cap">
            <div class="report-top">
              <span class="seal">DEMO · 演示数据</span>
              <span>标准局 / STANDARD</span>
              <span class="rid">${esc2(demo.runId)}</span>
            </div>

            <div class="report-body">
              <div class="report-score">
                <span class="num">${demo.total}</span>
                <span class="of">/ 100</span>
                <span class="level">${esc2(demo.level)}</span>
              </div>

              <div class="dims">
${dims}
              </div>

              <div class="report-checks">
${checks}
              </div>

              <div class="report-foot">
                <span>exam ${esc2(demo.examVersion)}</span>
                <span>grader ${esc2(demo.graderVersion)}</span>
                <span>${restText}</span>
                <span class="spacer">本地规则核验</span>
              </div>
            </div>
          </figure>`;
}

async function injectScoreCard(demo) {
  const file = path.join(SITE, 'index.html');
  let html = await readFile(file, 'utf8');
  const START = '<!--SCORE-CARD:START-->';
  const END = '<!--SCORE-CARD:END-->';
  if (!html.includes(START) || !html.includes(END)) throw new Error('index.html 找不到 SCORE-CARD 标记');
  html = html.replace(new RegExp(`${START}[\\s\\S]*?${END}`), `${START}\n${renderScoreCard(demo)}\n          ${END}`);
  await writeFile(file, html, 'utf8');
  return { total: demo.total, level: demo.level, fails: demo.fails.length };
}

/* ---------- 4. demo.html 的「失败形态」讲解（只讲真实失败过的那几题） ---------- */
const ITEM_MECHANISM = {
  I01: '这道题考的是<strong>哪条通知最终有效</strong>，不是「有没有读到通知」：后发的通知覆盖先发的，这是条件文本写明的口径。两条条件（时间 / 附件）独立计分。',
  R01: '两条条件独立计分：算对原价拿 1 分，算错应付款再丢 3 分。不会因为「整体思路对」就给中间分。',
  R04: '三条条件都要求「全部正确」才给分：位置全对 3 分、颜色全对 3 分、配对全对 3 分。错一个人会同时丢掉后两项。',
  D02: '这题随机生成三种情形（A / B / C），不是固定答案。判分看三件事：选项对不对、理由是否引用了实际给出的数字、有没有把预算当成实际支出。',
  C02: '「撤回第 2 步的出库单」意味着把那笔出库<strong>加回来</strong>。C02.C2 专门检查「最终值 − 撤回前值」是否等于撤回数量，所以两步都算错时仍可能单独拿到这一分。',
  C03: '关键约束是「规则按<strong>提交时间</strong>适用，不按审批时间」。判分器把「规则版本」和「是否人工」拆成两条，再加一条专门盯第 2 笔的陷阱条件。',
  I02: '三条条件分别管「无遗漏」「无多余」「补集一致」，可以部分得分 —— 这正是原子条件的好处：错在哪一侧看得出来。',
  I03: '规则编号越小优先级越高、命中即停止；R5 的例外会覆盖 R1/R2。三个字段（rule / decision / escalate）各自独立计分。',
  I04: '第 4 条同时包含两项独立改动（状态 + 截止时间），两项都要生效。三个字段各自 3 分。',
  R02: '五步依赖图有多组合法顺序；判分只看「依赖是否全满足」「首末是否唯一」「first/last 是否与 order 自洽」。',
  R03: '三条条件：满足份数与蛋白质下限、不超各餐盒上限、总价等于穷举出的最低值。不可行方案不会因为「没超上限」白拿分。',
  D01: '去重 1 分（集合正确），排序 3 分（逐位一致）—— 两件事分开计分。',
  D03: '三项各 2 分，对应三个独立的数据核对动作：亏本 SKU、仅门店 SKU、共同数量。',
  D04: '三条条件：六人等级全对（3 分）、金/银人数正确（3 分）、普通人数正确且三项合计自洽（3 分）。',
  C01: '判定原等式错误 1 分，给出正确的和 3 分。',
  C04: '三条各 3 分：错误根源、修复后小计、修复后应付（已乘折扣）。',
};

function renderWhatFails(demo) {
  if (!demo.lost.length) {
    return `      <div class="evidence">
        <article class="ev"><div><h3>这一局全部满分</h3><p class="claim">没有失分项可讲。</p></div><p class="detail">重新运行本脚本会生成新的演示答卷。</p></article>
      </div>`;
  }
  const cards = demo.lost.map((it) => {
    const why = ITEM_MECHANISM[it.id] || '';
    const fails = demo.fails.filter((f) => f.item === it.id);
    const failLines = fails.map((f) => `<code>${esc(f.crit)} · ${f.pts} 分</code>　${esc(f.reason)}`).join('<br>');
    return `        <article class="ev">
          <div>
            <h3>${esc(it.id)} · ${esc(it.title)}</h3>
            <p class="claim">得 <strong>${it.awarded}/${it.max}</strong>，有 ${fails.length} 条条件未通过。</p>
          </div>
          <p class="detail">
            ${failLines}
            <br><span class="muted">${why}</span>
          </p>
        </article>`;
  }).join('\n\n');
  return `      <div class="evidence">

${cards}

      </div>`;
}

async function injectWhatFails(demo) {
  const file = path.join(SITE, 'demo.html');
  let html = await readFile(file, 'utf8');
  const START = '<!--WHAT-FAILS:START-->';
  const END = '<!--WHAT-FAILS:END-->';
  if (!html.includes(START) || !html.includes(END)) throw new Error('demo.html 找不到 WHAT-FAILS 标记');
  html = html.replace(
    /六处失分分别对应六种不同的判分语义，正好可以把「扣分是怎么来的」讲清楚：/,
    `这一局共失分 <strong>${demo.fails.length}</strong> 次，分布在 <strong>${demo.lost.length}</strong> 道题上 —— 正好可以把「扣分是怎么来的」讲清楚：`,
  );
  html = html.replace(new RegExp(`${START}[\\s\\S]*?${END}`), `${START}\n${renderWhatFails(demo)}\n      ${END}`);
  await writeFile(file, html, 'utf8');
  return { lost: demo.lost.length, fails: demo.fails.length };
}

/* ---------- 5. 版本号与指纹（散落在所有页面的脚注、表格、正文） ---------- */
async function injectMeta() {
  const { catalogFingerprint, SCORING_CONTRACT_VERSION } = await import('../../src/exam/manifest.mjs');
  const fp = catalogFingerprint();
  const versions = { exam: EXAM_VERSION, grader: GRADER_VERSION, contract: SCORING_CONTRACT_VERSION };
  const files = (await readdir(SITE)).filter((f) => f.endsWith('.html'));
  let touched = 0;
  for (const f of files) {
    const p = path.join(SITE, f);
    let html = await readFile(p, 'utf8');
    const before = html;
    html = html.replace(/<span data-meta="versions">[^<]*<\/span>/g, `<span>exam v${versions.exam} · grader v${versions.grader}</span>`);
    html = html.replace(/data-meta="exam">—<\/span>/g, `data-meta="exam">${versions.exam}</span>`);
    html = html.replace(/data-meta="grader">—<\/span>/g, `data-meta="grader">${versions.grader}</span>`);
    html = html.replace(/data-meta="contract">—<\/span>/g, `data-meta="contract">${versions.contract}</span>`);
    html = html.replace(/<td class="num" data-meta="exam">[^<]*<\/td>/g, `<td class="num">${versions.exam}</td>`);
    html = html.replace(/<td class="num" data-meta="grader">[^<]*<\/td>/g, `<td class="num">${versions.grader}</td>`);
    html = html.replace(/<td class="num" data-meta="contract">[^<]*<\/td>/g, `<td class="num">${versions.contract}</td>`);
    // 指纹：保留 data-fp 标记本身，这样脚本可以重复跑（幂等），也便于 CI 校验
    html = html.replace(/<code data-fp>[^<]*<\/code>/g, `<code data-fp>${fp.slice(0, 12)}…</code>`);
    if (html !== before) { await writeFile(p, html, 'utf8'); touched++; }
  }
  return { versions, fingerprint: fp, filesTouched: touched };
}

/* ---------- main ---------- */
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  const crit = await injectCriteria();
  const demo = await buildDemo();
  demo.examVersion = EXAM_VERSION;
  demo.graderVersion = GRADER_VERSION;
  const card = await injectScoreCard(demo);
  const whatFails = await injectWhatFails(demo);
  const meta = await injectMeta();
  const out = {
    examVersion: EXAM_VERSION,
    graderVersion: GRADER_VERSION,
    catalogFingerprint: meta.fingerprint,
    criteriaInjected: crit,
    scoreCard: card,
    whatFails,
    metaReplacedIn: meta.filesTouched,
    demo,
  };
  console.log(JSON.stringify(out, null, 2));
  // 落一份摘要，供 README / 首页核对数字时直接引用
  await writeFile(path.join(HERE, 'build-summary.json'), `${JSON.stringify(out, null, 2)}\n`, 'utf8');
}
