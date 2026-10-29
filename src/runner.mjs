/**
 * LeziBench 运行器：start / submit / status / resume / report / regrade / doctor
 *
 * 状态机：created → awaiting_batch_N → ... → completed
 * 每次 submit 都会：校验批次 → 判分 → 原子落盘 → 返回下一批或最终结果。
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  EXAM_VERSION, GRADER_VERSION, SCORING_CONTRACT_VERSION, BATCHES, ITEMS,
  assertCatalogIntegrity, catalogFingerprint, instantiate, instantiateInternal, itemsForBatch,
} from './exam/manifest.mjs';
import { gradeItem, summarize, STATUS } from './grading/grade.mjs';
import { sha256Hex } from './exam/rng.mjs';
import {
  resolveDataRoot, newRunId, runDir, atomicWriteJson, readJson, ensureDir, probeWritable, resolveOutputPath,
} from './storage/store.mjs';
import { renderHtml, renderSummaryText } from './report/html.mjs';

export const STATE_FILE = 'state.json';

/**
 * 运行环境描述。
 *
 * DEMO 模式下返回固定串：否则 Linux CI 与 Windows 本机会产出不同的
 * demo-report.*，`build-site.mjs --check` 在 CI 上必然失败（真实运行不受影响）。
 */
export const DEMO_FIXED_ENV = 'node (demo) · (demo)/(demo)';

export function environmentInfo(demo = false) {
  if (demo) return DEMO_FIXED_ENV;
  return `node ${process.version} · ${process.platform}/${process.arch}`;
}

/**
 * 固定时间戳（仅 DEMO 用）。
 *
 * 为什么需要：`website/build/build-site.mjs` 每次构建都会现场跑一局 DEMO 来生成
 * 演示报告。如果时间戳取真实墙钟，产出的 demo-report.* 每次都不同 →
 * 构建不幂等、git 永远 dirty、也没法用 --check 判断产物是否漂移。
 *
 * DEMO 报告本来就带 `demo: true` 标记，用固定时间戳不会让人误以为是真实运行。
 * 真实运行（非 demo）完全不受影响，仍然用墙钟。
 */
const DEMO_FIXED_ISO = '2026-01-01T00:00:00.000Z';

function nowIso(demo = false) {
  return demo ? DEMO_FIXED_ISO : new Date().toISOString();
}

function runPaths(root, runId) {
  const dir = runDir(root, runId);
  return {
    dir,
    state: path.join(dir, STATE_FILE),
    answers: path.join(dir, 'answers'),
    reports: path.join(dir, 'reports'),
    evidence: path.join(dir, 'evidence'),
  };
}

/** 只把「给答题方看」的题目字段暴露出去，facts/oracle 绝不外泄 */
function publicBatchView(state, batch) {
  const instanceSeed = state.seed;
  const items = itemsForBatch(batch).map((it) => instantiate(it, instanceSeed));
  return {
    runId: state.runId,
    batch,
    totalBatches: BATCHES.length,
    answeredCount: state.gradedItems.length,
    totalQuestions: ITEMS.length,
    progress: `第 ${batch}/${BATCHES.length} 批 · 已完成 ${state.gradedItems.length}/${ITEMS.length} 题`,
    items: items.map((it) => ({
      id: it.id,
      title: it.title,
      dimension: it.dimensionLabel,
      difficulty: it.difficulty,
      points: it.points,
      prompt: it.prompt,
      answerStyle: it.answerStyle,
      criteria: it.publicCriteria.map((c) => ({ id: c.id, points: c.points, text: c.text })),
    })),
    submitFormat: {
      runId: state.runId,
      batch,
      answers: Object.fromEntries(items.map((it) => [it.id, '<你的答案：JSON 对象或纯文本>'])),
    },
    notes: [
      '把本批 4 道题全部作答后一次性提交；answers 的键是题目 ID。',
      '每题答案可以是 JSON 对象，也可以是 JSON 字符串；系统会做等价归一化。',
      '不要输出思考过程以外的其他内容到 answers 里，也不需要上传任何文件。',
    ],
  };
}

