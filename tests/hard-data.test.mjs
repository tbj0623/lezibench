/**
 * 信息整理维度（data）难度回归测试。
 *
 * ⚠️ 手算夹具纪律（与 golden-fixtures.test.mjs 同源）：
 *   FIXTURES 里的 answer 全部由人按题面规则**手工推导**得出，**不调用 oracle()**。
 *   任何修改 generate() 却忘了重算夹具的行为，都会让本文件变红 —— 这正是要的摩擦。
 *
 * 覆盖：
 *   1. 20 seed 生成不抛 + 确定性
 *   2. 20 seed oracle 满分
 *   3. 手算夹具（每题 3 条，期望值为字面常量）
 *   4. 全错答案得 0
 *   5. 题面无答案泄漏
 *   6. 判分标准文本中性
 *   7. D01 脏数据归一
 *   8. D03 同名不同码按编码对齐
 *   9. D04 例外链
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { ITEM_BY_ID, instantiateInternal } from '../src/exam/manifest.mjs';
import { gradeItem } from '../src/grading/grade.mjs';
import { perfectAnswers } from '../scripts/oracle-answers.mjs';

const IDS = ['D01', 'D02', 'D03', 'D04'];
const item = (id) => ITEM_BY_ID.get(id);

function factsOf(id, seed) {
  return instantiateInternal(item(id), seed).facts;
}
function gradeOf(id, seed, answer) {
  return gradeItem(instantiateInternal(item(id), seed), answer, { seed });
}

/* ================================================================== *
 * 手算夹具（期望值 = 人工推导的字面常量）
 * ================================================================== */

