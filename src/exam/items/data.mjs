/**
 * 信息整理维度（data）—— D01 / D02 / D03 / D04
 * 合计 4 + 6 + 6 + 9 = 25 分
 *
 * 难度设计原则（2026-10 改造）：
 *   - 数据量与干扰项必须真实存在，靠「扫一眼」会漏项；
 *   - 每题至少一处「必须逐行/逐项处理」的结构，不能靠单点判断通吃；
 *   - 判分只看结论字段，不看我心里想的推理过程。
 */
import { makeRng } from '../rng.mjs';
import { toNumber, squash, normText, sameSet } from '../../grading/parse.mjs';

const DIM = 'data';

/** 名称归一：NFKC（全角转半角）+ 去掉所有空白 + 小写 */
function nameKey(v) {
  return String(v).normalize('NFKC').replace(/\s+/g, '').toLowerCase();
}

/* ============================== D01 · 4 分 ============================== */
/**
 * 去重 + 两键排序。
 * 干扰机制：
 *   1) 三十来行登记，含空行、全角空格、全角字母、大小写混写、前后空格；
 *   2) 同一摊位用不同写法重复登记 3~4 次，必须归一后去重；
 *   3) 存在「只差一个字」的两个不同摊位（苏州一店 / 苏州二店），不能合并；
 *   4) 分区代号与摊位序号是多对一且乱序映射，序号相同的必须再按名录序号做第二键。
 */
const D01_SHOPS = [
  { brand: 'Lumo', label: '杭州店', zone: 'S1', no: 5 },
  { brand: 'Pine', label: '南京店', zone: 'S2', no: 3 },
  { brand: 'Nova', label: '苏州一店', zone: 'S3', no: 7 },
  { brand: 'Orchid', label: '合肥店', zone: 'S4', no: 2 },
  { brand: 'Quill', label: '宁波店', zone: 'S5', no: 9 },
  { brand: 'Vela', label: '常州店', zone: 'S6', no: 4 },
  { brand: 'Nova', label: '苏州二店', zone: 'S4', no: 1 },
  { brand: 'Rune', label: '无锡店', zone: 'S1', no: 8 },
];

