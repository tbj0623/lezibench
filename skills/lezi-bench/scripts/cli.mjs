#!/usr/bin/env node
/**
 * lezi-bench CLI
 *   doctor | start | submit | status | resume | report | regrade | list | version
 * 任何参数错误都退出码 2，运行/环境错误退出码 1，成功 0。
 */
import { parseArgs } from 'node:util';
import { isMain } from '../src/is-main.mjs';
import process from 'node:process';
import {
  doctor, startRun, submitBatch, statusRun, buildReport, writeReport, regradeRun,
  readAnswersFile, reportFromState, loadState, summarizeState,
} from '../src/runner.mjs';
import { renderSummaryText, renderHtml } from '../src/report/html.mjs';
import { resolveDataRoot, runDir } from '../src/storage/store.mjs';
import { EXAM_VERSION, GRADER_VERSION } from '../src/exam/manifest.mjs';
import { readdir } from 'node:fs/promises';
import path from 'node:path';

const HELP = `乐子跑分 LeziBench v${EXAM_VERSION} — 本地、可解释的 Agent 能力自测

用法：
  node scripts/cli.mjs doctor
  node scripts/cli.mjs start --mode standard [--seed 1234] [--json]
  node scripts/cli.mjs submit --run RUN_ID --batch 1 --answers-file answers.json [--json]
                                [--allow-missing]  默认缺答会阻断，确实要按缺答 0 分提交才加
  node scripts/cli.mjs status --run RUN_ID [--json]
  node scripts/cli.mjs resume --run RUN_ID [--json]
  node scripts/cli.mjs report --run RUN_ID [--format html|json|summary] [--out PATH] [--json]
  node scripts/cli.mjs regrade --run RUN_ID [--grader VERSION] [--json]
  node scripts/cli.mjs list
  node scripts/cli.mjs version

通用参数：
  --root <dir>   指定数据目录（默认按平台自动选择，见下）
  --json         输出机器可读 JSON（默认输出人类可读文本）

数据目录（可用环境变量 LEZIBENCH_HOME 覆盖）：
  Windows  %LOCALAPPDATA%\\LeziBench
  macOS    ~/Library/Application Support/LeziBench
  Linux    $XDG_DATA_HOME/lezibench 或 ~/.local/share/lezibench
`;

/** 参数/用法错误：退出码 2，与「运行失败」区分开，便于脚本判断 */
class UsageError extends Error {}

function fail(msg, code = 1) {
  process.stderr.write(`错误：${msg}\n`);
  process.exit(code);
}

function out(text) {
  process.stdout.write(`${text}\n`);
}

function jsonOut(obj) {
  out(JSON.stringify(obj, null, 2));
}