export const FIXTURES = [
  /* ----------------------------- D01 ----------------------------- */
  {
    id: 'D01',
    seed: 'hand-d01-1',
    points: 4,
    factsDigest: {
      roster: '8 个摊位，含 Nova 苏州一店 / Nova 苏州二店 这对「只差一个字」的同品牌摊位',
      present: '原始登记里只出现 7 个摊位，Lumo 杭州店 未登记',
      seqOfZone: 'S1→3, S2→2, S3→3, S4→1, S5→1, S6→2',
      rawLines: '27 行（含空行），22 条非空登记行，混有全角字母/全角空格/大小写',
    },
    // 手算：出现的 7 个摊位 → 键 = 摊位序号*1000 + 名录序号
    //   Nova苏州二店 S4/1 → 1001   Orchid 合肥店 S4/2 → 1002   Quill 宁波店 S5/9 → 1009
    //   Pine 南京店  S2/3 → 2003   Vela 常州店   S6/4 → 2004
    //   Nova苏州一店 S3/7 → 3007   Rune 无锡店   S1/8 → 3008
    // 升序排列即下答案；Lumo 杭州店 未登记，不得出现。
    answer: {
      list: ['Nova 苏州二店', 'Orchid 合肥店', 'Quill 宁波店', 'Pine 南京店', 'Vela 常州店', 'Nova 苏州一店', 'Rune 无锡店'],
    },
    how: '先按 NFKC+去空格+小写归一去重（27 行 → 7 个摊位），再按「摊位序号→名录序号」两键升序：S4 组的序号 1/2/9 打头，之后 S2(3)、S6(4)，最后 S3(7)、S1(8)。Lumo 杭州店 未在原始登记中出现，排除。',
  },
  {
    id: 'D01',
    seed: 'hand-d01-2',
    points: 4,
    factsDigest: {
      roster: '8 个摊位',
      present: '原始登记里出现 7 个摊位，Quill 宁波店 未登记',
      seqOfZone: 'S1→3, S2→2, S3→3, S4→1, S5→2, S6→1',
      rawLines: '28 行（含空行）',
    },
    // 手算：Nova苏州二店 S4/1→1001, Orchid 合肥店 S4/2→1002, Vela 常州店 S6/4→1004,
    //       Pine 南京店  S2/3→2003,
    //       Lumo 杭州店  S1/5→3005, Nova苏州一店 S3/7→3007, Rune 无锡店 S1/8→3008
    answer: {
      list: ['Nova 苏州二店', 'Orchid 合肥店', 'Vela 常州店', 'Pine 南京店', 'Lumo 杭州店', 'Nova 苏州一店', 'Rune 无锡店'],
    },
    how: 'S4 组序号 1、2，S6 组序号 4，排在 S2 组的 3 之后 —— 注意「摊位序号」不是「名录序号」，两者必须分别取。',
  },
  {
    id: 'D01',
    seed: 'hand-d01-3',
    points: 4,
    factsDigest: {
      roster: '8 个摊位',
      present: '原始登记里出现 7 个摊位，Pine 南京店 未登记',
      seqOfZone: 'S1→3, S2→3, S3→1, S4→2, S5→2, S6→1',
      rawLines: '27 行（含空行）',
    },
    // 手算：Vela 常州店 S6/4→1004, Nova苏州一店 S3/7→1007,
    //       Nova苏州二店 S4/1→2001, Orchid 合肥店 S4/2→2002, Quill 宁波店 S5/9→2009,
    //       Lumo 杭州店 S1/5→3005, Rune 无锡店 S1/8→3008
    answer: {
      list: ['Vela 常州店', 'Nova 苏州一店', 'Nova 苏州二店', 'Orchid 合肥店', 'Quill 宁波店', 'Lumo 杭州店', 'Rune 无锡店'],
    },
    how: 'Nova 苏州一店(S3,序号1) 排在 Nova 苏州二店(S4,序号2) 之前 —— 两家名字只差一个字，但分区不同，必须都保留且按分区序号排。',
  },

  /* ----------------------------- D02 ----------------------------- */
  {
    id: 'D02',
    seed: 'hand-d02-1',
    points: 6,
    factsDigest: {
      aGiven: true,
      jiaActual: '39, 42, 40, 43, 40（一月至五月，行序已打乱）',
      yiActual: '35, 43, 35, 47, 35',
      budgetTrap: '甲预算合计 214 万元 > 乙 138 万元；但实际支出方向相反，拿预算比会得到 A',
    },
    answer: {
      answer: 'B',
      reason: '甲累计实际支出 204 万元，乙累计实际支出 195 万元，甲比乙多，不比乙省。',
    },
    how: '甲 39+42+40+43+40=204；乙 35+43+35+47+35=195。204 > 195，所以「甲比乙少」为否 → B。预算合计 214 与 138 是干扰项，实际支出方向与预算方向相反。',
  },
  {
    id: 'D02',
    seed: 'hand-d02-2',
    points: 6,
    factsDigest: {
      aGiven: false,
      jiaActual: '一月44 二月38 三月40 四月40，五月为空白，备注「预计 43 万元，尚未入账」',
      yiActual: '一月45 二月45 三月42 四月46 五月34',
      trap: '若把预计 43 当实际，甲合计 205 < 乙 212，会错答 A',
    },
    answer: {
      answer: 'C',
      reason: '甲项目五月的实际支出这一栏是空白，备注里的 43 万元是预计数尚未入账，信息不足无法比较累计实际支出。',
    },
    how: '乙合计 45+45+42+46+34=212 已知；甲四月前 44+38+40+40=162，五月实际支出缺失，预计数不能计入 → 无法求和 → C。',
  },
  {
    id: 'D02',
    seed: 'hand-d02-3',
    points: 6,
    factsDigest: {
      aGiven: false,
      jiaActual: '一月41 二月43 三月为空白（备注「预计 56 万元，尚未入账」）四月38 五月44',
      yiActual: '一月44 二月38 三月43 四月43 五月37',
      trap: '若把预计 56 当实际，甲合计 222 明显高于乙 205，仍需选 C —— 这不是方向问题，是「能不能求和」的问题',
    },
    answer: {
      answer: 'C',
      reason: '甲项目三月的实际支出是空白，备注里的 56 万元为预计数尚未入账，累计实际支出无法确定。',
    },
    how: '乙合计 44+38+43+43+37=205；甲三月实际支出缺失 → 甲合计不可知 → C。即使把 56 加上去会得到 222 > 205，也不能据此答 B。',
  },

  /* ----------------------------- D03 ----------------------------- */
  {
    id: 'D03',
    seed: 'hand-d03-1',
    points: 6,
    factsDigest: {
      supplierRows: 14,
      storeRows: 16,
      dupName: 'A-101 与 A-110 同为「苏州仓」（按名称对齐必错）；D-402 与 D-420 同为「合肥仓」',
      trap: '档案价与进价的大小关系恒与售价相反，按档案价判会得到另一套清单',
    },
    // 手算逐行比对（进价 → 售价）：
    //   A-110 70→87 不亏  G-712 42→63 不亏  F-640 21→38 不亏  C-351 67→91 不亏
    //   H-843 59→55 亏 ✔  G-721 22→26 不亏  B-270 22→45 不亏  H-834 69→67 亏 ✔
    //   D-420 60→74 不亏  F-604 39→32 亏 ✔  E-518 37→50 不亏  A-101 81→94 不亏
    //   C-315 45→70 不亏  D-402 51→59 不亏
    //   门店独有：B-207、E-581（供应商表里没有这两个码）
    //   共同 SKU = 16 门店行 - 2 独有 = 14
    answer: {
      lossMaking: ['F-604', 'H-843', 'H-834'],
      onlyInStore: ['B-207', 'E-581'],
      commonCount: 14,
    },
    how: '按 SKU 编码（忽略大小写）对齐两张表。14 个共同 SKU 里只有 F-604(39→32)、H-843(59→55)、H-834(69→67) 售价低于进价；B-207 与 E-581 只在门店表出现。A-101/A-110 同名「苏州仓」但编码不同，必须靠编码区分。',
  },
  {
    id: 'D03',
    seed: 'hand-d03-2',
    points: 6,
    factsDigest: {
      supplierRows: 13,
      storeRows: 16,
      dupName: 'A-101 / A-110 同名；D-402 / D-420 同名',
    },
    // A-101 24→43 不亏  D-402 44→62 不亏  F-604 23→39 不亏  H-843 34→51 不亏
    // C-351 62→70 不亏  H-834 46→42 亏 ✔  E-581 21→36 不亏  D-420 34→24 亏 ✔
    // G-712 44→49 不亏  B-270 32→47 不亏  G-721 26→34 不亏  A-110 88→82 亏 ✔
    // C-315 79→94 不亏
    // 门店独有：B-207、E-518、F-640 → 3 个；共同 = 16 - 3 = 13
    answer: {
      lossMaking: ['A-110', 'D-420', 'H-834'],
      onlyInStore: ['B-207', 'E-518', 'F-640'],
      commonCount: 13,
    },
    how: '13 个共同 SKU，亏本 3 个（A-110 88→82、D-420 34→24、H-834 46→42），门店独有 3 个。注意 A-110 与 A-101 都叫「苏州仓」，但 A-101 是 24→43 正常，按名称对齐会把它俩的进价搞混。',
  },
  {
    id: 'D03',
    seed: 'hand-d03-3',
    points: 6,
    factsDigest: {
      supplierRows: 13,
      storeRows: 15,
      dupName: 'A-101 / A-110 同名；D-402 / D-420 同名',
    },
    // C-315 41→29 亏 ✔  A-110 20→34 不亏  E-518 51→69 不亏  H-843 48→39 亏 ✔
    // G-712 61→78 不亏  D-402 55→49 亏 ✔  B-270 86→81 亏 ✔  D-420 86→99 不亏
    // H-834 50→65 不亏  B-207 22→27 不亏  A-101 88→93 不亏  F-604 36→59 不亏
    // C-351 83→95 不亏
    // 门店独有：F-640、E-581 → 2 个；共同 = 15 - 2 = 13
    answer: {
      lossMaking: ['B-270', 'C-315', 'D-402', 'H-843'],
      onlyInStore: ['E-581', 'F-640'],
      commonCount: 13,
    },
    how: '13 个共同 SKU，亏本 4 个。B-270 进价 86 是这批里最贵的，售价 81 仍低于进价；D-420 也是 86 但售价 99，不亏 —— 两个「合肥仓」不能混。',
  },

  /* ----------------------------- D04 ----------------------------- */
  {
    id: 'D04',
    seed: 'hand-d04-1',
    points: 9,
    factsDigest: {
      people: 14,
      levels: '钻石/白金/金牌/银牌/普通',
    },
    // 由「只读题面文本」的独立实现重算（qa/d04-recompute.mjs），未调用 oracle：
    // 解析人名行拿到 年龄/积分/活跃/邀请码/年数，解析规则行拿到四级积分阈值，
    // 再按题面写明的「常规规则 + 例外一 + 例外一的例外」逐人判定。
    answer: {
      levels: {
        寅: '钻石', 戊: '白金', 甲: '金牌', 丑: '金牌', 辛: '金牌',
        己: '普通', 庚: '银牌', 丙: '银牌', 壬: '普通', 卯: '普通',
        丁: '普通', 子: '银牌', 癸: '普通', 乙: '银牌',
      },
      counts: { diamond: 1, platinum: 1, gold: 3, silver: 4, normal: 5 },
    },
    how: '钻石 1（寅）／白金 1（戊）／金牌 3（甲、丑、辛）／银牌 4（庚、丙、子、乙）／普通 5（己、壬、卯、丁、癸），合计 14。',
  },
  {
    id: 'D04',
    seed: 'hand-d04-2',
    points: 9,
    factsDigest: {
      people: 14,
      levels: '钻石/白金/金牌/银牌/普通',
    },
    // 由「只读题面文本」的独立实现重算（qa/d04-recompute.mjs），未调用 oracle：
    // 解析人名行拿到 年龄/积分/活跃/邀请码/年数，解析规则行拿到四级积分阈值，
    // 再按题面写明的「常规规则 + 例外一 + 例外一的例外」逐人判定。
    answer: {
      levels: {
        卯: '普通', 乙: '白金', 壬: '金牌', 寅: '金牌', 丙: '金牌',
        子: '银牌', 辛: '普通', 丁: '银牌', 丑: '普通', 戊: '钻石',
        甲: '普通', 己: '银牌', 癸: '普通', 庚: '银牌',
      },
      counts: { diamond: 1, platinum: 1, gold: 3, silver: 4, normal: 5 },
    },
    how: '钻石 1（戊）／白金 1（乙）／金牌 3（壬、寅、丙）／银牌 4（子、丁、己、庚）／普通 5（卯、辛、丑、甲、癸），合计 14。',
  },
  {
    id: 'D04',
    seed: 'hand-d04-3',
    points: 9,
    factsDigest: {
      people: 14,
      levels: '钻石/白金/金牌/银牌/普通',
    },
    // 由「只读题面文本」的独立实现重算（qa/d04-recompute.mjs），未调用 oracle：
    // 解析人名行拿到 年龄/积分/活跃/邀请码/年数，解析规则行拿到四级积分阈值，
    // 再按题面写明的「常规规则 + 例外一 + 例外一的例外」逐人判定。
    answer: {
      levels: {
        卯: '钻石', 壬: '白金', 辛: '金牌', 寅: '普通', 庚: '金牌',
        丙: '银牌', 子: '普通', 甲: '银牌', 癸: '普通', 丁: '普通',
        乙: '普通', 己: '银牌', 丑: '普通', 戊: '普通',
      },
      counts: { diamond: 1, platinum: 1, gold: 2, silver: 3, normal: 7 },
    },
    how: '钻石 1（卯）／白金 1（壬）／金牌 2（辛、庚）／银牌 3（丙、甲、己）／普通 7（寅、子、癸、丁、乙、丑、戊），合计 14。',
  },
];

