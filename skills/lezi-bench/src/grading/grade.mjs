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

  // 结构校验：check 必须与题目的公开条件一一对应、分值一致
  const byId = new Map(checks.map((c) => [c.criterionId, c]));
  const normalizedChecks = criteria.map((c) => {
    const hit = byId.get(c.id);
    if (!hit) throw new Error(`判分器未返回条件 ${c.id}`);
    if (hit.points !== c.points) throw new Error(`条件 ${c.id} 分值不一致：${hit.points}≠${c.points}`);
    return { criterionId: c.id, points: c.points, passed: hit.passed === true, reason: String(hit.reason || '') };
  });
  const awarded = normalizedChecks.reduce((s, c) => s + (c.passed ? c.points : 0), 0);
  if (awarded < 0 || awarded > item.points) throw new Error(`条件 ${item.id} 给分越界：${awarded}/${item.points}`);

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
