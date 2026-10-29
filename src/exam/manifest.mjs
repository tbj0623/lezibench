/**
 * 题库注册表 + 版本清单。
 * examVersion 变更 = 题目内容可能变化；graderVersion 变更 = 判分规则变化。
 * 二者都参与 run 身份与报告，禁止跨版本直接比分数。
 */
import instruction from './items/instruction.mjs';
import reasoning from './items/reasoning.mjs';
import data from './items/data.mjs';
import correction from './items/correction.mjs';
import { sha256Hex } from './rng.mjs';

export const EXAM_VERSION = '1.3.0';
export const GRADER_VERSION = '1.3.0';
export const SCORING_CONTRACT_VERSION = '1.0.0';

export const DIMENSIONS = [
  { key: 'instruction', label: '指令理解', points: 25 },
  { key: 'reasoning', label: '逻辑推理', points: 25 },
  { key: 'data', label: '信息整理', points: 25 },
  { key: 'correction', label: '状态追踪与纠错', points: 25 },
];

export const LEVELS = [
  { min: 90, max: 100, label: '卓越', en: 'Outstanding' },
  { min: 80, max: 89, label: '优秀', en: 'Excellent' },
  { min: 65, max: 79, label: '良好', en: 'Good' },
  { min: 50, max: 64, label: '基础', en: 'Basic' },
  { min: 0, max: 49, label: '需要提升', en: 'Needs Work' },
];

export const BATCHES = [1, 2, 3, 4];

/** 全部 16 道题的定义（顺序 = 显示顺序） */
export const ITEMS = [...instruction, ...reasoning, ...data, ...correction];

export const ITEM_BY_ID = new Map(ITEMS.map((it) => [it.id, it]));

/**
 * 题目公开评分条件。所有题目的 criteria 文本与分值都是静态的（不随 seed 变化），
 * 这里用一个固定的探针 seed 生成一次并缓存，作为「契约」的唯一来源。
 */
const CRITERIA_CACHE = new Map();
export function criteriaOf(item) {
  if (!CRITERIA_CACHE.has(item.id)) {
    const probe = item.generate('criteria-contract-probe');
    if (!Array.isArray(probe.publicCriteria) || probe.publicCriteria.length === 0) {
      throw new Error(`${item.id} 未声明 publicCriteria`);
    }
    CRITERIA_CACHE.set(item.id, probe.publicCriteria);
  }
  return CRITERIA_CACHE.get(item.id);
}
export function criteriaOfId(id) {
  const it = ITEM_BY_ID.get(id);
  if (!it) throw new Error(`未知题目 ${id}`);
  return criteriaOf(it);
}

/** 结构自检：任何一条不成立都不允许开始出题 */
export function assertCatalogIntegrity() {
  const errs = [];
  if (ITEMS.length !== 16) errs.push(`题目数应为 16，实际 ${ITEMS.length}`);
  const ids = new Set();
  for (const it of ITEMS) {
    if (ids.has(it.id)) errs.push(`重复的题目 ID：${it.id}`);
    ids.add(it.id);
    if (![4, 6, 9].includes(it.points)) errs.push(`${it.id} 分值 ${it.points} 不在 {4,6,9}`);
    if (!BATCHES.includes(it.batch)) errs.push(`${it.id} 批次数非法`);
    const crit = criteriaOf(it);
    const critSum = crit.reduce((s, c) => s + c.points, 0);
    if (critSum !== it.points) errs.push(`${it.id} 子条件合计 ${critSum} ≠ 满分 ${it.points}`);
    if (crit.some((c) => !Number.isInteger(c.points) || c.points <= 0)) errs.push(`${it.id} 存在非正整数子分`);
    if (typeof it.generate !== 'function') errs.push(`${it.id} 缺少 generate`);
    if (typeof it.oracle !== 'function') errs.push(`${it.id} 缺少 oracle`);
    if (typeof it.grade !== 'function') errs.push(`${it.id} 缺少 grade`);
  }
  const total = ITEMS.reduce((s, it) => s + it.points, 0);
  if (total !== 100) errs.push(`总分应为 100，实际 ${total}`);
  for (const dim of DIMENSIONS) {
    const sum = ITEMS.filter((i) => i.dimension === dim.key).reduce((s, i) => s + i.points, 0);
    if (sum !== 25) errs.push(`维度 ${dim.key} 合计 ${sum} ≠ 25`);
  }
  for (const b of BATCHES) {
    const n = ITEMS.filter((i) => i.batch === b).length;
    if (n !== 4) errs.push(`第 ${b} 批应有 4 题，实际 ${n}`);
  }
  const easy = ITEMS.filter((i) => i.difficulty === 'easy').length;
  const std = ITEMS.filter((i) => i.difficulty === 'standard').length;
  const chal = ITEMS.filter((i) => i.difficulty === 'challenge').length;
  if (easy !== 4 || std !== 8 || chal !== 4) errs.push(`难度分布应为 4/8/4，实际 ${easy}/${std}/${chal}`);
  // 每个维度都必须恰好 1×4 + 2×6 + 1×9
  for (const dim of DIMENSIONS) {
    const pts = ITEMS.filter((i) => i.dimension === dim.key).map((i) => i.points).sort((a, b) => a - b);
    if (JSON.stringify(pts) !== JSON.stringify([4, 6, 6, 9])) errs.push(`维度 ${dim.key} 分值结构应为 [4,6,6,9]，实际 ${pts}`);
  }
  // 0–100 每个整数都必须可达（按 1 分子块计）
  const weights = ITEMS.flatMap((i) => criteriaOf(i).map((c) => c.points));
  const reachable = new Set([0]);
  for (const w of weights) for (const n of [...reachable]) reachable.add(n + w);
  const missing = [];
  for (let n = 0; n <= 100; n++) if (!reachable.has(n)) missing.push(n);
  if (missing.length) errs.push(`存在不可达整数分数：${missing.join(',')}`);
  if (errs.length) throw new Error(`题库契约校验失败：\n- ${errs.join('\n- ')}`);
  return true;
}