/** 创建一次新的运行 */
export async function startRun(opts = {}) {
  assertCatalogIntegrity();
  const root = opts.root || resolveDataRoot();
  const mode = opts.mode || 'standard';
  if (mode !== 'standard') throw new Error(`暂不支持的模式：${mode}（当前只有 standard）`);
  const seed = String(opts.seed ?? Date.now()).slice(0, 64);
  const runId = opts.runId || newRunId();
  const paths = runPaths(root, runId);
  await ensureDir(paths.dir);
  await ensureDir(paths.answers);
  await ensureDir(paths.reports);
  await ensureDir(paths.evidence);

  const state = {
    schema: 'lezibench/run@1',
    runId,
    mode,
    seed,
    examVersion: EXAM_VERSION,
    graderVersion: GRADER_VERSION,
    contractVersion: SCORING_CONTRACT_VERSION,
    catalogFingerprint: catalogFingerprint(),
    createdAt: nowIso(opts.demo === true),
    updatedAt: nowIso(opts.demo === true),
    status: 'in_progress',
    currentBatch: 1,
    gradedItems: [],
    batches: {},
    environment: environmentInfo(opts.demo === true),
    demo: opts.demo === true,
  };
  await atomicWriteJson(paths.state, state);
  return { runId, root, state, batch: publicBatchView(state, 1) };
}

export async function loadState(root, runId) {
  const paths = runPaths(root, runId);
  let state;
  try {
    state = await readJson(paths.state, null);
  } catch (err) {
    // 把底层「文件不存在」翻译成用户能理解的话，而不是把 ENOENT 路径糊到脸上
    throw new Error(`找不到运行记录：${runId}（数据目录 ${root}）`);
  }
  if (!state) throw new Error(`找不到运行记录：${runId}（数据目录 ${root}）`);
  if (state.examVersion !== EXAM_VERSION) {
    throw new Error(`本次运行使用 exam v${state.examVersion}，当前安装的是 v${EXAM_VERSION}；跨版本不能继续，请重新 start。`);
  }
  return { state, paths };
}

export async function statusRun(opts = {}) {
  const root = opts.root || resolveDataRoot();
  const { state } = await loadState(root, opts.runId);
  return summarizeState(state);
}

export function summarizeState(state) {
  const done = state.gradedItems.length;
  const nextBatch = BATCHES.find((b) => !state.batches[b] || state.batches[b].status !== 'graded');
  return {
    runId: state.runId,
    status: state.status,
    progress: `${done}/${ITEMS.length} 题`,
    completedBatches: BATCHES.filter((b) => state.batches[b]?.status === 'graded'),
    nextBatch: nextBatch || null,
    totalScoreSoFar: state.gradedItems.reduce((s, it) => s + it.awarded, 0),
    pendingReview: state.gradedItems.filter((it) => ['UNPARSEABLE', 'SCORER_ERROR'].includes(it.gradingStatus)).map((it) => it.id),
    seed: state.seed,
    examVersion: state.examVersion,
    graderVersion: state.graderVersion,
    createdAt: state.createdAt,
    updatedAt: state.updatedAt,
  };
}

/** 读取答案文件：支持 {"answers":{...}} 或直接 {...} */
export async function readAnswersFile(file) {
  const abs = path.resolve(file);
  let txt;
  try {
    txt = await readFile(abs, 'utf8');
  } catch (err) {
    throw new Error(`读不到答案文件 ${abs}：${err.code || err.message}`);
  }
  if (txt.length > 256 * 1024) throw new Error(`答案文件过大（${txt.length} 字节，上限 256KB）`);
  let data;
  try {
    data = JSON.parse(txt.replace(/^\uFEFF/, ''));
  } catch (err) {
    throw new Error(`答案文件不是合法 JSON：${err.message}`);
  }
  const answers = data && typeof data === 'object' && data.answers && typeof data.answers === 'object' ? data.answers : data;
  if (!answers || typeof answers !== 'object' || Array.isArray(answers)) throw new Error('答案文件必须是一个对象，或含 answers 字段的对象');
  return answers;
}