const D01 = {
  id: 'D01',
  dimension: DIM,
  difficulty: 'easy',
  points: 4,
  batch: 1,
  title: '去重并按规定排序',
  generate(seed) {
    const rng = makeRng(`${seed}#D01`);
    const shops = D01_SHOPS.map((s) => ({
      ...s,
      name: `${s.brand} ${s.label}`,
    }));

    // 本 seed 只登记了其中一部分摊位：没出现的摊位不得进名单
    const present = rng.sample(shops, rng.int(5, 7));
    const presentNames = new Set(present.map((s) => s.name));
    // 苏州一店 / 苏州二店 是「只差一个字」的成对陷阱，必须同进同出
    const twinA = 'Nova 苏州一店';
    const twinB = 'Nova 苏州二店';
    if (presentNames.has(twinA) !== presentNames.has(twinB)) {
      const twin = shops.find((s) => s.name === (presentNames.has(twinA) ? twinB : twinA));
      if (present.length < 7) present.push(twin);
      else present.pop(), present.push(twin);
      presentNames.add(twin.name);
    }
    const active = shops.filter((s) => presentNames.has(s.name));

    // 分区代号 → 摊位序号：6 个分区映射到 3 个序号（每个序号两个分区），
    // 保证「序号相同、必须用名录序号做第二键」的情况一定出现。
    const zones = ['S1', 'S2', 'S3', 'S4', 'S5', 'S6'];
    const perm = rng.shuffle([1, 1, 2, 2, 3, 3]);
    const seqOfZone = {};
    zones.forEach((z, i) => { seqOfZone[z] = perm[i]; });

    // 排序键：摊位序号 * 1000 + 名录序号（名录序号两两不同，第二键永远不会并列）
    const codes = {};
    for (const s of shops) {
      codes[s.name] = seqOfZone[s.zone] * 1000 + s.no;
    }

    // 原始登记行：每个摊位 3~4 次，每次换一种「脏写法」
    const lines = [];
    for (const s of active) {
      const times = rng.int(3, 4);
      for (let k = 0; k < times; k++) {
        const style = rng.int(0, 5);
        let txt = s.name;
        if (style === 1) txt = s.name.toUpperCase();                       // 全大写
        else if (style === 2) txt = s.name.toLowerCase();                  // 全小写
        else if (style === 3) txt = s.name.replace(' ', '\u3000');         // 全角空格
        else if (style === 4) txt = `  ${s.name}  `;                       // 前后空格
        else if (style === 5) txt = s.name.replace(/[A-Za-z]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0xfee0)); // 全角字母
        lines.push({ raw: txt, name: s.name });
      }
    }
    // 打乱后插入空行
    const rows = rng.shuffle(lines);
    const withBlanks = [];
    for (const r of rows) withBlanks.push(r);
    for (let k = 0; k < 3; k++) withBlanks.splice(rng.int(0, withBlanks.length), 0, { raw: '', name: null });

    const display = withBlanks.map((r) => r.raw);
    const rawList = withBlanks.filter((r) => r.name).map((r) => r.name);

    const seqTable = rng.shuffle(zones).map((z) => `${z}｜${seqOfZone[z]}`);
    const roster = shops.map((s) => `${s.name}｜${s.zone}｜${s.no}`);
    const prompt = [
      '「青禾市集」的摊位登记表是手工录入的，同一摊位被反复登记，还混进了空行与全角字符。',
      '请把它整理成一份干净的名单。',
      '',
      '摊位名录（正式名称｜所属分区｜名录序号，名单里只能出现本表内的摊位）：',
      ...roster,
      '',
      '原始登记（按登记先后逐行抄录，空白行也是其中一条记录）：',
      ...display,
      '',
      '分区序号对照表（分区代号｜摊位序号）：',
      seqTable.join('\n'),
      '',
      '整理规则：',
      '1) 名称比对时忽略大小写与空格（半角空格、全角空格、全角字母都按半角算）；指向名录中同一摊位的重复登记只保留一条；',
      '2) 名录里名称相近但分区不同的，是两个不同摊位，必须分别保留；',
      '3) 原始登记里没出现过的摊位，不得写进名单；',
      '4) 名单先按「该摊位的分区在对照表里的摊位序号」从小到大排；摊位序号相同的，再按名录序号从小到大排。',
      '',
      '请输出整理后的名单，使用名录里的正式名称。',
      '只输出一个 JSON 对象：',
      '{"list":["<正式名称>","<正式名称>"]}',
    ].join('\n');

    return {
      prompt,
      facts: { shops, rawList, codes, display, seqOfZone, roster, activeNames: active.map((s) => s.name) },
      schema: { list: { type: 'list', aliases: ['list', '名单', 'result', '整理后名单', '摊位'] } },
      publicCriteria: [
        { id: 'D01.C1', points: 1, text: '重复项已去掉，且没有漏掉任何不同名称' },
        { id: 'D01.C2', points: 3, text: '顺序与摊位序号、名录序号的规定完全一致' },
      ],
    };
  },
  oracle(facts) {
    const codes = facts.codes;
    const uniq = [...new Set(facts.rawList)];
    const sorted = uniq.slice().sort((a, b) => (codes[a] - codes[b]) || a.localeCompare(b, 'zh-Hans-CN'));
    return { unique: sorted, codes };
  },
  grade(parsed, facts) {
    const o = D01.oracle(facts);
    const got = parsed.fields.list || [];
    const norm = (x) => nameKey(squash(x)).replace(/[「」『』"']/g, '');
    const gotNorm = got.map(norm);
    const expNorm = o.unique.map(norm);
    const setOk = gotNorm.length === expNorm.length
      && expNorm.every((x) => gotNorm.includes(x))
      && new Set(gotNorm).size === gotNorm.length;
    const orderOk = gotNorm.length === expNorm.length && gotNorm.every((x, i) => x === expNorm[i]);
    const checks = [];
    checks.push({
      criterionId: 'D01.C1',
      points: 1,
      passed: setOk,
      reason: got.length === 0
        ? '未解析出 list 名单'
        : setOk
          ? `去重正确，共 ${gotNorm.length} 个不同摊位`
          : `名单集合不正确：期望 ${expNorm.length} 个不同摊位，实际 ${new Set(gotNorm).size} 个`,
    });
    checks.push({
      criterionId: 'D01.C2',
      points: 3,
      passed: orderOk,
      reason: orderOk ? '排序与规定完全一致' : `排序应为 ${expNorm.join('、')}，实际为 ${gotNorm.join('、') || '（空）'}`,
    });
    return checks;
  },
  fallback(raw) {
    if (typeof raw !== 'string') return null;
    const m = raw.match(/(?:list|名单|整理后)[^\[]*(\[[\s\S]*?\])/);
    if (!m) return null;
    try {
      const arr = JSON.parse(m[1].normalize('NFKC'));
      if (Array.isArray(arr)) return { fields: { list: arr }, source: 'prose', problems: [] };
    } catch { /* ignore */ }
    return null;
  },
};

/* ============================== D02 · 6 分 ============================== */
/**
 * 台账核对：事实（已入账的实际支出） vs 干扰（预算数、未入账的预计数）。
 * 干扰机制：
 *   1) 台账 10 行，行序打乱，必须按项目分组累加；
 *   2) 「预算」与「实际支出」并列，且甲项目的预算合计恒小于乙 —— 直接比预算会给出稳定错误答案；
 *   3) 部分月份实际支出超过预算（超支），「预算更好看」不等于「实际更省」；
 *   4) 信息不足分支里，缺失的那一行备注栏写着「预计 xx 万元（尚未入账）」——把它当实际支出就会算出一个具体数字，从而错答 A/B。
 */
const D02_MONTHS = ['一月', '二月', '三月', '四月', '五月'];

function splitTotal(total, n, rng) {
  for (let attempt = 0; attempt < 40; attempt++) {
    const base = Math.floor(total / n);
    const parts = [];
    let used = 0;
    for (let i = 0; i < n - 1; i++) {
      const p = base + rng.int(-4, 4);
      parts.push(p);
      used += p;
    }
    parts.push(total - used);
    if (parts.every((p) => p >= 1)) return parts;
  }
  const base = Math.floor(total / n);
  return Array.from({ length: n }, (_, i) => (i === n - 1 ? total - base * (n - 1) : base));
}

const D02 = {
  id: 'D02',
  dimension: DIM,
  difficulty: 'standard',
  points: 6,
  batch: 2,
  title: '区分事实、推断与信息不足',
  generate(seed) {
    const rng = makeRng(`${seed}#D02`);
    // 三类答案各约 1/3：A（甲累计实际更少）、B（甲累计实际更多）、C（有关键行没入账 → 信息不足）
    const mode = rng.int(0, 2);
    const aGiven = mode !== 2;

    // 预算陷阱的方向必须随机：若甲的预算恒小于乙，则「拿预算比一比」恒得 A，
    // 这题就退化成「看到预算就选 A」，等于送分。这里让预算与实际的相对大小互相打对台。
    const budgetALower = rng.next() < 0.5;
    const budgetA = budgetALower ? D02_MONTHS.map(() => rng.int(26, 32)) : D02_MONTHS.map(() => rng.int(38, 46));
    const budgetB = budgetALower ? D02_MONTHS.map(() => rng.int(38, 46)) : D02_MONTHS.map(() => rng.int(26, 32));
    const totalBudgetA = budgetA.reduce((x, y) => x + y, 0);
    const totalBudgetB = budgetB.reduce((x, y) => x + y, 0);

    const totalB = rng.int(150, 220);
    const actualB = splitTotal(totalB, D02_MONTHS.length, rng);

    const margin = rng.int(4, 28);
    const totalA = mode === 0 ? totalB - margin : mode === 1 ? totalB + margin : totalB + rng.int(-8, 8);
    const actualA = splitTotal(totalA, D02_MONTHS.length, rng);

    // 信息不足分支：抹掉甲的一行实际支出，备注里放一个「预计」数字当诱饵。
    // 诱饵方向随机：若把预计当实际，可能刚好答成 A、也可能答成 B —— 两个错答都要能被抓住。
    let missingIdx = -1;
    let estimate = null;
    if (!aGiven) {
      missingIdx = rng.int(0, D02_MONTHS.length - 1);
      const knownA = totalA - actualA[missingIdx];
      const wantNaive = rng.next() < 0.5 ? 'A' : 'B';
      // 让 已知部分 + 预计 与 乙合计 的比较结果落在想要的方向上
      const target = wantNaive === 'A' ? totalB - rng.int(6, 25) : totalB + rng.int(6, 25);
      estimate = Math.max(1, target - knownA);
    }

    const rows = [];
    D02_MONTHS.forEach((m, i) => {
      rows.push({ month: m, project: '甲', budget: budgetA[i], actual: aGiven || i !== missingIdx ? actualA[i] : null, note: '' });
      rows.push({ month: m, project: '乙', budget: budgetB[i], actual: actualB[i], note: i === 2 ? '含税' : '' });
    });
    if (!aGiven) {
      const idx = rows.findIndex((r) => r.project === '甲' && r.month === D02_MONTHS[missingIdx]);
      rows[idx].note = `预计 ${estimate} 万元，尚未入账`;
    }
    const shuffled = rng.shuffle(rows);

    const projectA_Final = aGiven ? actualA.reduce((x, y) => x + y, 0) : null;
    const projectB_Final = actualB.reduce((x, y) => x + y, 0);
    const facts = {
      projectA_Budget: totalBudgetA,
      projectB_Budget: totalBudgetB,
      projectB_Final,
      projectA_Final,
      aGiven,
      rows: shuffled,
      missingMonth: aGiven ? null : D02_MONTHS[missingIdx],
    };

    const table = shuffled.map((r) => `- ${r.month}｜${r.project}｜预算 ${r.budget} 万元｜实际支出 ${r.actual === null ? '（空白）' : `${r.actual} 万元`}｜备注 ${r.note || '—'}`);
    const prompt = [
      '财务在核对「甲项目」与「乙项目」的一份季度台账。',
      '台账每一行是一个项目某个月的记录：「预算」是计划数，「实际支出」是已经入账的发生数，两者不能混用。',
      '',
      '台账（行序已被打乱）：',
      ...table,
      '',
      '说明：备注栏里以「预计」「预估」「尚待补录」开头的数字都还没有入账，不能计入实际支出。',
      '',
      '问题：截至台账最后一个月，甲项目的累计实际支出，是否比乙项目的累计实际支出少？',
      '',
      '请先判断这个问题属于哪一类，并说明依据。可选类别：',
      'A. 是（甲累计实际支出更少）',
      'B. 否（甲累计实际支出更多）',
      'C. 信息不足，无法确定',
      '',
      '请写选项字母或选项原文，不要写成含糊措辞。',
      '只输出一个 JSON 对象：',
      '{"answer":"<A|B|C>","reason":"用一句话说明依据（引用合计数字，或指出缺哪一行）"}',
    ].join('\n');

    return {
      prompt,
      facts,
      schema: {
        answer: { type: 'text', aliases: ['answer', '答案', '结论', 'choice'] },
        reason: { type: 'text', aliases: ['reason', '理由', '依据', 'explanation'] },
      },
      publicCriteria: [
        { id: 'D02.C1', points: 2, text: '结论与台账中的实际支出合计一致' },
        { id: 'D02.C2', points: 2, text: '依据与结论一致：要么引用双方实际支出合计并给出正确方向，要么指出缺口在哪一行' },
        { id: 'D02.C3', points: 2, text: '没有把预算数或未入账的估计值当成实际支出' },
      ],
    };
  },
  oracle(facts) {
    if (facts.aGiven) {
      const less = facts.projectA_Final < facts.projectB_Final;
      return {
        answer: less ? 'A' : 'B',
        keyTerms: [],
        sampleB: facts.projectB_Final,
        sampleA: facts.projectA_Final,
        aGiven: true,
        requiresNumbers: [facts.projectA_Final, facts.projectB_Final],
        directionWords: less ? ['少', '低', '省', '小'] : ['多', '高', '不省', '大'],
      };
    }
    return {
      answer: 'C',
      keyTerms: ['缺失', '没有给出', '未给出', '没给', '未知', '不确定', '无法确定', '未提供', '空白', '空缺', '没写', '未填', '尚未入账'],
      sampleB: facts.projectB_Final,
      sampleA: facts.projectA_Budget,
      aGiven: false,
    };
  },
  grade(parsed, facts) {
    const o = D02.oracle(facts);
    const rawAnswer = parsed.fields.answer ? squash(parsed.fields.answer).toUpperCase() : null;
    const letterMatch = rawAnswer ? rawAnswer.match(/^([ABC])(?:[（(【\[][^）)】\]]*[）)】\]])?$/) : null;
    const letter = letterMatch ? letterMatch[1] : null;
    const isInsufficient = /信息不足|无法确定|不能确定|不确定|unknown|insufficient/.test(rawAnswer || '');
    const ansOk = o.answer === 'C'
      ? (letter === 'C' || (letter === null && isInsufficient))
      : letter === o.answer;
    const contradictory = rawAnswer !== null && (/[AB]/.test(rawAnswer) && /C/.test(rawAnswer));
    const reason = parsed.fields.reason ? squash(parsed.fields.reason) : '';
    const checks = [];
    checks.push({
      criterionId: 'D02.C1',
      points: 2,
      passed: ansOk && !contradictory,
      reason: !rawAnswer
        ? '未解析出 answer 字段'
        : contradictory
          ? `答案自相矛盾：「${parsed.fields.answer}」`
          : ansOk
            ? (o.answer === 'C' ? '正确判为信息不足（C）' : `正确判为 ${o.answer}`)
            : `答案应为 ${o.answer}，实际为「${parsed.fields.answer}」`,
    });
    let reasonHasTerm;
    let c2Reason;
    if (!reason) {
      reasonHasTerm = false;
      c2Reason = '未解析出 reason 字段';
    } else if (o.aGiven) {
      const hasA = reason.includes(String(o.requiresNumbers[0]));
      const hasB = reason.includes(String(o.requiresNumbers[1]));
      const rightDir = o.directionWords.some((w) => reason.includes(w));
      reasonHasTerm = hasA && hasB && rightDir;
      c2Reason = reasonHasTerm
        ? `理由引用了两个实际支出合计（${o.requiresNumbers[0]} / ${o.requiresNumbers[1]}）并给出正确方向`
        : `理由必须同时引用甲(${o.requiresNumbers[0]})、乙(${o.requiresNumbers[1]})的实际支出合计并说明方向；实际为「${reason.slice(0, 60)}」`;
    } else {
      const rc = squash(reason);
      const mentionsJia = /甲/.test(rc);
      const mentionsFinal = /最终支出|实际支出|支出|这一栏|那一栏|该栏|此栏|台账|记录/.test(rc);
      const mentionsMissing = o.keyTerms.some((t) => rc.includes(squash(t)));
      reasonHasTerm = mentionsJia && mentionsFinal && mentionsMissing;
      c2Reason = reasonHasTerm
        ? '理由明确指出「甲」有一行的实际支出缺口'
        : `理由必须同时指出是「甲」的「实际支出」缺失（当前：甲=${mentionsJia}，实际支出=${mentionsFinal}，缺失词=${mentionsMissing}）`;
    }
    checks.push({ criterionId: 'D02.C2', points: 2, passed: reasonHasTerm, reason: c2Reason });

    const budgetNum = new RegExp(`(?:^|[^0-9])${String(facts.projectA_Budget)}(?![0-9])`, 'u');
    const mentionsBudgetNumber = budgetNum.test(reason);
    const hasCompare = /(?:更省|省钱|少于|低于|不省|高于|多于)/.test(reason);
    const hedged = /无法|不能|不确定|未知|难以|没有给出|缺失|不足|空白|尚未入账/.test(reason);
    if (o.aGiven) {
      const budgetDiffersFromActual = facts.projectA_Budget !== facts.projectA_Final;
      const usedBudgetAsFinal = budgetDiffersFromActual && mentionsBudgetNumber && !reason.includes(String(facts.projectA_Final));
      const falselyClaimsMissing = /没有给出|缺失|未知|不确定|无法确定|空白|空缺|尚未入账/.test(reason);
      checks.push({
        criterionId: 'D02.C3',
        points: 2,
        passed: ansOk && !contradictory && !usedBudgetAsFinal && !falselyClaimsMissing,
        reason: !ansOk
          ? '结论本身错误，无法通过此项'
          : contradictory
            ? '答案自相矛盾'
            : falselyClaimsMissing
              ? '理由声称某行实际支出缺失，但本题台账是完整的'
              : usedBudgetAsFinal
                ? '把预算数当成了实际支出合计'
                : '正确使用实际支出合计，没有把预算当支出',
      });
    } else {
      const misCompare = mentionsBudgetNumber && hasCompare && !hedged;
      checks.push({
        criterionId: 'D02.C3',
        points: 2,
        passed: ansOk && !contradictory && !misCompare,
        reason: !ansOk
          ? '结论本身错误，无法通过此项'
          : contradictory
            ? '答案自相矛盾'
            : misCompare
              ? '把预算数直接当作实际支出进行比较'
              : '没有把预算当作实际支出',
      });
    }
    return checks;
  },
  fallback(raw) {
    if (typeof raw !== 'string') return null;
    const s = squash(raw);
    const fields = {};
    if (/(?:^|[^A-Z])C(?:[^A-Z]|$)|信息不足|无法确定|不能确定|不确定/i.test(s)) fields.answer = 'C';
    else if (/A|是|更省钱/.test(s)) fields.answer = 'A';
    else if (/B|否/.test(s)) fields.answer = 'B';
    if (fields.answer !== undefined) {
      const txt = normText(raw);
      if (txt && /[一-龥]/.test(txt)) fields.reason = txt.slice(0, 200);
    }
    return Object.keys(fields).length ? { fields, source: 'prose', problems: [] } : null;
  },
};