export function fixturesOf(id) {
  return FIXTURES.filter((f) => f.id === id);
}

/* ================================================================== *
 * 1 & 2：20 seed 生成不抛 + 确定性；oracle 满分
 * ================================================================== */

test('D01-D04：20 个 seed 下 generate 不抛错且完全确定（同 seed 两次结果一致）', () => {
  for (const id of IDS) {
    const it = item(id);
    for (let i = 0; i < 20; i++) {
      const seed = `det-${id}-${i}`;
      const a = it.generate(seed);
      const b = it.generate(seed);
      assert.equal(a.prompt, b.prompt, `${id} seed=${seed} 题面不确定`);
      assert.deepEqual(a.facts, b.facts, `${id} seed=${seed} facts 不确定`);
      assert.deepEqual(a.publicCriteria, b.publicCriteria, `${id} seed=${seed} 评分标准不确定`);
      assert.ok(a.prompt.length > 0, `${id} seed=${seed} 题面为空`);
    }
  }
});

test('D01-D04：20 个 seed 下 oracle 直接作答必须满分', () => {
  for (const id of IDS) {
    const it = item(id);
    for (let i = 0; i < 20; i++) {
      const seed = `oracle-${id}-${i}`;
      const internal = instantiateInternal(it, seed);
      const ans = perfectAnswers(seed)[id];
      const r = gradeItem(internal, ans, { seed });
      assert.equal(r.awarded, it.points, `${id} seed=${seed} 只拿 ${r.awarded}/${it.points}；失败项=${r.checks.filter((c) => !c.passed).map((c) => c.criterionId).join(',')}`);
    }
  }
});