const MAX_ATTEMPTS_PER_ITEM = 2;

export async function submitBatch(opts = {}) {
  const root = opts.root || resolveDataRoot();
  const { state, paths } = await loadState(root, opts.runId);
  if (state.status === 'completed') throw new Error('本次运行已经完成，不能再次提交；如需重判请用 regrade。');
  const batch = Number(opts.batch);
  if (!BATCHES.includes(batch)) throw new Error(`批次必须是 1–4，收到 ${opts.batch}`);
  const answers = opts.answers;
  if (!answers || typeof answers !== 'object' || Array.isArray(answers)) throw new Error('answers 必须是对象');

  const items = itemsForBatch(batch);
  const expectedIds = items.map((i) => i.id);
  const gotIds = Object.keys(answers);
  const unknown = gotIds.filter((id) => !expectedIds.includes(id));
  if (unknown.length) throw new Error(`第 ${batch} 批不包含这些题目：${unknown.join(', ')}（本批为 ${expectedIds.join(', ')}）`);
  const missing = expectedIds.filter((id) => !(id in answers));
  // 缺答默认阻断：真机考试里出现过「只答了 3 题就提交」，白丢 6 分且当事 Agent 毫无察觉。
  // 想显式提交缺答，必须带 allowMissing:true（例如故意测试缺答行为）。
  if (missing.length > 0 && opts.allowMissing !== true) {
    throw new Error(
      `第 ${batch} 批还有 ${missing.length} 题没答案：${missing.join(', ')}。\n` +
        `本批应作答：${expectedIds.join(', ')}。\n` +
        `请补全后重新提交；若确实要按「缺答 0 分」提交，请加 --allow-missing 参数。`,
    );
  }
  const payloadHash = sha256Hex(JSON.stringify({ batch, answers: sortObj(answers) }));

  const prev = state.batches[batch];
  if (prev && prev.status === 'graded') {
    if (prev.payloadHash === payloadHash) {
      return { idempotent: true, alreadyGraded: true, batch, next: nextAfter(state, batch), ...(nextAfter(state, batch) ? {} : { finished: true }) };
    }
    throw new Error(`第 ${batch} 批已经提交并判分，拒绝用不同答案覆盖（payload 哈希不一致）。如需重来请新开一次运行。`);
  }

  const results = [];
  for (const item of items) {
    const internal = instantiateInternal(item, state.seed);
    const result = gradeItem(internal, answers[item.id], { seed: state.seed, graderVersion: state.graderVersion });
    results.push(result);
  }

  // 落盘原始答案（逐题单独文件，避免整批重写丢失）
  for (const item of items) {
    const raw = answers[item.id] ?? null;
    await atomicWriteJson(path.join(paths.answers, `${batch}-${item.id}.json`), {
      itemId: item.id,
      batch,
      submittedAt: nowIso(state.demo === true),
      rawAnswerSha256: sha256Hex(typeof raw === 'string' ? raw : JSON.stringify(raw ?? null)),
      rawAnswer: raw,
    });
  }

  state.gradedItems = state.gradedItems.filter((it) => !expectedIds.includes(it.id)).concat(results);
  state.batches[batch] = {
    status: 'graded',
    submittedAt: nowIso(state.demo === true),
    payloadHash,
    itemIds: expectedIds,
    missingIds: missing,
    awarded: results.reduce((s, r) => s + r.awarded, 0),
    max: items.reduce((s, i) => s + i.points, 0),
  };
  const allDone = BATCHES.every((b) => state.batches[b]?.status === 'graded');
  state.currentBatch = allDone ? 4 : Math.min(...BATCHES.filter((b) => state.batches[b]?.status !== 'graded'));
  state.status = allDone ? 'completed' : 'in_progress';
  state.updatedAt = nowIso(state.demo === true);
  await atomicWriteJson(paths.state, state);

  const next = allDone ? null : publicBatchView(state, state.currentBatch);
  return {
    runId: state.runId,
    batch,
    graded: results.map((r) => ({
      id: r.id,
      awarded: r.awarded,
      maxPoints: r.maxPoints,
      gradingStatus: r.gradingStatus,
      failedChecks: r.checks.filter((c) => !c.passed).map((c) => ({ id: c.criterionId, reason: c.reason })),
    })),
    batchAwarded: state.batches[batch].awarded,
    batchMax: state.batches[batch].max,
    missingIds: missing,
    progress: `${state.gradedItems.length}/${ITEMS.length}`,
    next,
    finished: allDone,
  };
}