/* ============================== D03 · 6 分 ============================== */
/**
 * 两表核对。干扰机制：
 *   1) 供应商 13~14 个 SKU，门店 15~17 行，靠肉眼扫一定会漏；
 *   2) 门店表多一列「档案价」，它与进价不同；拿档案价去比会得到另一套亏本清单；
 *   3) SKU 编码相似、仓库名几乎一样（A-101 苏州仓 / A-110 苏州仓北），按名称对齐会对错行；
 *   4) 门店编码故意写小写，按编码对齐需要大小写归一。
 */
const D03_CATALOG = [
  { sku: 'A-101', name: '苏州仓', twin: 'T1' },
  { sku: 'A-110', name: '苏州仓', twin: 'T1' },   // 与 A-101 同名不同码：按名称对齐必错
  { sku: 'B-207', name: '杭州仓' },
  { sku: 'B-270', name: '杭州仓西' },
  { sku: 'C-315', name: '宁波仓' },
  { sku: 'C-351', name: '宁波仓南' },
  { sku: 'D-402', name: '合肥仓', twin: 'T2' },
  { sku: 'D-420', name: '合肥仓', twin: 'T2' },   // 第二对同名不同码
  { sku: 'E-518', name: '无锡仓' },
  { sku: 'E-581', name: '无锡仓西' },
  { sku: 'F-604', name: '常州仓' },
  { sku: 'F-640', name: '常州仓北' },
  { sku: 'G-721', name: '南通仓' },
  { sku: 'G-712', name: '南通仓南' },
  { sku: 'H-834', name: '徐州仓' },
  { sku: 'H-843', name: '徐州仓东' },
];