/* ================================================================== *
 * 3：手算夹具必须满分（期望值为字面常量，不经 oracle）
 * ================================================================== */

test('手算夹具：D01-D04 每题 3 条，按人工推导的答案必须满分', () => {
  for (const fx of FIXTURES) {
    const r = gradeOf(fx.id, fx.seed, fx.answer);
    assert.equal(
      r.awarded,
      fx.points,
      `${fx.id} seed=${fx.seed} 手算答案只得 ${r.awarded}/${fx.points}；不符项=${r.checks.filter((c) => !c.passed).map((c) => `${c.criterionId}(${c.reason})`).join(' | ')}`,
    );
  }
});

test('手算夹具：每题至少 3 条，四题全覆盖', () => {
  for (const id of IDS) {
    assert.ok(fixturesOf(id).length >= 3, `${id} 手算夹具只有 ${fixturesOf(id).length} 条，要求 ≥3`);
  }
});

test('手算夹具：同一题内各条的答案互不相同（防止三条其实是同一种情况）', () => {
  for (const id of IDS) {
    const sigs = fixturesOf(id).map((f) => JSON.stringify(f.answer));
    assert.equal(new Set(sigs).size, sigs.length, `${id} 的三条夹具答案重复，没有覆盖不同分支`);
  }
});

test('手算夹具：每条都必须能被「改错一点」打下来（证明夹具不是恒真的摆设）', () => {
  for (const fx of FIXTURES) {
    const good = gradeOf(fx.id, fx.seed, fx.answer);
    assert.equal(good.awarded, fx.points, `${fx.id}/${fx.seed} 手算答案未满分`);

    let mutated;
    if (fx.id === 'D01') {
      mutated = { list: [...fx.answer.list].reverse() }; // 顺序错
    } else if (fx.id === 'D02') {
      const flip = { A: 'B', B: 'A', C: 'A' };
      mutated = { answer: flip[fx.answer.answer], reason: fx.answer.reason };
    } else if (fx.id === 'D03') {
      mutated = { ...fx.answer, commonCount: fx.answer.commonCount + 1 };
    } else {
      const levels = { ...fx.answer.levels };
      const first = Object.keys(levels)[0];
      levels[first] = levels[first] === '普通' ? '钻石' : '普通';
      mutated = { levels, counts: fx.answer.counts };
    }
    const bad = gradeOf(fx.id, fx.seed, mutated);
    assert.ok(
      bad.awarded < fx.points,
      `${fx.id}/${fx.seed} 改错后仍然是满分（${bad.awarded}/${fx.points}）—— 这条夹具没有约束力`,
    );
  }
});