function nextAfter(state, batch) {
  const nb = BATCHES.find((b) => !state.batches[b] || state.batches[b].status !== 'graded');
  return nb ? publicBatchView(state, nb) : null;
}

function sortObj(obj) {
  const out = {};
  for (const k of Object.keys(obj).sort()) out[k] = obj[k];
  return out;
}

/** 组装完整报告对象 */
export async function buildReport(opts = {}) {
  const root = opts.root || resolveDataRoot();
  const { state } = await loadState(root, opts.runId);
  return reportFromState(state);
}

export function reportFromState(state) {
  const items = ITEMS.map((it) => state.gradedItems.find((g) => g.id === it.id)).filter(Boolean);
  const startedAt = state.createdAt;
  const finishedAt = state.updatedAt;
  const durationMs = new Date(finishedAt).getTime() - new Date(startedAt).getTime();
  const summary = summarize(items, {
    examVersion: state.examVersion,
    graderVersion: state.graderVersion,
    contractVersion: state.contractVersion,
    catalogFingerprint: state.catalogFingerprint,
  });
  // 未答满时状态降级为 PARTIAL
  if (items.length < ITEMS.length && summary.status === STATUS.COMPLETED) {
    summary.status = STATUS.PARTIAL;
    summary.completed = false;
    summary.level = null;
  }
  return {
    runId: state.runId,
    seed: state.seed,
    startedAt,
    finishedAt,
    durationMs,
    environment: state.environment,
    demo: state.demo === true,
    summary,
    items,
    meta: {
      examVersion: state.examVersion,
      graderVersion: state.graderVersion,
      contractVersion: state.contractVersion,
      catalogFingerprint: state.catalogFingerprint,
    },
  };
}

/** 写报告：html / json / summary 三种格式，返回实际路径 */
export async function writeReport(opts = {}) {
  const root = opts.root || resolveDataRoot();
  const { state, paths } = await loadState(root, opts.runId);
  const report = reportFromState(state);
  const format = opts.format || 'html';
  const outPath = opts.out ? resolveOutputPath(opts.out) : path.join(paths.reports, `report.${format === 'summary' ? 'txt' : format}`);
  if (format === 'html') {
    await atomicWriteFileEnsured(outPath, renderHtml(report));
  } else if (format === 'json') {
    await atomicWriteJson(outPath, report);
  } else if (format === 'summary') {
    await atomicWriteFileEnsured(outPath, `${renderSummaryText(report)}\n`);
  } else {
    throw new Error(`未知格式：${format}（可选 html|json|summary）`);
  }
  return { path: outPath, format, report };
}

async function atomicWriteFileEnsured(file, content) {
  const { atomicWrite } = await import('./storage/store.mjs');
  return atomicWrite(file, content);
}