const D03 = {
  id: 'D03',
  dimension: DIM,
  difficulty: 'standard',
  points: 6,
  batch: 3,
  title: '两表合并与冲突检测',
  generate(seed) {
    const rng = makeRng(`${seed}#D03`);
    const supplierCount = rng.int(13, 14);
    const pickedRaw = rng.sample(D03_CATALOG, supplierCount);
    // 同名不同码的成对 SKU 必须同进同出，否则「按名称对齐会错」这个陷阱在某些 seed 上根本不出现
    const pickedSkus = new Set(pickedRaw.map((c) => c.sku));
    const picked = [...pickedRaw];
    for (const twin of ['T1', 'T2']) {
      const group = D03_CATALOG.filter((c) => c.twin === twin);
      const hit = group.filter((c) => pickedSkus.has(c.sku));
      if (hit.length === 1) {
        const missing = group.find((c) => !pickedSkus.has(c.sku));
        // 用缺失的那一个替换掉一个「非成对」的 SKU，保持总数不变
        const spare = picked.findIndex((c) => !c.twin);
        if (spare >= 0) { pickedSkus.delete(picked[spare].sku); picked[spare] = missing; pickedSkus.add(missing.sku); }
      }
    }
    const supplier = picked.map((c) => {
      const price = rng.int(20, 90);
      return { sku: c.sku, name: c.name, price, listPrice: price - rng.int(3, 15) };
    });
    const supBy = new Map(supplier.map((s) => [s.sku, s]));

    // 亏本 3~4 个：售价 < 进价
    const lossCount = rng.int(3, 4);
    const lossIdx = new Set(rng.sample([...Array(supplierCount).keys()], lossCount));
    // 档案价陷阱必须**每次**都改变结论，否则「用档案价比」会碰巧得到同一个清单，陷阱失效。
    // 做法：让每个 SKU 的档案价与进价的大小关系，与售价和进价的大小关系**正好相反**。
    //   - 亏本 SKU：售价 < 进价，则档案价定在进价之上（按档案价判 → 不亏本，漏掉）
    //   - 正常 SKU：售价 ≥ 进价，则档案价定在进价之下（按档案价判 → 亏本，多报）
    const storeRows = supplier.map((s, i) => {
      const isLoss = lossIdx.has(i);
      const price = isLoss ? s.price - rng.int(1, 12) : s.price + rng.int(4, 25);
      const listPrice = isLoss ? s.price + rng.int(1, 9) : Math.max(1, s.price - rng.int(1, Math.min(9, s.price - 1)));
      return { sku: s.sku, name: s.name, price, listPrice };
    });

    // 仅门店 2~3 个
    const unused = D03_CATALOG.filter((c) => !supBy.has(c.sku));
    const onlyCount = rng.int(2, 3);
    const onlyPicked = rng.sample(unused, Math.min(onlyCount, unused.length));
    for (const c of onlyPicked) {
      const price = rng.int(20, 99);
      storeRows.push({ sku: c.sku, name: c.name, price, listPrice: price + rng.int(0, 5) });
    }

    // 门店编码大小写混写（按编码对齐时需要归一）
    const storeShuffled = rng.shuffle(storeRows).map((r, i) => ({ ...r, sku: i % 2 === 0 ? r.sku.toLowerCase() : r.sku }));
    const supplierShuffled = rng.shuffle(supplier);

    const facts = {
      supplier: supplier.map((s) => ({ sku: s.sku, price: s.price })),
      storePrices: storeRows.map((s) => ({ sku: s.sku, price: s.price })),
      supplierRows: supplier,
      storeRows,
      conflictSkus: supplier.filter((_, i) => lossIdx.has(i)).map((s) => s.sku),
      onlyStoreSkus: onlyPicked.map((c) => c.sku),
    };

    const prompt = [
      '财务要对「供应商报价表」与「门店售价表」做一次核对。',
      '',
      '供应商报价表（SKU｜仓库｜进价 元）：',
      supplierShuffled.map((x) => `${x.sku}｜${x.name}｜${x.price}`).join('\n'),
      '',
      '门店售价表（SKU｜仓库｜售价 元｜档案价 元）：',
      storeShuffled.map((x) => `${x.sku}｜${x.name}｜${x.price}｜${x.listPrice}`).join('\n'),
      '',
      '名词说明：进价是供应商的供货价；售价是门店对外卖价；档案价是门店系统里登记的核定售价，仅作参考。',
      '亏本销售指门店售价低于进价。两张表按 SKU 编码对齐（编码不区分大小写）。',
      '',
      '请完成三件事：',
      '1) 找出「两张表都有，但售价低于进价」的 SKU（亏本销售）；',
      '2) 找出「只在门店表出现、供应商表没有」的 SKU；',
      '3) 给出同时出现在两张表里的 SKU 数量。',
      '',
      '只输出一个 JSON 对象：',
      '{"lossMaking":["<SKU列表>"],"onlyInStore":["<SKU列表>"],"commonCount":<整数>}',
    ].join('\n');

    return {
      prompt,
      facts,
      schema: {
        lossMaking: { type: 'list', aliases: ['lossMaking', '亏本', '亏本销售', 'loss', '售价低于进价'] },
        onlyInStore: { type: 'list', aliases: ['onlyInStore', '只在门店', '仅门店', 'onlyStore', '门店独有'] },
        commonCount: { type: 'number', aliases: ['commonCount', '共同数量', '共有', '交集数量'] },
      },
      publicCriteria: [
        { id: 'D03.C1', points: 2, text: '亏本销售 SKU 清单完全正确' },
        { id: 'D03.C2', points: 2, text: '仅门店有 SKU 清单完全正确' },
        { id: 'D03.C3', points: 2, text: '两表共同的 SKU 数量正确' },
      ],
    };
  },
  oracle(facts) {
    const sup = new Map(facts.supplier.map((x) => [x.sku.toUpperCase(), x.price]));
    const lossMaking = [];
    const onlyInStore = [];
    let commonCount = 0;
    const seen = new Set();
    for (const s of facts.storePrices) {
      const sku = s.sku.toUpperCase();
      if (seen.has(sku)) continue;
      seen.add(sku);
      if (!sup.has(sku)) { onlyInStore.push(sku); continue; }
      commonCount++;
      if (s.price < sup.get(sku)) lossMaking.push(sku);
    }
    return { lossMaking: lossMaking.sort(), onlyInStore: onlyInStore.sort(), commonCount };
  },
  grade(parsed, facts) {
    const o = D03.oracle(facts);
    const normSku = (x) => String(x).normalize('NFKC').toUpperCase().replace(/\s/g, '');
    const lm = (parsed.fields.lossMaking || []).map(normSku);
    const os = (parsed.fields.onlyInStore || []).map(normSku);
    const cc = parsed.fields.commonCount;
    const checks = [];
    const lmOk = sameSet(lm, o.lossMaking, normSku);
    checks.push({
      criterionId: 'D03.C1',
      points: 2,
      passed: lmOk,
      reason: lm.length === 0 && o.lossMaking.length > 0 ? '未解析出 lossMaking 列表' : lmOk ? '亏本 SKU 完全正确' : `亏本 SKU 应为 ${o.lossMaking.join(', ') || '（无）'}，实际为 ${lm.join(', ') || '（空）'}`,
    });
    const osOk = sameSet(os, o.onlyInStore, normSku);
    checks.push({
      criterionId: 'D03.C2',
      points: 2,
      passed: osOk,
      reason: os.length === 0 && o.onlyInStore.length > 0 ? '未解析出 onlyInStore 列表' : osOk ? '仅门店 SKU 完全正确' : `仅门店 SKU 应为 ${o.onlyInStore.join(', ') || '（无）'}，实际为 ${os.join(', ') || '（空）'}`,
    });
    const ccOk = typeof cc === 'number' && cc === o.commonCount;
    checks.push({
      criterionId: 'D03.C3',
      points: 2,
      passed: ccOk,
      reason: cc === undefined || cc === null ? '未提供 commonCount 字段，按不通过处理' : ccOk ? '共同 SKU 数量正确' : `共同数量应为 ${o.commonCount}，实际为 ${cc}`,
    });
    return checks;
  },
  fallback(raw) {
    if (typeof raw !== 'string') return null;
    const s = raw.normalize('NFKC');
    const fields = {};
    const grabSkus = (label) => {
      const m = s.match(new RegExp(`(?:${label})[^\\[]*\\[([^\\]]*)\\]`));
      if (!m) return null;
      return (m[1].match(/[A-Z]-\d{3}/gi) || []).map((x) => x.toUpperCase());
    };
    const lm = grabSkus('lossMaking|亏本');
    const os = grabSkus('onlyInStore|仅门店|只在门店');
    if (lm) fields.lossMaking = lm;
    if (os) fields.onlyInStore = os;
    const cc = s.match(/(?:commonCount|共同|交集)[^0-9]{0,8}(\d+)/);
    if (cc) fields.commonCount = Number(cc[1]);
    return Object.keys(fields).length ? { fields, source: 'prose', problems: [] } : null;
  },
};