/* ================================================================== *
 * 4：全错答案必须 0 分
 * ================================================================== */

test('D01-D04：全错答案必须得 0 分', () => {
  const wrong = {
    D01: { list: ['Zzz 不存在店'] },
    D02: { answer: 'A', reason: '甲乙一样' },
    D03: { lossMaking: ['Z-999'], onlyInStore: ['Z-998'], commonCount: 99 },
    D04: { levels: { 甲: '普通' }, counts: { diamond: 9, platinum: 9, gold: 9, silver: 9, normal: 9 } },
  };
  for (const id of IDS) {
    const it = item(id);
    let allZero = 0;
    for (let i = 0; i < 10; i++) {
      const seed = `wrong-${id}-${i}`;
      const o = it.oracle(factsOf(id, seed));
      // D02 的全错答案要避开「恰好蒙对」：直接给一个与 oracle 不同的字母
      const ans = id === 'D02'
        ? { answer: o.answer === 'A' ? 'B' : 'A', reason: '完全无关的理由' }
        : wrong[id];
      const r = gradeItem(instantiateInternal(it, seed), ans, { seed });
      if (r.awarded === 0) allZero++;
    }
    assert.ok(allZero >= 8, `${id} 全错答案只拿到 ${allZero}/10 次 0 分，判分过松`);
  }
});

/* ================================================================== *
 * 5：题面不得泄漏答案
 * ================================================================== */

test('D01-D04：题面不得出现标准答案/参考答案等字样', () => {
  for (const id of IDS) {
    for (let i = 0; i < 10; i++) {
      const seed = `leak-${id}-${i}`;
      const g = item(id).generate(seed);
      assert.ok(!/标准答案|参考答案|正确答案是|解析：/u.test(g.prompt), `${id} seed=${seed} 题面出现答案字样`);
    }
  }
});

test('D01-D04：题面不得把 oracle 的最终结论直接写出来', () => {
  for (const id of IDS) {
    const it = item(id);
    for (let i = 0; i < 10; i++) {
      const seed = `leak2-${id}-${i}`;
      const g = it.generate(seed);
      const o = it.oracle(g.facts);
      if (id === 'D01') {
        // 整理后的完整名单不得整串出现在题面里
        assert.ok(!g.prompt.includes(o.unique.join('、')), `D01 seed=${seed} 题面直接给出了答案名单`);
        assert.ok(!g.prompt.includes(JSON.stringify(o.unique)), `D01 seed=${seed} 题面直接给出了答案 JSON`);
      }
      if (id === 'D03') {
        assert.ok(!g.prompt.includes(JSON.stringify(o.lossMaking)), `D03 seed=${seed} 题面泄漏亏本清单`);
        assert.ok(!g.prompt.includes(`共同 ${o.commonCount}`), `D03 seed=${seed} 题面泄漏共同数量`);
      }
      if (id === 'D04') {
        assert.ok(!g.prompt.includes(JSON.stringify(o.counts)), `D04 seed=${seed} 题面泄漏人数统计`);
      }
    }
  }
});

/* ================================================================== *
 * 6：判分标准文本中性（不提示陷阱、不含具体数字）
 * ================================================================== */

test('D01-D04：publicCriteria 文本中性且不含具体数字', () => {
  const BANNED = /不得|不要|而非|注意|小心|陷阱|容易错|别忘/u;
  for (const id of IDS) {
    for (let i = 0; i < 10; i++) {
      const seed = `crit-${id}-${i}`;
      const g = item(id).generate(seed);
      assert.ok(g.publicCriteria.length > 0, `${id} seed=${seed} 没有评分标准`);
      for (const c of g.publicCriteria) {
        assert.ok(!BANNED.test(c.text), `${id} ${c.id} 评分标准含有倾向性措辞：「${c.text}」`);
        assert.ok(!/[0-9]/u.test(c.text), `${id} ${c.id} 评分标准含具体数字：「${c.text}」`);
      }
    }
  }
});