export async function main(argv = process.argv.slice(2)) {
  const cmd = argv[0];
  if (!cmd || cmd === 'help' || cmd === '--help' || cmd === '-h') {
    out(HELP);
    return 0;
  }
  let parsed;
  try {
    parsed = parseArgs({
      args: argv.slice(1),
      options: {
        run: { type: 'string' },
        batch: { type: 'string' },
        'answers-file': { type: 'string' },
        mode: { type: 'string' },
        seed: { type: 'string' },
        format: { type: 'string' },
        out: { type: 'string' },
        'allow-missing': { type: 'boolean', default: false },
        grader: { type: 'string' },
        root: { type: 'string' },
        json: { type: 'boolean', default: false },
      },
      allowPositionals: true,
    });
  } catch (err) {
    fail(`${err.message}\n\n${HELP}`, 2);
  }
  const o = parsed.values;
  const ctx = { root: o.root || resolveDataRoot() };

  try {
    switch (cmd) {
      case 'version': {
        jsonOut({ examVersion: EXAM_VERSION, graderVersion: GRADER_VERSION, cli: 'lezi-bench', node: process.version });
        return 0;
      }
      case 'list': {
        const dir = path.join(ctx.root, 'runs');
        let names = [];
        try { names = (await readdir(dir, { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name); } catch { names = []; }
        const rows = [];
        for (const n of names.sort().reverse()) {
          try {
            const { state } = await loadState(ctx.root, n);
            rows.push(summarizeState(state));
          } catch { /* 跳过损坏的运行 */ }
        }
        if (o.json) { jsonOut({ dataRoot: ctx.root, runs: rows }); return 0; }
        if (rows.length === 0) { out(`暂无历史运行（数据目录：${ctx.root}）`); return 0; }
        out(`历史运行（数据目录：${ctx.root}）`);
        for (const r of rows) {
          out(`  ${r.runId}  ${r.status.padEnd(12)} ${r.progress.padEnd(10)} 已得 ${String(r.totalScoreSoFar).padStart(3)} 分  ${r.updatedAt}`);
        }
        return 0;
      }
      case 'doctor': {
        const res = await doctor(ctx);
        if (o.json) { jsonOut(res); return res.ok ? 0 : 1; }
        out(`LeziBench 环境自检（数据目录：${res.dataRoot}）`);
        for (const c of res.checks) out(`  ${c.ok ? '✔' : '✘'} ${c.name}：${c.detail}`);
        out('');
        out(res.ok ? '全部通过，可以开考。' : '存在未通过项，请先修复再开考。');
        return res.ok ? 0 : 1;
      }
      case 'start': {
        const res = await startRun({ root: ctx.root, mode: o.mode || 'standard', seed: o.seed });
        if (o.json) { jsonOut({ runId: res.runId, dataRoot: res.root, ...res.batch }); return 0; }
        out(renderBatch(res.batch));
        return 0;
      }
      case 'submit': {
        requireOpt(o, 'run');
        requireOpt(o, 'batch');
        requireOpt(o, 'answers-file');
        const answers = await readAnswersFile(o['answers-file']);
        const res = await submitBatch({ root: ctx.root, runId: o.run, batch: Number(o.batch), answers, allowMissing: o['allow-missing'] === true });
        if (o.json) { jsonOut(res); return 0; }
        if (res.idempotent) out(`第 ${res.batch} 批此前已用相同答案提交过，本次按幂等处理，未重复计分。`);
        out(`第 ${res.batch} 批判分完成：本批 ${res.batchAwarded}/${res.batchMax} 分`);
        for (const g of res.graded) {
          out(`  ${g.id}  ${String(g.awarded).padStart(2)}/${g.maxPoints}  ${g.gradingStatus}${g.failedChecks.length ? '' : ''}`);
          for (const f of g.failedChecks) out(`      ✘ ${f.id} ${f.reason}`);
        }
        if (res.missingIds.length) out(`  未作答：${res.missingIds.join(', ')}（按缺答 0 分处理，可在报告中查看）`);
        out('');
        if (res.finished) {
          const report = await buildReport({ root: ctx.root, runId: o.run });
          out(renderSummaryText(report));
          out('');
          out(`下一步：node scripts/cli.mjs report --run ${o.run} --format html`);
        } else {
          out(renderBatch(res.next));
        }
        return 0;
      }
      case 'status': {
        requireOpt(o, 'run');
        const s = await statusRun({ root: ctx.root, runId: o.run });
        if (o.json) { jsonOut(s); return 0; }
        out(`运行 ${s.runId}`);
        out(`  状态：${s.status}　进度：${s.progress}　已得：${s.totalScoreSoFar}/100`);
        out(`  已完成批次：${s.completedBatches.join(', ') || '无'}　下一批：${s.nextBatch ?? '无'}`);
        if (s.pendingReview.length) out(`  待复核：${s.pendingReview.join(', ')}`);
        return 0;
      }
      case 'resume': {
        requireOpt(o, 'run');
        const { state } = await loadState(ctx.root, o.run);
        const s = summarizeState(state);
        if (o.json) { jsonOut(s); return 0; }
        out(`继续运行 ${s.runId}（已完成 ${s.progress}）`);
        if (!s.nextBatch) {
          out('全部批次已完成，可直接生成报告：');
          out(`  node scripts/cli.mjs report --run ${s.runId}`);
          return 0;
        }
        const { instantiate, itemsForBatch } = await import('../src/exam/manifest.mjs');
        // instantiate() 返回的字段名是 publicCriteria，而 renderBatch() 读的是 criteria，
        // 直接传会崩（真实 bug：resume 报 "it.criteria is not iterable"）。这里统一映射。
        const items = itemsForBatch(s.nextBatch).map((it) => {
          const v = instantiate(it, state.seed);
          return { ...v, criteria: v.publicCriteria };
        });
        out(renderBatch({
          runId: state.runId,
          batch: s.nextBatch,
          totalBatches: 4,
          answeredCount: state.gradedItems.length,
          totalQuestions: 16,
          progress: `第 ${s.nextBatch}/4 批 · 已完成 ${state.gradedItems.length}/16 题`,
          items,
        }));
        return 0;
      }
      case 'report': {
        requireOpt(o, 'run');
        const format = o.format || 'html';
        const res = await writeReport({ root: ctx.root, runId: o.run, format, out: o.out });
        if (o.json) { jsonOut({ path: res.path, format: res.format, summary: res.report.summary }); return 0; }
        if (format === 'summary') {
          out(renderSummaryText(res.report));
          out('');
          out(`已保存：${res.path}`);
        } else {
          out(renderSummaryText(res.report));
          out('');
          out(`报告已生成：${res.path}`);
          out(format === 'html' ? '（自包含 HTML，双击即可在浏览器打开，无需联网）' : '（完整 JSON，含逐题证据）');
        }
        return 0;
      }
      case 'regrade': {
        requireOpt(o, 'run');
        const res = await regradeRun({ root: ctx.root, runId: o.run, grader: o.grader });
        if (o.json) { jsonOut(res); return 0; }
        out(`重判完成：grader v${res.graderVersion}　总分 ${res.beforeTotal} → ${res.afterTotal}`);
        if (res.diffs.length === 0) out('  没有任何题目分数变化。');
        for (const d of res.diffs) out(`  ${d.id}: ${d.before} → ${d.after}`);
        out(`  旧判分轨迹已归档：${res.archive}`);
        out(`  请重新生成报告：node scripts/cli.mjs report --run ${o.run}`);
        return 0;
      }
      case 'demo': {
        // 便于文档/网站生成 DEMO 报告
        out('请使用 scripts/demo.mjs 生成演示报告。');
        return 0;
      }
      default:
        fail(`未知命令：${cmd}\n\n${HELP}`, 2);
    }
  } catch (err) {
    if (err instanceof UsageError) fail(`${err.message}

${HELP}`, 2);
    fail(err.message || String(err), 1);
  }
  return 0;
}

function requireOpt(o, name) {
  if (!o[name]) throw new UsageError(`缺少必需参数 --${name}`);
}

function renderBatch(batch) {
  const lines = [];
  lines.push(`乐子跑分 LeziBench · 标准局`);
  lines.push(`${batch.progress}　（运行编号 ${batch.runId}）`);
  lines.push('');
  for (const it of batch.items) {
    lines.push(`────────── ${it.id} · ${it.title}（${it.points} 分 · ${it.dimensionLabel || it.dimension}）──────────`);
    lines.push(it.prompt);
    lines.push('');
    lines.push('评分条件（公开）：');
    for (const c of it.criteria) lines.push(`  [${c.id} · ${c.points}分] ${c.text}`);
    lines.push('');
  }
  lines.push('本批提交方式：把 4 道题的答案写进一个 JSON 文件，然后运行：');
  lines.push(`  node scripts/cli.mjs submit --run ${batch.runId} --batch ${batch.batch} --answers-file answers.json`);
  lines.push('答案文件格式：');
  lines.push(JSON.stringify({ answers: Object.fromEntries(batch.items.map((i) => [i.id, '<答案>'])) }, null, 2));
  return lines.join('\n');
}

// 直接执行时
if (isMain(import.meta.url)) {
  const code = await main();
  process.exit(code ?? 0);
}