/* ============================== D04 · 9 分 ============================== */
/**
 * 规则化条件匹配与例外。干扰机制：
 *   1) 14 人 × 5 个属性（年龄/积分/活跃/邀请码/入会年数），凭印象必然错位；
 *   2) 五个等级，判定有严格优先级：钻石 > 白金 > 金牌 > 银牌 > 普通；
 *   3) 白金要求「有邀请码」与「入会年数」两个条件同时成立，只满足一个会掉到金牌；
 *   4) 例外链：年龄 < 18 一律普通；但「入会年数 ≥ 5 且活跃」的未成年老会员可以撤销该例外，
 *      改按常规规则判，最终等级封顶在银牌 —— 例外之中还有例外，且带封顶；
 *   5) 阈值全部踩边界：积分恰好等于线、比线少 1、年龄恰好 18、恰好 20。
 */
/**
 * D04 的判级规则（**唯一真相源**）。
 *
 * 抽成独立函数的原因：出题时要用它校验「扰动后的画像仍然五级齐备、例外链仍然触发」，
 * 判分时要用它算正确答案。两边各写一遍必然漂移，所以只写一遍。
 *
 * 返回 { lv, capped }：capped 表示这条命中「例外一的例外」的封顶银牌规则。
 */
function d04Classify(t, facts) {
  let lv = '普通';
  if (t.points >= facts.diamondLine && t.active && t.years >= 3) lv = '钻石';
  else if (t.points >= facts.platinumLine && t.active && t.invite && t.years >= 2) lv = '白金';
  else if (t.points >= facts.goldLine && t.active && t.age >= 20) lv = '金牌';
  else if (t.points >= facts.silverLine && t.active && (t.age >= 18 || t.invite)) lv = '银牌';

  let capped = false;
  if (t.age < 18) {
    if (t.years >= 5 && t.active) {
      if (lv === '钻石' || lv === '白金' || lv === '金牌') {
        lv = '银牌';
        capped = true;
      }
    } else {
      lv = '普通';
    }
  }
  return { lv, capped };
}

