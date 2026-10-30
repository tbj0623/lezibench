/**
 * 判分器：把「原始答案」变成带证据的原子得分。
 *
 * 不可违反的规则：
 *  - 只依据题目自带的 publicCriteria 给分；不做任何跨题惩罚。
 *  - 任何解析异常都不得当作「知识错误」静默扣 0，必须落在 status 上。
 *  - 每一条 checkpoint 都要有 reason，报告可逐条复核。
 */
import { buildParse, roundTo } from './parse.mjs';
import { GRADER_VERSION, ITEM_BY_ID, DIMENSIONS, getLevel } from '../exam/manifest.mjs';
import { sha256Hex } from '../exam/rng.mjs';

export { sha256Hex };

export const STATUS = {
  COMPLETED: 'COMPLETED',
  PARTIAL: 'PARTIAL',
  NEEDS_REVIEW: 'NEEDS_REVIEW',
  SYSTEM_ERROR: 'SYSTEM_ERROR',
};

/** 归一化单题答案：支持对象 / JSON 字符串 / 纯文本 */
function normalizeAnswer(raw) {
  if (raw === null || raw === undefined) return { kind: 'missing', value: '' };
  if (typeof raw === 'object') return { kind: 'object', value: raw };
  if (typeof raw !== 'string') return { kind: 'other', value: raw };
  const t = raw.trim();
  if (!t) return { kind: 'missing', value: '' };
  return { kind: 'text', value: t };
}

/**
 * 严格校验 `item.grade()` 的返回值是否满足公开评分契约。
 *
 * 契约（对外承诺，见 docs/SCORING.md）：
 *   - 返回必须是数组，长度恰好等于 publicCriteria 的条数；
 *   - 每个 criterionId 恰好出现一次：不许缺、不许重复、不许出现公开条件之外的 ID；
 *   - points 必须是整数，且与公开分值**完全相等**（防篡改）；
 *   - passed 必须就是 `true` 或 `false` 两个布尔字面量（不接受 'true' / 1 / 0 / undefined）；
 *   - reason 必须是非空、可读的字符串（报告要能逐条复核，空理由等于没有证据）。
 *
 * @returns {string[]} 问题列表；空数组表示合规
 */
export function validateGradingChecks(checks, criteria) {
  const problems = [];

  if (!Array.isArray(checks)) {
    return [`判分结果必须是数组，实际是 ${checks === null ? 'null' : typeof checks}`];
  }
  if (checks.length !== criteria.length) {
    problems.push(`判分条件条数不符：返回 ${checks.length} 条，公开条件 ${criteria.length} 条`);
  }

  const counts = new Map();
  for (const c of checks) {
    if (!c || typeof c !== 'object') {
      problems.push('判分条件里混入了非对象元素');
      continue;
    }
    const id = c.criterionId;
    if (typeof id !== 'string' || id.trim() === '') {
      problems.push('存在缺少 criterionId 的判分条件');
      continue;
    }
    counts.set(id, (counts.get(id) || 0) + 1);
  }

  const known = new Set(criteria.map((c) => c.id));
  for (const [id, n] of counts) {
    if (n > 1) problems.push(`判分条件 ${id} 重复出现 ${n} 次`);
    if (!known.has(id)) problems.push(`返回了公开条件之外的判分条件 ${id}`);
  }
  for (const c of criteria) {
    if (!counts.has(c.id)) problems.push(`缺少公开条件 ${c.id}`);
  }

  for (const c of checks) {
    if (!c || typeof c !== 'object') continue;
    const id = typeof c.criterionId === 'string' ? c.criterionId : '(无 id)';
    const expect = criteria.find((x) => x.id === c.criterionId);
    if (!expect) continue; // 额外 ID 已经在上面报过，不再重复刷屏
    if (!Number.isInteger(c.points)) {
      problems.push(`条件 ${id} 的 points 不是整数：${JSON.stringify(c.points)}`);
    } else if (c.points !== expect.points) {
      problems.push(`条件 ${id} 分值被篡改：${c.points}≠${expect.points}`);
    }
    if (c.passed !== true && c.passed !== false) {
      problems.push(`条件 ${id} 的 passed 不是布尔值：${JSON.stringify(c.passed)}`);
    }
    if (typeof c.reason !== 'string' || c.reason.trim() === '') {
      problems.push(`条件 ${id} 缺少非空的可读理由`);
    }
  }

  return problems;
}

