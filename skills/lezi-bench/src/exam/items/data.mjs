/**
 * 信息整理维度（data）—— D01 / D02 / D03 / D04
 * 合计 4 + 6 + 6 + 9 = 25 分
 */
import { makeRng } from '../rng.mjs';
import { toNumber, toList, toBool, sameSet, sameSeq, normText, squash, sameText } from '../../grading/parse.mjs';

const DIM = 'data';

/* ============================== D01 · 4 分 ============================== */
const D01 = {
  id: 'D01',
  dimension: DIM,
  difficulty: 'easy',
  points: 4,
  batch: 1,
  title: '去重并按规定排序',
  generate(seed) {
    const rng = makeRng(`${seed}#D01`);
    const cities = [
      { name: '杭州', code: 3 },
      { name: '南京', code: 1 },
      { name: '苏州', code: 2 },
      { name: '宁波', code: 4 },
      { name: '合肥', code: 5 },
      { name: '无锡', code: 6 },
    ];
    const picked = rng.sample(cities, 5);
    // 原始清单：含重复项，顺序打乱
    const rawList = [];
    for (const c of picked) {
      rawList.push(c.name);
      if (rng.next() < 0.75) rawList.push(c.name); // 制造重复
    }
    const shuffled = rng.shuffle(rawList);
    const facts = { picked, rawList: shuffled };
    const serialText = picked.map((c) => `${c.name}=${c.code}`).join('、');
    const prompt = [
      '「青禾市集」的摊位名单里出现了重复登记，需要整理成一份干净的名单。',
      '原始登记（按登记先后）：',
      shuffled.map((x, i) => `${i + 1}. ${x}`).join('、'),
      '',
      '整理规则：',
      '1) 同名摊位只保留一次（重复的删掉）；',
      '2) 保留的摊位按「摊位序号」从小到大排列（序号见下表）。',
      '摊位序号：' + serialText,
      '',
      '请给出整理后的名单。',
      '只输出一个 JSON 对象：',
      '{"list":["南京","苏州"]}',
    ].join('\n');
    return {
      prompt,
      facts: { ...facts, codes: Object.fromEntries(picked.map((c) => [c.name, c.code])) },
      schema: { list: { type: 'list', aliases: ['list', '名单', 'result', '整理后名单', '摊位'] } },
      publicCriteria: [
        { id: 'D01.C1', points: 1, text: '重复项已去掉，且没有漏掉任何不同名称' },
        { id: 'D01.C2', points: 3, text: '顺序与给定的摊位序号升序完全一致' },
      ],
    };
  },
  oracle(facts) {
    const uniq = [...new Set(facts.rawList)];
    const codes = facts.codes;
    const sorted = uniq.slice().sort((a, b) => (codes[a] - codes[b]) || a.localeCompare(b, 'zh-Hans-CN'));
    return { unique: sorted, codes };
  },
  grade(parsed, facts) {
    const o = D01.oracle(facts);
    const got = parsed.fields.list || [];
    const norm = (x) => squash(x).replace(/[「」『』"']/g, '');
    const gotNorm = got.map(norm);
    const expNorm = o.unique.map(norm);
    const setOk = gotNorm.length === expNorm.length && expNorm.every((x) => gotNorm.includes(x)) && new Set(gotNorm).size === gotNorm.length;
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
          : `名单集合不正确：期望 ${expNorm.length} 个不同名称，实际 ${new Set(gotNorm).size} 个`,
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
const D02 = {
  id: 'D02',
  dimension: DIM,
  difficulty: 'standard',
  points: 6,
  batch: 2,
  title: '区分事实、推断与信息不足',
  generate(seed) {
    const rng = makeRng(`${seed}#D02`);
    const a = rng.int(30, 45);
    const b = rng.int(18, 28);
    const bFinal = b + rng.int(-3, 3);
    // 关键：约 1/3 的 seed 下，甲项目的最终支出**是给出的**。
    // 否则「甲支出缺失」是恒定剧情，答案永远是 C，一个字符串就能打穿整题。
    // 三类答案各约 1/3：A（甲更省）、B（甲不省）、C（信息不足）
    const mode = rng.int(0, 2); // 0=A 1=B 2=C
    const aGiven = mode !== 2;
    const aFinal = mode === 0
      ? bFinal - rng.int(1, 9)   // 甲 < 乙 → A
      : mode === 1
        ? bFinal + rng.int(1, 9) // 甲 > 乙 → B
        : null;
    const facts = {
      projectA_Budget: a,
      projectB_Budget: b,
      projectB_Final: bFinal,
      projectA_Final: aFinal, // null = 缺失
      aGiven,
    };
    const aLine = aGiven
      ? `- 甲项目预算 ${a} 万元，最终实际支出 ${aFinal} 万元。`
      : '- 甲项目的最终实际支出这一栏是空的，报告里没有给出。';
    const prompt = [
      '一份季度简报里写着：',
      `- 甲项目预算 ${a} 万元。`,
      `- 乙项目预算 ${b} 万元，最终实际支出 ${bFinal} 万元。`,
      aLine,
      '',
      '现在有人问：「甲项目的最终实际支出，是否比乙项目少？」',
      '',
      '请判断这个问题的答案属于哪一类，并说明依据。可选类别：',
      'A. 是（甲更省钱）  B. 否（甲不省钱）  C. 信息不足，无法确定',
      '',
      '注意：答案里请写选项字母（A/B/C）或对应的选项原文，不要自创含糊措辞。',
      '只输出一个 JSON 对象：',
      '{"answer":"C","reason":"用一句话说明依据"}',
    ].join('\n');
    return {
      prompt,
      facts,
      schema: {
        answer: { type: 'text', aliases: ['answer', '答案', '结论', 'choice'] },
        reason: { type: 'text', aliases: ['reason', '理由', '依据', 'explanation'] },
      },
      publicCriteria: [
        { id: 'D02.C1', points: 2, text: '答案与题面事实一致：甲支出已给出时按数值比较得出 A 或 B，未给出时选 C' },
        { id: 'D02.C2', points: 2, text: '理由与所选答案一致：给出支出时引用两个真实数字并说明方向，缺失时指出信息不足' },
        { id: 'D02.C3', points: 2, text: '没有把预算数字当作最终实际支出，也没有声称已给出的支出缺失' },
      ],
    };
  },
  oracle(facts) {
    if (facts.aGiven) {
      const less = facts.projectA_Final < facts.projectB_Final;
      return {
        answer: less ? 'A' : 'B',
        // aGiven 时不接受「通用词命中」：必须在 grade 里校验真实数字（见下）
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
      keyTerms: ['缺失', '没有给出', '未知', '不确定', '预算不等于', '不能仅凭预算', '无法由预算', '未提供', '空白', '空缺', '没有甲'],
      sampleB: facts.projectB_Final,
      sampleA: facts.projectA_Budget,
      aGiven: false,
    };
  },
  grade(parsed, facts) {
    const o = D02.oracle(facts);
    const rawAnswer = parsed.fields.answer ? squash(parsed.fields.answer).toUpperCase() : null;
    // 严格：先归一成 A/B/C 单个字母，**剥离括号补充后必须恰好是那一个字母**。
    // 旧实现用 `^A` 前缀匹配，导致「A__乱码」「AA」也能通过（M-12 子串污染）。
    const letterMatch = rawAnswer ? rawAnswer.match(/^([ABC])(?:[（(【\[][^）)】\]]*[）)】\]])?$/) : null;
    const letter = letterMatch ? letterMatch[1] : null;
    const isInsufficient = /信息不足|无法确定|不能确定|不确定|unknown|insufficient/.test(rawAnswer || '');
    const ansOk = o.answer === 'C'
      ? (letter === 'C' || (letter === null && isInsufficient))
      : letter === o.answer;
    // 若答案里同时出现 A/B 与 C，视为自相矛盾，不算通过
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
            ? '正确判为信息不足（C）'
            : `答案应为 C（信息不足），实际为「${parsed.fields.answer}」`,
    });
    let reasonHasTerm;
    let c2Reason;
    if (!reason) {
      reasonHasTerm = false;
      c2Reason = '未解析出 reason 字段';
    } else if (o.aGiven) {
      // 本题甲的实际支出是**给出**的：理由必须引用两个真实数字，并给出正确方向。
      // 只写「实际支出」这种通用词不算 —— 那会让「甲支出没有给出」这种与事实相反的理由也通过。
      const hasA = reason.includes(String(o.requiresNumbers[0]));
      const hasB = reason.includes(String(o.requiresNumbers[1]));
      const rightDir = o.directionWords.some((w) => reason.includes(w));
      reasonHasTerm = hasA && hasB && rightDir;
      c2Reason = reasonHasTerm
        ? `理由引用了两个真实支出数字（${o.requiresNumbers[0]} / ${o.requiresNumbers[1]}）并给出正确方向`
        : `理由必须同时引用甲(${o.requiresNumbers[0]})、乙(${o.requiresNumbers[1]})的实际支出并说明方向；实际为「${reason.slice(0, 60)}」`;
    } else {
      reasonHasTerm = o.keyTerms.some((t) => reason.includes(squash(t)));
      c2Reason = reasonHasTerm ? '理由指出关键缺口（甲最终支出缺失 / 预算≠最终支出）' : '理由没有指出「信息缺失 / 预算≠最终支出」这一关键点';
    }
    checks.push({
      criterionId: 'D02.C2',
      points: 2,
      passed: reasonHasTerm,
      reason: c2Reason,
    });
    // 只有「真的引用了甲的预算数字 + 下了比较结论」才算把预算当最终支出。
    // 「无法判断甲是否少于乙」是正确推理；出现不确定词时说明没下结论，不能算 misCompare。
    const mentionsBudgetNumber = new RegExp(String(facts.projectA_Budget), 'u').test(reason);
    const hasCompare = /(?:更省|省钱|少于|低于|不省|高于|多于)/.test(reason);
    const hedged = /无法|不能|不确定|未知|难以|没有给出|缺失|不足/.test(reason);
    if (o.aGiven) {
      // 甲支出已给出：必须真的用两个实际支出数字得出方向，且不能把预算当支出
      // 只有「预算数字 ≠ 实际支出数字」时，出现预算数字才算把预算当支出。
      // 两者恰好相等时（seed z7：预算 33 = 实际 33），提到这个数字是完全正常的，不能据此判错。
      const budgetDiffersFromActual = facts.projectA_Budget !== facts.projectA_Final;
      const usedBudgetAsFinal = budgetDiffersFromActual && mentionsBudgetNumber && !reason.includes(String(facts.projectA_Final));
      const falselyClaimsMissing = /没有给出|缺失|未知|不确定|无法确定|空白|空缺/.test(reason);
      checks.push({
        criterionId: 'D02.C3',
        points: 2,
        passed: ansOk && !contradictory && !usedBudgetAsFinal && !falselyClaimsMissing,
        reason: !ansOk
          ? '结论本身错误，无法通过此项'
          : contradictory
            ? '答案自相矛盾'
            : falselyClaimsMissing
              ? '理由声称甲支出缺失/无法确定，但本题实际上给出了甲的最终支出'
              : usedBudgetAsFinal
                ? '把预算数字当成了最终实际支出（本题已给出实际支出）'
                : '正确使用实际支出数字，没有把预算当支出',
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
              ? '把预算数字直接当作最终支出进行比较'
              : '没有把预算当作最终支出',
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
    // 只有真的识别出类别时才回填 reason；否则纯噪声（asdkjhqwe@@@）会被当成「有内容」，
    // 从而错误地落到 GRADED 而不是 UNPARSEABLE。
    if (fields.answer !== undefined) {
      const txt = normText(raw);
      if (txt && /[一-龥]/.test(txt)) fields.reason = txt.slice(0, 200);
    }
    return Object.keys(fields).length ? { fields, source: 'prose', problems: [] } : null;
  },
};

/* ============================== D03 · 6 分 ============================== */
const D03 = {
  id: 'D03',
  dimension: DIM,
  difficulty: 'standard',
  points: 6,
  batch: 3,
  title: '两表合并与冲突检测',
  generate(seed) {
    const rng = makeRng(`${seed}#D03`);
    // 供应商 SKU 数量、门店独有条数都随 seed 变化，
    // 否则 commonCount / onlyInStore 会变成常量（不读题也能拿分）。
    const allSkus = ['A-101', 'B-207', 'C-315', 'D-402', 'E-518', 'G-721', 'H-834'];
    const supplierCount = rng.int(4, 6);
    const skus = rng.sample(allSkus, supplierCount);
    const supplier = skus.map((sku) => ({ sku, price: rng.int(10, 60) }));
    const storePrices = supplier.map((s) => ({ sku: s.sku, price: s.price + rng.int(5, 20) }));
    // 1~2 个亏本 SKU
    const lossCount = rng.int(1, Math.min(2, skus.length));
    const lossIdx = rng.sample([...Array(skus.length).keys()], lossCount);
    for (const i of lossIdx) storePrices[i] = { sku: skus[i], price: supplier[i].price - rng.int(1, 5) };
    // 0~2 个只在门店表出现的 SKU
    const onlyCount = rng.int(0, 2);
    const unused = allSkus.filter((x) => !skus.includes(x));
    const onlyList = rng.sample(unused, Math.min(onlyCount, unused.length)).map((sku) => ({ sku, price: rng.int(20, 99) }));
    storePrices.push(...onlyList);
    const supplierShuffled = rng.shuffle(supplier);
    const storeShuffled = rng.shuffle(storePrices);
    const facts = { supplier, storePrices, conflictSkus: lossIdx.map((i) => skus[i]), onlyStoreSkus: onlyList.map((x) => x.sku) };
    const prompt = [
      '财务要对「供应商报价表」和「门店售价表」做一次核对。',
      '',
      '供应商报价表（SKU｜进价）：',
      supplierShuffled.map((x) => `${x.sku}｜${x.price} 元`).join('\n'),
      '',
      '门店售价表（SKU｜售价）：',
      storeShuffled.map((x) => `${x.sku}｜${x.price} 元`).join('\n'),
      '',
      '请完成三件事：',
      '1) 找出「两张表都有，但售价低于进价」的 SKU（亏本销售）；',
      '2) 找出「只在门店表出现、供应商表没有」的 SKU；',
      '3) 给出同时出现在两张表里的 SKU 数量。',
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
    const sup = new Map(facts.supplier.map((x) => [x.sku, x.price]));
    const lossMaking = [];
    const onlyInStore = [];
    let commonCount = 0;
    const seen = new Set();
    for (const s of facts.storePrices) {
      if (seen.has(s.sku)) continue;
      seen.add(s.sku);
      if (!sup.has(s.sku)) { onlyInStore.push(s.sku); continue; }
      commonCount++;
      if (s.price < sup.get(s.sku)) lossMaking.push(s.sku);
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
      reason: os.length === 0 && o.onlyInStore.length > 0 ? '未解析出 onlyInStore 列表' : osOk ? '仅门店 SKU 完全正确' : `仅门店 SKU 应为 ${o.onlyInStore.join(', ')}，实际为 ${os.join(', ') || '（空）'}`,
    });
    const ccOk = typeof cc === 'number' && cc === o.commonCount;
    checks.push({
      criterionId: 'D03.C3',
      points: 2,
      passed: ccOk,
      reason: cc === undefined ? '未解析出 commonCount' : ccOk ? '共同 SKU 数量正确' : `共同数量应为 ${o.commonCount}，实际为 ${cc}`,
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
const D04 = {
  id: 'D04',
  dimension: DIM,
  difficulty: 'challenge',
  points: 9,
  batch: 4,
  title: '规则化条件匹配与例外',
  generate(seed) {
    const rng = makeRng(`${seed}#D04`);
    const members = ['甲', '乙', '丙', '丁', '戊', '己'];
    const tiers = members.map((name, i) => ({
      name,
      // 前两位故意设计在 18 岁以下，用来触发「年龄例外」这条覆盖规则
      age: i < 2 ? rng.int(15, 17) : rng.int(19, 66),
      points: rng.int(300, 1600),
      active: rng.next() < 0.7,
      invite: rng.next() < 0.4,
    }));
    const goldLine = rng.int(900, 1100);
    const silverLine = rng.int(500, 650);
    const facts = { tiers, goldLine, silverLine };
    const table = tiers.map((t) => `- ${t.name}：年龄 ${t.age} 岁｜积分 ${t.points}｜近一年活跃=${t.active ? '是' : '否'}｜有邀请码=${t.invite ? '是' : '否'}`).join('\n');
    const prompt = [
      '你是「山岚健身」的会员等级审核员。本次待审 6 人：',
      table,
      '',
      '等级规则（先判金牌，不满足再判银牌，都不满足则为普通）：',
      `金牌：积分 ≥ ${goldLine}，且近一年活跃=是，且年龄 ≥ 20 岁；`,
      `银牌：积分 ≥ ${silverLine}，且近一年活跃=是，且（年龄 ≥ 18 岁 或 有邀请码=是）；`,
      '例外（覆盖上面所有规则）：年龄 < 18 岁的人，无论积分和活跃度，一律为普通。',
      '',
      '请给出每个人的最终等级，并统计金牌、银牌、普通各有多少人。',
      '只输出一个 JSON 对象：',
      '{"levels":{"甲":"金牌","乙":"银牌","丙":"普通","丁":"普通","戊":"普通","己":"普通"},"counts":{"gold":1,"silver":1,"normal":4}}',
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
        { id: 'D04.C2', points: 3, text: '金牌与银牌人数统计正确' },
        { id: 'D04.C3', points: 3, text: '普通人数统计正确（即总人数与前三项自洽）' },
      ],
      answerStyle: 'nestedMaps',
    };
  },
  oracle(facts) {
    const levels = {};
    const counts = { gold: 0, silver: 0, normal: 0 };
    for (const t of facts.tiers) {
      let lv;
      if (t.age < 18) lv = '普通';
      else if (t.points >= facts.goldLine && t.active && t.age >= 20) lv = '金牌';
      else if (t.points >= facts.silverLine && t.active && (t.age >= 18 || t.invite)) lv = '银牌';
      else lv = '普通';
      levels[t.name] = lv;
      if (lv === '金牌') counts.gold++;
      else if (lv === '银牌') counts.silver++;
      else counts.normal++;
    }
    return { levels, counts };
  },
  grade(parsed, facts) {
    const o = D04.oracle(facts);
    const levels = parsed.fields.levels || {};
    const counts = parsed.fields.counts || {};
    const ALIAS = { 金牌: ['金', 'gold'], 银牌: ['银', 'silver'], 普通: ['normal', '无'] };
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
      reason: right === facts.tiers.length ? '六人等级全部正确' : `${right}/${facts.tiers.length} 人正确；${wrong.join('，')}`,
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
    const g = pick(counts, ['gold', '金牌', '金']);
    const s = pick(counts, ['silver', '银牌', '银']);
    const n = pick(counts, ['normal', '普通', '普通人数']);
    const gsOk = g === o.counts.gold && s === o.counts.silver;
    checks.push({
      criterionId: 'D04.C2',
      points: 3,
      passed: gsOk,
      reason: g === o.counts.gold && s === o.counts.silver
        ? `金牌 ${g} 人、银牌 ${s} 人，统计正确`
        : `金/银人数应为 ${o.counts.gold}/${o.counts.silver}，实际为 ${g ?? '缺失'}/${s ?? '缺失'}`,
    });
    const nOk = n === o.counts.normal;
    const sumOk = g !== null && s !== null && n !== null && g + s + n === facts.tiers.length;
    checks.push({
      criterionId: 'D04.C3',
      points: 3,
      passed: nOk && sumOk,
      reason: nOk && sumOk
        ? `普通 ${n} 人，三项合计 ${g + s + n} 人，与总人数自洽`
        : `普通人数应为 ${o.counts.normal}，实际为 ${n ?? '缺失'}${sumOk ? '' : '；或三项合计不等于总人数'}`,
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
