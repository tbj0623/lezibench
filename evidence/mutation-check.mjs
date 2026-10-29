/**
 * Mutation check：证明 qa/ 下的断言不是空的（assert(true) 级别）。
 *
 * 做法（全部不改 lezibench/src，只在内存里变异）：
 *   M1  grade() 恒判 false      → 「正确答应满分」的断言必须变红
 *   M2  「应满分」的输入改错一个字段 → 同一条断言必须变红（输入变异）
 *   M3  grade() 恒判 true       → 「对抗答应失分」的断言必须变红
 *   M4  gradingStatus 判定       → 乱码输入必须落 UNPARSEABLE，不能被静默 0 分
 *
 * M2 里如果「改错某个字段后仍然满分」，那不是断言无效，而是**真实缺陷**
 * （该字段根本没被评分），会单独列在 FINDINGS 里。
 *
 * 运行：node qa/mutation-check.mjs
 */
import { ITEMS, instantiateInternal } from '../src/exam/manifest.mjs';
import { gradeItem } from '../src/grading/grade.mjs';
import { perfectAnswers } from '../scripts/oracle-answers.mjs';

const SEED = '42';
const byId = Object.fromEntries(ITEMS.map((i) => [i.id, i]));
const results = [];
const findings = [];
let run = 0, caught = 0;

function check(ok, label) {
  run++;
  if (ok) { caught++; results.push(`  ✓ ${label}`); }
  else results.push(`  ✗ ${label}`);
}

/** 深拷贝后把某个叶子字段改成错误值 */
function corruptOneField(answer, mode = 'first-scalar') {
  const clone = JSON.parse(JSON.stringify(answer));
  const paths = [];
  const walk = (node, path) => {
    if (node === null || node === undefined) return;
    if (Array.isArray(node)) { node.forEach((v, i) => walk(v, [...path, i])); return; }
    if (typeof node === 'object') {
      for (const [k, v] of Object.entries(node)) walk(v, [...path, k]);
      return;
    }
    paths.push({ path, value: node });
  };
  walk(clone, []);
  const scalars = paths.filter((p) => typeof p.value === 'number' || typeof p.value === 'boolean' || typeof p.value === 'string');
  if (!scalars.length) return null;
  const target = mode === 'last-scalar' ? scalars[scalars.length - 1] : scalars[0];
  // 逐层定位并改值
  let node = clone;
  for (let i = 0; i < target.path.length - 1; i++) node = node[target.path[i]];
  const key = target.path[target.path.length - 1];
  const v = target.value;
  if (typeof v === 'number') node[key] = v + 997;
  else if (typeof v === 'boolean') node[key] = !v;
  else node[key] = `${v}__MUTATED__`;
  return { answer: clone, field: target.path.join('.'), from: v, to: node[key] };
}

/* ------------------------------------------------------------------ */
/* M1：恒判 false                                                      */
/* ------------------------------------------------------------------ */
console.log('=== M1：grade() 恒判 false → 「正确答应满分」必须变红 ===');
for (const item of ITEMS) {
  const mutated = {
    ...item,
    grade(parsed, facts) {
      return item.grade(parsed, facts).map((c) => ({ ...c, passed: false, reason: 'MUTATED:false' }));
    },
  };
  const r = gradeItem(instantiateInternal(mutated, SEED), JSON.stringify(perfectAnswers(SEED)[item.id]), { seed: SEED });
  check(r.awarded !== item.points, `${item.id}: 变异后 ${r.awarded}/${item.points}（断言「应满分」会红）`);
}

/* ------------------------------------------------------------------ */
/* M2：输入变异（把正确答案改错一个字段）                                */
/* ------------------------------------------------------------------ */
console.log('\n=== M2：正确答案改错一个字段 → 「应满分」断言必须变红 ===');
for (const item of ITEMS) {
  const correct = perfectAnswers(SEED)[item.id];
  const mutated = corruptOneField(correct);
  if (!mutated) { results.push(`  – ${item.id}: 答案无标量字段，跳过`); continue; }
  const rCorrect = gradeItem(instantiateInternal(item, SEED), JSON.stringify(correct), { seed: SEED });
  const rMutated = gradeItem(instantiateInternal(item, SEED), JSON.stringify(mutated.answer), { seed: SEED });
  check(
    rCorrect.awarded === item.points && rMutated.awarded !== item.points,
    `${item.id}: 正确=${rCorrect.awarded}/${item.points}，改错 ${mutated.field}(${JSON.stringify(mutated.from)}→${JSON.stringify(mutated.to)})后=${rMutated.awarded}/${item.points}`,
  );
  if (rMutated.awarded === item.points) {
    findings.push(`${item.id}: 字段 ${mutated.field} 改错后仍满分 —— 该字段未被评分（判分漏项）`);
  }
}

/* ------------------------------------------------------------------ */
/* M3：恒判 true                                                       */
/* ------------------------------------------------------------------ */
console.log('\n=== M3：grade() 恒判 true → 「对抗答应失分」必须变红 ===');
for (const item of ITEMS) {
  const correct = perfectAnswers(SEED)[item.id];
  const mutated = corruptOneField(correct, 'last-scalar') || corruptOneField(correct);
  const internal = instantiateInternal(
    { ...item, grade: (p, f) => item.grade(p, f).map((c) => ({ ...c, passed: true, reason: 'MUTATED:true' })) },
    SEED,
  );
  const r = gradeItem(internal, JSON.stringify(mutated.answer), { seed: SEED });
  check(r.awarded === item.points, `${item.id}: 恒过变异下错答得 ${r.awarded}/${item.points}（断言「应失分」会红）`);
}

/* ------------------------------------------------------------------ */
/* M4：乱码必须落 UNPARSEABLE，不能被当作「知识错误」静默 0 分          */
/* ------------------------------------------------------------------ */
console.log('\n=== M4：乱码输入 → 必须 UNPARSEABLE（非 GRADED 静默 0）===');
for (const item of ITEMS) {
  const r = gradeItem(instantiateInternal(item, SEED), 'asdkjhqwe@@@!!!', { seed: SEED });
  check(
    r.gradingStatus === 'UNPARSEABLE' && r.awarded === 0,
    `${item.id}: 乱码 → ${r.gradingStatus}/${r.awarded}（应为 UNPARSEABLE/0）`,
  );
}

console.log(results.join('\n'));
if (findings.length) {
  console.log('\n=== FINDINGS（改错字段仍满分 = 判分漏项）===');
  console.log(findings.map((f) => `  ! ${f}`).join('\n'));
}
console.log(`\n=== 汇总：${caught}/${run} 个变异被检出 ===`);
if (caught !== run) {
  const missed = results.filter((r) => r.trim().startsWith('✗'));
  console.log('未被检出的变异（需人工判断是断言问题还是真实缺陷）：');
  console.log(missed.join('\n'));
}