/** 重新判分：只改判分器版本，绝不改原答案 */
export async function regradeRun(opts = {}) {
  const root = opts.root || resolveDataRoot();
  const { state, paths } = await loadState(root, opts.runId);
  const graderVersion = opts.grader || GRADER_VERSION;
  const archived = path.join(paths.evidence, `regrade-${Date.now()}`);
  await ensureDir(archived);
  await atomicWriteJson(path.join(archived, 'before.json'), {
    at: nowIso(),
    graderVersionBefore: state.graderVersion,
    gradedItems: state.gradedItems,
  });
  const before = state.gradedItems.map((g) => ({ id: g.id, awarded: g.awarded }));

  const newResults = [];
  for (const item of ITEMS) {
    const prev = state.gradedItems.find((g) => g.id === item.id);
    if (!prev) continue;
    // 从已保存的原始答案重新读，保证「重判不改答案」
    const file = path.join(paths.answers, `${item.batch}-${item.id}.json`);
    const saved = await readJson(file, null);
    if (!saved) throw new Error(`缺少原始答案文件：${file}，无法重判`);
    if (saved.rawAnswerSha256 !== prev.rawAnswerSha256) {
      throw new Error(`题目 ${item.id} 的原始答案指纹与记录不一致，拒绝重判（可能存在外部改写）`);
    }
    // 关键：不信任文件里存的 rawAnswerSha256，而是**从 rawAnswer 重新计算**再比对。
    // 否则篡改者只要把 rawAnswer 与 rawAnswerSha256 一起改掉就能蒙混过关。
    const recomputed = sha256Hex(typeof saved.rawAnswer === 'string' ? saved.rawAnswer : JSON.stringify(saved.rawAnswer ?? null));
    if (recomputed !== prev.rawAnswerSha256) {
      throw new Error(`题目 ${item.id} 的原始答案指纹与记录不一致，拒绝重判（可能存在外部改写）`);
    }
    const internal = instantiateInternal(item, state.seed);
    newResults.push(gradeItem(internal, saved.rawAnswer, { seed: state.seed, graderVersion }));
  }
  state.gradedItems = newResults;
  state.graderVersion = graderVersion;
  state.updatedAt = nowIso(state.demo === true);
  await atomicWriteJson(paths.state, state);
  const after = newResults.map((g) => ({ id: g.id, awarded: g.awarded }));
  const diffs = before
    .map((b) => ({ id: b.id, before: b.awarded, after: after.find((a) => a.id === b.id)?.awarded ?? 0 }))
    .filter((d) => d.before !== d.after);
  return { runId: state.runId, graderVersion, diffs, beforeTotal: before.reduce((s, x) => s + x.awarded, 0), afterTotal: after.reduce((s, x) => s + x.awarded, 0), archive: archived };
}

/** 环境自检 */
export async function doctor(opts = {}) {
  const checks = [];
  const nodeMajor = Number(process.versions.node.split('.')[0]);
  checks.push({ name: 'Node.js 版本', ok: nodeMajor >= 18, detail: `v${process.versions.node}（要求 ≥18）` });
  checks.push({ name: '操作系统', ok: true, detail: `${process.platform} ${process.arch}` });
  try {
    assertCatalogIntegrity();
    checks.push({ name: '题库契约', ok: true, detail: `16 题 / 100 分 / 4 维 × 25 / ${catalogFingerprint().slice(0, 12)}…` });
  } catch (err) {
    checks.push({ name: '题库契约', ok: false, detail: err.message });
  }
  const root = opts.root || resolveDataRoot();
  const probe = await probeWritable(path.join(root, 'runs'));
  checks.push({ name: '数据目录可写', ok: probe.ok, detail: probe.ok ? root : `${root} — ${probe.error}` });
  const rngTest = sha256Hex('doctor');
  checks.push({ name: '哈希与编码', ok: rngTest.length === 64, detail: 'SHA-256 正常，UTF-8 输出正常' });
  return { ok: checks.every((c) => c.ok), checks, dataRoot: root, versions: { exam: EXAM_VERSION, grader: GRADER_VERSION, contract: SCORING_CONTRACT_VERSION }, node: process.version, platform: process.platform };
}