test('D01-D04：结构契约（分数 / 条件点 / 难度 / 批次）不得变动', () => {
  const SPEC = {
    D01: { points: 4, difficulty: 'easy', batch: 1, split: [1, 3] },
    D02: { points: 6, difficulty: 'standard', batch: 2, split: [2, 2, 2] },
    D03: { points: 6, difficulty: 'standard', batch: 3, split: [2, 2, 2] },
    D04: { points: 9, difficulty: 'challenge', batch: 4, split: [3, 3, 3] },
  };
  for (const id of IDS) {
    const it = item(id);
    const g = it.generate('contract-probe');
    assert.equal(it.points, SPEC[id].points, `${id} 分值变了`);
    assert.equal(it.difficulty, SPEC[id].difficulty, `${id} 难度变了`);
    assert.equal(it.batch, SPEC[id].batch, `${id} 批次变了`);
    assert.equal(it.dimension, 'data', `${id} 维度变了`);
    assert.deepEqual(g.publicCriteria.map((c) => c.points), SPEC[id].split, `${id} 条件点拆分变了`);
    const sum = g.publicCriteria.reduce((s, c) => s + c.points, 0);
    assert.equal(sum, SPEC[id].points, `${id} 条件点合计 ${sum} ≠ ${SPEC[id].points}`);
  }
});

/* ================================================================== *
 * 7：D01 脏数据归一
 * ================================================================== */

test('D01：空行、全角空格、全角字母、大小写混写必须被正确归一', () => {
  for (let i = 0; i < 12; i++) {
    const seed = `dirty-${i}`;
    const g = item('D01').generate(seed);
    const f = g.facts;
    // 题面里必须真的存在空行与全角字符（否则这道题没有脏数据可处理）
    assert.ok(f.display.some((l) => l.trim() === ''), `D01 seed=${seed} 没有空行`);
    assert.ok(f.display.some((l) => /[\uFF21-\uFF3A\uFF41-\uFF5A\u3000]/u.test(l)), `D01 seed=${seed} 没有全角字符`);
    assert.ok(f.display.some((l) => /[A-Z]/.test(l) && /[a-z]/.test(l) === false), `D01 seed=${seed} 没有全大写写法`);
    // 大小写/全角归一后，同一摊位的各种写法应折叠为同一个 key
    const keys = new Set(f.rawList.map((x) => x.normalize('NFKC').replace(/\s+/g, '').toLowerCase()));
    const distinctShops = new Set(f.activeNames.map((x) => x.normalize('NFKC').replace(/\s+/g, '').toLowerCase()));
    assert.equal(keys.size, distinctShops.size, `D01 seed=${seed} 归一去重后种类数不对`);
    // 原始非空行数必须显著多于不同摊位数（证明真的在去重）
    assert.ok(f.rawList.length > distinctShops.size * 2, `D01 seed=${seed} 重复量不足，去重没难度`);
  }
});

test('D01：脏写法（全角/大小写/空格）在判分时与正式名称等价', () => {
  const seed = 'dirty-equiv';
  const f = factsOf('D01', seed);
  const o = item('D01').oracle(f);
  const messyAnswer = o.unique.map((n, i) => {
    if (i % 3 === 0) return n.toUpperCase();
    if (i % 3 === 1) return n.toLowerCase();
    return `  ${n.replace(' ', '\u3000')}  `;
  });
  const r = gradeOf('D01', seed, { list: messyAnswer });
  assert.equal(r.awarded, 4, `D01 seed=${seed} 用脏写法回答正确答案却只拿 ${r.awarded}/4`);
});

test('D01：漏写一个摊位的重复项（把两家同名店合并）必须掉分', () => {
  const seed = 'd01-twin';
  const f = factsOf('D01', seed);
  const o = item('D01').oracle(f);
  const twins = o.unique.filter((n) => n.startsWith('Nova 苏州'));
  assert.equal(twins.length, 2, '这个 seed 下应同时存在 Nova 苏州一店 与 苏州二店');
  const merged = o.unique.filter((n) => n !== twins[1]);
  const r = gradeOf('D01', seed, { list: merged });
  assert.ok(r.awarded < 4, `D01 seed=${seed} 把两家同名店合并成一家竟然还满分`);
});

/* ================================================================== *
 * 8：D03 同名不同码必须按编码对齐
 * ================================================================== */

test('D03：同名但不同编码的 SKU，判分必须按编码而不是按名称', () => {
  for (let i = 0; i < 12; i++) {
    const seed = `d03-name-${i}`;
    const f = factsOf('D03', seed);
    const supNames = f.supplierRows.map((r) => r.name);
    const dup = [...new Set(supNames.filter((n, idx) => supNames.indexOf(n) !== idx))];
    assert.ok(dup.length >= 1, `D03 seed=${seed} 供应商表里没有「同名不同码」的 SKU，陷阱没造出来`);
    // 同名的那几个编码，进价必须不同 —— 否则按名称对齐不会出错，陷阱等于没有
    for (const name of dup) {
      const prices = f.supplierRows.filter((r) => r.name === name).map((r) => r.price);
      assert.ok(new Set(prices).size >= 2, `D03 seed=${seed} 同名 SKU「${name}」进价相同，按名称对齐不会出错`);
    }
  }
});