/**
 * 判一道题。
 * @returns {{id, version, maxPoints, awarded, rawAnswerSha256, parsedAnswer, checks, gradingStatus, graderVersion, inputSeed, parseNotes}}
 */
export function gradeItem(internal, rawAnswer, deps = {}) {
  const { item, facts, schema } = internal;
  const criteria = internal.publicCriteria || item.publicCriteria || [];
  if (!Array.isArray(criteria) || criteria.length === 0) throw new Error(`题目 ${item.id} 缺少 publicCriteria`);
  const graderVersion = deps.graderVersion || GRADER_VERSION;
  const seed = deps.seed || '';
  const inputSeed = sha256Hex(`${seed}:${item.id}`);
  const norm = normalizeAnswer(rawAnswer);
  const rawAnswerSha256 = sha256Hex(typeof rawAnswer === 'string' ? rawAnswer : JSON.stringify(rawAnswer ?? null));

  const base = {
    id: item.id,
    version: item.points === 4 ? 'easy' : item.points === 6 ? 'standard' : 'challenge',
    maxPoints: item.points,
    rawAnswerSha256,
    inputSeed,
    graderVersion,
    dimension: item.dimension,
    title: item.title,
  };

  if (norm.kind === 'missing') {
    return {
      ...base,
      awarded: 0,
      parsedAnswer: null,
      checks: criteria.map((c) => ({
        criterionId: c.id,
        points: c.points,
        passed: false,
        reason: '缺答（题目未提交任何内容），按事先公告的缺答 0 分处理',
      })),
      gradingStatus: 'MISSING_ANSWER',
      parseNotes: ['答案为空'],
    };
  }

  let parsed;
  try {
    if (typeof item.parse === 'function') {
      parsed = item.parse(norm.value);
    } else {
      parsed = buildParse(norm.value, schema, item.fallback || null);
    }
  } catch (err) {
    return {
      ...base,
      awarded: 0,
      parsedAnswer: null,
      checks: criteria.map((c) => ({
        criterionId: c.id,
        points: c.points,
        passed: false,
        reason: `评分器内部异常：${err.message}`,
      })),
      gradingStatus: 'SCORER_ERROR',
      parseNotes: [`解析异常：${err.message}`],
    };
  }

  const usableFields = Object.keys(parsed.fields || {}).length;
  if (usableFields === 0) {
    // 有内容但完全无法识别 → 待复核，不当作知识错误
    return {
      ...base,
      awarded: 0,
      parsedAnswer: null,
      checks: criteria.map((c) => ({
        criterionId: c.id,
        points: c.points,
        passed: false,
        reason: '答案存在但无法解析为标准字段，已标记待复核，不计为知识错误',
      })),
      gradingStatus: 'UNPARSEABLE',
      parseNotes: [...(parsed.problems || []), '没有识别到任何可用字段'],
    };
  }

  let checks;
  try {
    checks = item.grade(parsed, facts);
  } catch (err) {
    return {
      ...base,
      awarded: 0,
      parsedAnswer: redactParsed(parsed.fields),
      checks: criteria.map((c) => ({
        criterionId: c.id,
        points: c.points,
        passed: false,
        reason: `评分器内部异常：${err.message}`,
      })),
      gradingStatus: 'SCORER_ERROR',
      parseNotes: [`判分异常：${err.message}`],
    };
  }

  // ── 协议校验：item.grade() 的返回必须严格符合公开评分契约 ────────────────────
  //
  // 为什么这里「一个都不许宽容」（v1.4 修复的真实缺陷）：
  //   旧实现是 `new Map(checks.map(c => [c.criterionId, c]))`，
  //   于是 — 额外条件被静默忽略、重复条件后写覆盖先写、passed:'true' 被 `=== true`
  //   悄悄折成 false、空 reason 也照收。结果：判分器内部的程序错误照样产出
  //   GRADED 的「可信成绩」，报告上看起来一切正常。这是最危险的一类假阴性。
  const protocolProblems = validateGradingChecks(checks, criteria);
  if (protocolProblems.length > 0) {
    return {
      ...base,
      awarded: 0,
      parsedAnswer: redactParsed(parsed.fields),
      checks: criteria.map((c) => ({
        criterionId: c.id,
        points: c.points,
        passed: false,
        reason: '本次不给分：判分器返回结果不符合评分契约，已转为系统异常，不构成正式成绩',
      })),
      gradingStatus: 'SCORER_ERROR',
      parseNotes: [...(parsed.problems || []), ...protocolProblems.map((p) => `评分器协议错误：${p}`)],
      scorerProblems: protocolProblems,
    };
  }

  // 协议已校验通过 → 按公开条件顺序归一化输出（检查项的返回顺序不影响得分）
  const byId = new Map(checks.map((c) => [c.criterionId, c]));
  const normalizedChecks = criteria.map((c) => {
    const hit = byId.get(c.id);
    return {
      criterionId: c.id,
      points: c.points,
      passed: hit.passed === true,
      reason: String(hit.reason).trim(),
    };
  });
  const awarded = normalizedChecks.reduce((s, c) => s + (c.passed ? c.points : 0), 0);
  if (!Number.isInteger(awarded) || awarded < 0 || awarded > item.points) {
    return {
      ...base,
      awarded: 0,
      parsedAnswer: redactParsed(parsed.fields),
      checks: criteria.map((c) => ({ criterionId: c.id, points: c.points, passed: false, reason: '本次不给分：给分越界，已转为系统异常' })),
      gradingStatus: 'SCORER_ERROR',
      parseNotes: [`评分器给分越界：${awarded}/${item.points}`],
      scorerProblems: [`给分越界：${awarded}/${item.points}`],
    };
  }

  return {
    ...base,
    awarded,
    parsedAnswer: redactParsed(parsed.fields),
    checks: normalizedChecks,
    gradingStatus: 'GRADED',
    parseNotes: parsed.problems || [],
    parseSource: parsed.source,
  };
}