/**
 * 内容指纹 = 决定「两次成绩能不能比」的全部信息。
 *
 * 为什么不能只哈希 criteria：
 *   实测过同一个 seed 下，题面明显改了（R02 的依赖关系），但只哈希 criteria 的指纹**完全没变**。
 *   那样报告里「请只与同题库版本比较」这句话就是空的 —— 用户看到相同指纹，会以为卷子一样。
 *
 * 做法：对「题面 + 评分条件 + 分值结构」全部取哈希。
 *   题面用多个固定探针 seed 采样（不能只用一个：那样随机性变化会被漏掉），
 *   四个探针足以覆盖各个随机分支，且完全确定（同源码必得同指纹）。
 *   改任何一个字的题面、任何一个条件的文本或分值，指纹立刻变。
 */
const FINGERPRINT_PROBES = ['fp-probe-1', 'fp-probe-2'];

let _fpCache = null;

export function catalogFingerprint() {
  if (_fpCache) return _fpCache;
  const payload = ITEMS.map((it) => {
    const probes = FINGERPRINT_PROBES.map((seed) => {
      const g = it.generate(seed);
      return { prompt: g.prompt, criteria: g.publicCriteria };
    });
    return {
      id: it.id,
      dimension: it.dimension,
      difficulty: it.difficulty,
      points: it.points,
      batch: it.batch,
      criteria: criteriaOf(it).map((c) => ({ id: c.id, points: c.points, text: c.text })),
      probes,
    };
  });
  _fpCache = sha256Hex(JSON.stringify(payload));
  return _fpCache;
}

/** 分项指纹：便于报告里说清「到底哪一部分变了」 */
export function fingerprintBreakdown() {
  const critOnly = sha256Hex(JSON.stringify(ITEMS.map((it) => ({
    id: it.id,
    points: it.points,
    criteria: criteriaOf(it).map((c) => ({ id: c.id, points: c.points, text: c.text })),
  }))));
  const promptOnly = sha256Hex(JSON.stringify(ITEMS.map((it) => ({
    id: it.id,
    probes: FINGERPRINT_PROBES.map((seed) => it.generate(seed).prompt),
  }))));
  return { full: catalogFingerprint(), criteria: critOnly, prompts: promptOnly, probes: FINGERPRINT_PROBES };
}

export function getLevel(score) {
  for (const l of LEVELS) if (score >= l.min && score <= l.max) return l;
  return LEVELS[LEVELS.length - 1];
}

export function itemsForBatch(batch) {
  return ITEMS.filter((i) => i.batch === batch);
}

/** 每道题在某个 seed 下的最终实例（题面 + 事实 + 公开评分条件，绝不含 gold） */
export function instantiate(item, seed) {
  const gen = item.generate(`${seed}`);
  return {
    id: item.id,
    dimension: item.dimension,
    dimensionLabel: DIMENSIONS.find((d) => d.key === item.dimension).label,
    difficulty: item.difficulty,
    points: item.points,
    batch: item.batch,
    title: item.title,
    prompt: gen.prompt,
    schema: gen.schema,
    publicCriteria: gen.publicCriteria,
    answerStyle: gen.answerStyle || 'fields',
  };
}

/** 供 grader 使用的完整实例（含 facts，用于本地判分；不得返回给答题方） */
export function instantiateInternal(item, seed) {
  const gen = item.generate(`${seed}`);
  return { item, ...gen };
}