test('D03：按名称对齐而不是按编码对齐，必须被判错', () => {
  const seed = 'd03-align';
  const f = factsOf('D03', seed);
  const o = item('D03').oracle(f);
  // 构造一个「名称对得上但编码串了」的答案：把同名 SKU 的结论互换
  const supBySku = new Map(f.supplierRows.map((r) => [r.sku, r]));
  const byName = new Map();
  for (const r of f.supplierRows) {
    if (!byName.has(r.name)) byName.set(r.name, []);
    byName.get(r.name).push(r);
  }
  const flipped = new Set();
  const badLoss = o.lossMaking.map((sku) => {
    const grp = byName.get(supBySku.get(sku).name) || [];
    const other = grp.find((r) => r.sku !== sku);
    if (!other || flipped.has(sku)) return sku;
    flipped.add(sku);
    return other.sku;
  });
  const r = gradeOf('D03', seed, { lossMaking: badLoss, onlyInStore: o.onlyInStore, commonCount: o.commonCount });
  assert.ok(r.awarded < 6, `D03 seed=${seed} 把同名 SKU 的结论互换后竟然还是满分，说明判分没有按编码对齐`);
});

test('D03：用「档案价」代替「进价」判亏本必须掉分', () => {
  for (const seed of ['hand-d03-1', 'hand-d03-2', 'hand-d03-3', 'd03-trap-0']) {
    const f = factsOf('D03', seed);
    const sup = new Map(f.supplier.map((s) => [s.sku.toUpperCase(), s.price]));
    const byListPrice = f.storeRows
      .filter((r) => sup.has(r.sku.toUpperCase()) && r.listPrice < sup.get(r.sku.toUpperCase()))
      .map((r) => r.sku.toUpperCase())
      .sort();
    const o = item('D03').oracle(f);
    assert.notDeepEqual(byListPrice, o.lossMaking, `D03 seed=${seed} 档案价陷阱失效：按档案价判得到同一个清单`);
    const r = gradeOf('D03', seed, { lossMaking: byListPrice, onlyInStore: o.onlyInStore, commonCount: o.commonCount });
    assert.ok(r.awarded < 6, `D03 seed=${seed} 用档案价判亏本竟然满分`);
  }
});

/* ================================================================== *
 * 9：D04 例外链
 * ================================================================== */

test('D04：五级等级齐备，14 人，且每级都有人（否则统计项退化）', () => {
  for (let i = 0; i < 12; i++) {
    const seed = `d04-five-${i}`;
    const f = factsOf('D04', seed);
    const o = item('D04').oracle(f);
    assert.equal(f.tiers.length, 14, `D04 seed=${seed} 人数不是 14`);
    for (const k of ['diamond', 'platinum', 'gold', 'silver', 'normal']) {
      assert.ok(o.counts[k] >= 1, `D04 seed=${seed} 等级 ${k} 为 0 人，五级统计退化`);
    }
    const sum = Object.values(o.counts).reduce((a, b) => a + b, 0);
    assert.equal(sum, 14, `D04 seed=${seed} 五级合计 ${sum} ≠ 14`);
  }
});

test('D04：例外链——「例外一的例外」必须真的存在且改变结论', () => {
  const chainSeeds = [];
  for (let i = 0; i < 40 && chainSeeds.length < 4; i++) {
    const seed = `d04-chain-${i}`;
    const f = factsOf('D04', seed);
    const o = item('D04').oracle(f);
    // 找出「年龄<18、年数≥5、活跃」的人：他们必须不是普通（即没有掉进例外一）
    const saved = f.tiers.filter((t) => t.age < 18 && t.years >= 5 && t.active);
    if (saved.length === 0) continue;
    chainSeeds.push(seed);
    // 只有「常规判定确实高于普通」的人，才能观察到封顶效果。
    // 常规可达的最高档是白金（钻石要求年数≥3 也可能），凡是常规判定到
    // 钻石/白金/金牌的，最终一律封顶为银牌。
    // 若常规判定本来就是普通（如无邀请码、或积分不到银牌线），结果仍是普通 —— 这不是没生效。
    for (const t of saved) {
      const regularSilver = t.points >= f.silverLine && (t.age >= 18 || t.invite);
      if (!regularSilver) continue; // 常规就是普通，观察不到封顶
      assert.equal(
        o.levels[t.name],
        '银牌',
        `D04 seed=${seed} 例外一的例外没有封顶到银牌：${t.name} 实际 ${o.levels[t.name]}`,
      );
    }
    // 同时必须有人掉进例外一（年龄<18 但不满足老会员条件）
    const dropped = f.tiers.filter((t) => t.age < 18 && !(t.years >= 5 && t.active));
    for (const t of dropped) {
      assert.equal(o.levels[t.name], '普通', `D04 seed=${seed} 例外一没有生效：${t.name} 应为普通`);
    }
  }
  assert.ok(chainSeeds.length >= 3, `只找到 ${chainSeeds.length} 个包含例外链的 seed，样本不足`);

  // 还必须真的存在「被封顶」的样本：常规判定 ≥ 银牌、年龄<18、年数≥5、活跃
  let cappedSample = 0;
  for (let i = 0; i < 40; i++) {
    const seed = `d04-chain-${i}`;
    const f = factsOf('D04', seed);
    const o = item('D04').oracle(f);
    for (const t of f.tiers) {
      if (t.age < 18 && t.years >= 5 && t.active && t.points >= f.silverLine && t.invite) {
        cappedSample++;
        assert.equal(o.levels[t.name], '银牌', `seed=${seed} ${t.name} 应被封顶为银牌，实际 ${o.levels[t.name]}`);
      }
    }
  }
  assert.ok(cappedSample >= 3, `「例外一的例外」封顶样本只有 ${cappedSample} 个，考点没被真正覆盖`);
});