/** 报告里不回显整段原始答案（可能含用户隐私），只保留解析后的结构化值 */
function redactParsed(fields) {
  const out = {};
  for (const [k, v] of Object.entries(fields || {})) {
    if (typeof v === 'string') out[k] = v.length > 200 ? `${v.slice(0, 200)}…` : v;
    else out[k] = v;
  }
  return out;
}

/**
 * 汇总一套试卷。
 * @param {Array} itemResults gradeItem 的结果数组
 * @param {{expectTotal?:number, examVersion:string, seed:string, runId:string, startedAt:string, finishedAt:string}} meta
 */
export function summarize(itemResults, meta = {}) {
  const byDim = {};
  for (const d of DIMENSIONS) byDim[d.key] = { key: d.key, label: d.label, awarded: 0, max: d.points, items: 0 };
  let total = 0;
  let maxTotal = 0;
  for (const r of itemResults) {
    const dim = r.dimension;
    if (!byDim[dim]) continue;
    byDim[dim].awarded += r.awarded;
    byDim[dim].max = byDim[dim].max;
    byDim[dim].items++;
    total += r.awarded;
    maxTotal += r.maxPoints;
  }
  const pending = itemResults.filter((r) => ['UNPARSEABLE', 'SCORER_ERROR', 'SYSTEM_ERROR'].includes(r.gradingStatus));
  const hardError = itemResults.some((r) => ['SCORER_ERROR', 'SYSTEM_ERROR'].includes(r.gradingStatus));
  const expectTotal = Number.isInteger(meta.expectTotal) ? meta.expectTotal : 16;
  // 只有「题数齐全 + 无待复核 + 无系统错误」才允许给出完整成绩与段位。
  // 少答一半也报 COMPLETED 会把「没跑完」伪装成「考完了但分低」，这是红线。
  const complete = itemResults.length === expectTotal && pending.length === 0;
  const status = hardError ? STATUS.SYSTEM_ERROR : complete ? STATUS.COMPLETED : STATUS.PARTIAL;
  const level = complete ? getLevel(total) : null;
  return {
    ...meta,
    total,
    maxTotal,
    status,
    completed: complete,
    level: level ? level.label : null,
    levelEn: level ? level.en : null,
    dimensions: Object.values(byDim),
    itemCount: itemResults.length,
    expectedItems: expectTotal,
    pendingCount: pending.length,
    pendingIds: pending.map((r) => r.id),
  };
}

export function listStatusOf(itemResults) {
  const statuses = itemResults.map((r) => r.gradingStatus);
  if (statuses.some((s) => s === 'SCORER_ERROR' || s === 'SYSTEM_ERROR')) return 'SYSTEM_ERROR';
  if (statuses.some((s) => s === 'UNPARSEABLE')) return 'NEEDS_REVIEW';
  if (itemResults.length < 16) return 'PARTIAL';
  return 'COMPLETED';
}

export { roundTo, ITEM_BY_ID };
