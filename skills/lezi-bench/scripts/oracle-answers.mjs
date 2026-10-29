/**
 * 生成一套「标准答案」用于端到端自测（不是给用户看的）。
 * 用法：node scripts/oracle-answers.mjs [--seed S] [--out FILE]
 * 它直接调用题目自带的 oracle 生成答案，用于验证「满分可达」这条评分合同。
 */
import { parseArgs } from 'node:util';
import { isMain } from '../src/is-main.mjs';
import path from 'node:path';
import { BATCHES, itemsForBatch, instantiateInternal } from '../src/exam/manifest.mjs';
import { atomicWriteJson } from '../src/storage/store.mjs';

/**
 * 把 oracle 输出转成「一个普通答题者会写出的 JSON」。
 * 关键：这里刻意不直接复用 grade() 的内部字段名约定，而是按题面要求的 schema 写出。
 */
export function perfectAnswers(seed) {
  const out = {};
  for (const batch of BATCHES) {
    for (const item of itemsForBatch(batch)) {
      const internal = instantiateInternal(item, seed);
      const o = item.oracle(internal.facts);
      out[item.id] = answerFor(item.id, o, internal);
    }
  }
  return out;
}

function answerFor(id, o, internal) {
  switch (id) {
    case 'I01':
      return { deadline: `${o.day}${o.text}`, budgetAttached: o.budgetAttached };
    case 'I02':
      return { selected: o.selected, rejected: o.rejected };
    case 'I03':
      return { rule: o.rule, decision: o.decision, escalate: o.escalate };
    case 'I04':
      return { status: o.status, owner: o.owner, deadline: o.deadline };
    case 'R01':
      return { subtotal: o.subtotal, total: o.total };
    case 'R02': {
      const order = o.validOrders[0];
      return { order, first: o.first ?? order[0], last: o.last ?? order[order.length - 1] };
    }
    case 'R03':
      return { veg: o.best.veg, chicken: o.best.chicken, beef: o.best.beef };
    case 'R04':
      return o.answer;
    case 'D01':
      return { list: o.unique };
    case 'D02':
      return { answer: 'C', reason: '甲项目的最终实际支出没有给出，信息不足，无法确定甲是否比乙省。' };
    case 'D03':
      return { lossMaking: o.lossMaking, onlyInStore: o.onlyInStore, commonCount: o.commonCount };
    case 'D04':
      return { levels: o.levels, counts: o.counts };
    case 'C01':
      return { isCorrect: o.isCorrect, correctTotal: o.correctTotal };
    case 'C02':
      return { beforeVoid: o.beforeVoid, finalStock: o.finalStock };
    case 'C03': {
      const out = {};
      for (const [k, v] of Object.entries(o.cases)) out[k] = { rule: v.rule, needManual: v.needManual };
      return out;
    }
    case 'C04':
      return { rootCause: o.rootCause, fixedSubtotal: o.fixedSubtotal, fixedTotal: o.fixedTotal };
    default:
      throw new Error(`未知题目 ${id}`);
  }
}

if (isMain(import.meta.url)) {
  const { values } = parseArgs({ options: { seed: { type: 'string' }, out: { type: 'string' } }, allowPositionals: true });
  const seed = values.seed || 'demo-seed-1';
  const ans = perfectAnswers(seed);
  if (values.out) {
    await atomicWriteJson(path.resolve(values.out), { seed, answers: ans });
    console.log(`已写入 ${path.resolve(values.out)}`);
  } else {
    console.log(JSON.stringify(ans, null, 2));
  }
}