const D04_ROSTER = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸', '子', '丑', '寅', '卯'];
const D04_LEVELS = ['钻石', '白金', '金牌', '银牌', '普通'];

const D04 = {
  id: 'D04',
  dimension: DIM,
  difficulty: 'challenge',
  points: 9,
  batch: 4,
  title: '规则化条件匹配与例外',
  generate(seed) {
    const rng = makeRng(`${seed}#D04`);
    const silverLine = rng.int(300, 380);
    const goldLine = silverLine + rng.int(150, 220);
    const platinumLine = goldLine + rng.int(200, 280);
    const diamondLine = platinumLine + rng.int(250, 350);
    const names = rng.shuffle(D04_ROSTER);

    // 14 个画像：每个都压在一个具体分支上，改动任一阈值都会让某个画像换级
    const profiles = [
      { age: 22, points: diamondLine, active: true, invite: false, years: 3 },        // 钻石：三条全中
      { age: 22, points: diamondLine + 10, active: true, invite: true, years: 2 },    // 年数不足 3 → 白金
      { age: 21, points: platinumLine, active: true, invite: true, years: 1 },        // 年数不足 2 → 金牌
      { age: 21, points: platinumLine, active: true, invite: false, years: 5 },       // 缺邀请码 → 金牌
      { age: 20, points: goldLine, active: true, invite: true, years: 4 },            // 积分与年龄双卡线 → 金牌
      { age: 19, points: goldLine + 50, active: true, invite: false, years: 0 },      // 差 1 岁到金牌 → 银牌
      { age: 19, points: platinumLine + 50, active: true, invite: false, years: 5 },  // 白金缺邀请码、金牌缺年龄 → 银牌
      { age: 18, points: silverLine, active: true, invite: false, years: 0 },         // 银牌积分卡线 → 银牌
      { age: 25, points: silverLine - 1, active: true, invite: true, years: 0 },      // 差 1 分到银牌 → 普通
      { age: 30, points: diamondLine + 100, active: false, invite: true, years: 6 },  // 不活跃 → 普通
      { age: 17, points: diamondLine + 200, active: true, invite: true, years: 2 },   // 例外一 → 普通
      { age: 16, points: diamondLine + 300, active: true, invite: false, years: 6 },  // 例外一的例外 → 封顶银牌
      { age: 15, points: platinumLine + 50, active: false, invite: false, years: 7 }, // 老会员但不活跃 → 例外一 → 普通
      { age: 17, points: goldLine + 100, active: true, invite: true, years: 5 },      // 例外一的例外 → 常规为银牌，封顶银牌
    ];
    // ---- 按 seed 扰动画像属性，让「各等级人数」随 seed 变化 ----
    //
    // 为什么必须扰动：上面 14 个画像是写死的，判级只依赖相对阈值，
    // 所以每个 seed 的分布恒为 钻石1/白金1/金牌3/银牌5/普通4。
    // 后果是考生**不用读题**，只要记住这 5 个数字就能通过 D04.C2（3 分）和
    // D04.C3（3 分）—— 实测 20/20 个 seed 全过，6/9 分白送。
    //
    // 但扰动不能乱来：必须保证「五个等级都有人」和「例外链真的触发」，
    // 否则统计项会退化、例外链考点会消失。所以每次扰动后用 d04Classify 校验，
    // 不满足就换一组扰动重试。
    const thresholds = { goldLine, silverLine, platinumLine, diamondLine };
    const validDistribution = (trial) => {
      const withNames = trial.map((p, i) => ({ name: names[i], ...p }));
      const res = withNames.map((t) => d04Classify(t, thresholds));
      const present = new Set(res.map((r) => r.lv));
      const cappedCount = res.filter((r) => r.capped).length;
      return present.size === 5 && cappedCount >= 1;
    };

    let chosenProfiles = null;
    for (let attempt = 0; attempt < 40 && !chosenProfiles; attempt++) {
      const trial = profiles.map((p) => ({ ...p }));
      const n = rng.int(3, 6);
      for (let k = 0; k < n; k++) {
        const p = trial[rng.int(0, trial.length - 1)];
        const kind = rng.int(0, 2);
        if (kind === 0) p.years = Math.max(0, Math.min(10, p.years + rng.pick([-1, 1])));
        else if (kind === 1) p.invite = !p.invite;
        else p.active = !p.active;
      }
      if (validDistribution(trial)) chosenProfiles = trial;
    }
    // 兜底：扰动全部不合法就用原始画像（分布虽恒定，但不会出坏题）
    const finalProfiles = chosenProfiles || profiles.map((p) => ({ ...p }));
    const tiers = finalProfiles.map((p, i) => ({ name: names[i], ...p }));

    const facts = { tiers, goldLine, silverLine, platinumLine, diamondLine };
    const table = tiers
      .map((t) => `- ${t.name}：年龄 ${t.age} 岁｜积分 ${t.points}｜近一年活跃=${t.active ? '是' : '否'}｜有邀请码=${t.invite ? '是' : '否'}｜入会年数 ${t.years} 年`)
      .join('\n');

    const prompt = [
      '你是「山岚健身」的会员等级审核员，本次待审 14 人：',
      table,
      '',
      '常规等级规则（自上而下判断，命中第一条即停止）：',
      `1) 钻石：积分 ≥ ${diamondLine}，且近一年活跃=是，且入会年数 ≥ 3 年；`,
      `2) 白金：积分 ≥ ${platinumLine}，且近一年活跃=是，且「有邀请码=是」与「入会年数 ≥ 2 年」两个条件同时成立；`,
      `3) 金牌：积分 ≥ ${goldLine}，且近一年活跃=是，且年龄 ≥ 20 岁；`,
      `4) 银牌：积分 ≥ ${silverLine}，且近一年活跃=是，且（年龄 ≥ 18 岁 或 有邀请码=是）；`,
      '5) 普通：以上四条都不满足。',
      '',
      '例外条款（优先级高于常规规则，按下面的顺序处理）：',
      '例外一：年龄 < 18 岁的人，直接判为普通，不再看常规规则。',
      '例外一的例外：年龄 < 18 岁，但「入会年数 ≥ 5 年」且「近一年活跃=是」的人，不适用例外一；',
      '　　改为按常规规则判定，但最终等级最高只记到银牌（若常规判定为钻石、白金或金牌，一律记为银牌）。',
      '',
      '请给出每个人的最终等级，并统计钻石、白金、金牌、银牌、普通各有多少人。',
      '只输出一个 JSON 对象：',
      '{"levels":{"<姓名>":"<钻石|白金|金牌|银牌|普通>"},'
        + '"counts":{"diamond":<钻石人数>,"platinum":<白金人数>,"gold":<金牌人数>,"silver":<银牌人数>,"normal":<普通人数>}}',
      '（上面只示范结构，14 个人各是什么等级要自己按规则判，五个计数要与等级一致。）',
    ].join('\n');

    return {
      prompt,
      facts,
      schema: {
        levels: { type: 'object', aliases: ['levels', '等级', 'members', '结果'] },
        counts: { type: 'object', aliases: ['counts', '统计', '数量'] },
      },
      publicCriteria: [
        { id: 'D04.C1', points: 3, text: '每个人的等级判定全部正确' },
        { id: 'D04.C2', points: 3, text: '钻石、白金、金牌、银牌四种等级的人数统计全部正确' },
        { id: 'D04.C3', points: 3, text: '普通人数统计正确，且五项合计与总人数自洽' },
      ],
      answerStyle: 'nestedMaps',
    };
  },
  oracle(facts) {
    const levels = {};
    const counts = { diamond: 0, platinum: 0, gold: 0, silver: 0, normal: 0 };
    const KEY = { 钻石: 'diamond', 白金: 'platinum', 金牌: 'gold', 银牌: 'silver', 普通: 'normal' };
    for (const t of facts.tiers) {
      const { lv } = d04Classify(t, facts);
      levels[t.name] = lv;
      counts[KEY[lv]]++;
    }
    return { levels, counts };
  },
  grade(parsed, facts) {
    const o = D04.oracle(facts);
    const levels = parsed.fields.levels || {};
    const counts = parsed.fields.counts || {};
    const ALIAS = {
      钻石: ['钻石级', '钻', 'diamond'],
      白金: ['白金级', '铂金', '铂', 'platinum'],
      金牌: ['金牌级', '金', 'gold'],
      银牌: ['银牌级', '银', 'silver'],
      普通: ['普通级', '无', 'normal'],
    };
    const normLevel = (v) => {
      const s = squash(v);
      if (!s) return null;
      for (const [k, alts] of Object.entries(ALIAS)) {
        if (s === squash(k) || alts.some((a) => s === squash(a))) return k;
      }
      return s;
    };
    let right = 0;
    const wrong = [];
    for (const t of facts.tiers) {
      const key = Object.keys(levels).find((k) => squash(k) === squash(t.name));
      const got = key ? normLevel(levels[key]) : null;
      if (got === o.levels[t.name]) right++;
      else wrong.push(`${t.name}(应为${o.levels[t.name]}，实际${got ?? '缺失'})`);
    }
    const checks = [];
    checks.push({
      criterionId: 'D04.C1',
      points: 3,
      passed: right === facts.tiers.length,
      reason: right === facts.tiers.length ? `${facts.tiers.length} 人等级全部正确` : `${right}/${facts.tiers.length} 人正确；${wrong.join('，')}`,
    });
    const pick = (obj, keys) => {
      for (const k of Object.keys(obj)) {
        if (keys.includes(squash(k).toLowerCase())) {
          const n = toNumber(obj[k]);
          if (n !== null) return n;
        }
      }
      return null;
    };
    const d = pick(counts, ['diamond', '钻石', '钻石人数']);
    const p = pick(counts, ['platinum', '白金', '白金人数']);
    const g = pick(counts, ['gold', '金牌', '金牌人数']);
    const s = pick(counts, ['silver', '银牌', '银牌人数']);
    const n = pick(counts, ['normal', '普通', '普通人数']);
    const fourOk = d === o.counts.diamond && p === o.counts.platinum && g === o.counts.gold && s === o.counts.silver;
    checks.push({
      criterionId: 'D04.C2',
      points: 3,
      passed: fourOk,
      reason: fourOk
        ? `钻石 ${d} 人、白金 ${p} 人、金牌 ${g} 人、银牌 ${s} 人，统计正确`
        : `钻/白/金/银人数应为 ${o.counts.diamond}/${o.counts.platinum}/${o.counts.gold}/${o.counts.silver}，`
          + `实际为 ${d ?? '缺失'}/${p ?? '缺失'}/${g ?? '缺失'}/${s ?? '缺失'}`,
    });
    const nOk = n === o.counts.normal;
    const allNums = [d, p, g, s, n].every((x) => x !== null);
    const sumOk = allNums && d + p + g + s + n === facts.tiers.length;
    checks.push({
      criterionId: 'D04.C3',
      points: 3,
      passed: nOk && sumOk,
      reason: nOk && sumOk
        ? `普通 ${n} 人，五项合计 ${d + p + g + s + n} 人，与总人数自洽`
        : `普通人数应为 ${o.counts.normal}，实际为 ${n ?? '缺失'}${sumOk ? '' : '；或五项合计不等于总人数'}`,
    });
    return checks;
  },
  parse(raw) {
    const fields = {};
    let carrier = null;
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) carrier = raw;
    else if (typeof raw === 'string') {
      const m = raw.match(/\{[\s\S]*\}/);
      if (m) { try { carrier = JSON.parse(m[0].normalize('NFKC')); } catch { carrier = null; } }
    }
    if (carrier) {
      if (carrier.levels && typeof carrier.levels === 'object') fields.levels = carrier.levels;
      if (carrier.counts && typeof carrier.counts === 'object') fields.counts = carrier.counts;
    }
    return { fields, source: 'nestedMaps', problems: Object.keys(fields).length ? [] : ['未找到 levels/counts 对象'] };
  },
};

export default [D01, D02, D03, D04];