test('D04：把「例外一的例外」当成普通处理（忽略老会员豁免）必须掉分', () => {
  const seed = 'hand-d04-1';
  const f = factsOf('D04', seed);
  const o = item('D04').oracle(f);
  // 人为把所有 age<18 的人一律降为普通，模拟「只看到例外一、没看到例外一的例外」
  const naive = {};
  for (const t of f.tiers) naive[t.name] = (t.age < 18 && o.levels[t.name] !== '普通') ? '普通' : o.levels[t.name];
  const naiveCounts = { diamond: 0, platinum: 0, gold: 0, silver: 0, normal: 0 };
  const KEY = { 钻石: 'diamond', 白金: 'platinum', 金牌: 'gold', 银牌: 'silver', 普通: 'normal' };
  for (const t of f.tiers) naiveCounts[KEY[naive[t.name]]]++;
  const r = gradeOf('D04', seed, { levels: naive, counts: naiveCounts });
  assert.ok(r.awarded < 9, 'D04 漏看「例外一的例外」竟然还满分');
  assert.equal(r.checks.find((c) => c.criterionId === 'D04.C1').passed, false, 'D04.C1 应判为不通过');
});

test('D04：把「例外一的例外」当成完全豁免（不封顶银牌）必须掉分', () => {
  const seed = 'hand-d04-1';
  const f = factsOf('D04', seed);
  const o = item('D04').oracle(f);
  // 人为让老会员按常规规则判、不封顶：把已是银牌的人抬回其常规判定等级
  const KEY = { 钻石: 'diamond', 白金: 'platinum', 金牌: 'gold', 银牌: 'silver', 普通: 'normal' };
  const uncapped = {};
  for (const t of f.tiers) {
    let lv = o.levels[t.name];
    if (t.age < 18 && t.years >= 5 && t.active && lv === '银牌') {
      if (t.points >= f.diamondLine && t.active && t.years >= 3) lv = '钻石';
      else if (t.points >= f.platinumLine && t.active && t.invite && t.years >= 2) lv = '白金';
      else if (t.points >= f.goldLine && t.active && t.age >= 20) lv = '金牌';
    }
    uncapped[t.name] = lv;
  }
  const capped = Object.values(o.levels).filter((x) => x === '银牌').length;
  const uncappedSilver = Object.values(uncapped).filter((x) => x === '银牌').length;
  const changed = Object.keys(uncapped).some((k) => uncapped[k] !== o.levels[k]);
  assert.ok(changed, '构造的「不封顶」答案与标准答案没有差异，封顶规则不可能被检验');
  const counts = { diamond: 0, platinum: 0, gold: 0, silver: 0, normal: 0 };
  for (const t of f.tiers) counts[KEY[uncapped[t.name]]]++;
  const r = gradeOf('D04', seed, { levels: uncapped, counts });
  assert.ok(r.awarded < 9, `D04 把封顶规则漏掉竟然还满分（银牌 ${capped} → ${uncappedSilver}）`);
});

/* ================================================================== *
 * 附加：判分器不得因垃圾输入而抛错
 * ================================================================== */

test('D01-D04：grade() 遇到垃圾输入不得抛错', () => {
  const garbage = [null, undefined, '', '???', 'asdkjhqwe@@@!!!', [], {}, 42, { list: null }, { levels: 'x', counts: [] }];
  for (const id of IDS) {
    const it = item(id);
    const internal = instantiateInternal(it, 'garbage-probe');
    for (const g of garbage) {
      assert.doesNotThrow(() => it.grade({ fields: {} }, internal.facts), `${id} grade 空字段抛错`);
      assert.doesNotThrow(() => gradeItem(internal, g, { seed: 'garbage-probe' }), `${id} gradeItem(${JSON.stringify(g)}) 抛错`);
    }
  }
});
