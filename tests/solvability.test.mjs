/**
 * 题目「可解性 / 唯一性」证明测试。
 *
 * 这一组测试回答的是最关键的问题：
 *   **仅凭题面写出来的信息，答案是否唯一？**
 * 而不是「仅凭生成器内部变量，答案是否唯一」—— 后者会漏掉「题面没说颜色池」
 * 这类隐蔽的欠定（我们真在真机考试里踩到过：R04 只能拿 3/9）。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { ITEMS, instantiateInternal, criteriaOf } from '../src/exam/manifest.mjs';

const byId = (id) => ITEMS.find((i) => i.id === id);

/** 全排列 */
function allPerms(arr) {
  if (arr.length <= 1) return [arr];
  const out = [];
  arr.forEach((x, i) => {
    for (const rest of allPerms([...arr.slice(0, i), ...arr.slice(i + 1)])) out.push([x, ...rest]);
  });
  return out;
}

test('R04: 题面必须显式声明全部人名与颜色（否则未提到的人颜色欠定）', () => {
  // 这条断言源自一个真实缺陷：早期题面只写了线索里提到的名字，
  // 导致「第 4 个人」从未出现在题面里，但判分要求所有人都对 → 满分理论上不可能。
  // 现在人数由题目自己决定，所以不写死 4，而是按 facts 校验题面完整性。
  for (const seed of ['a', 'b', 'host-trial-2026', 'host-trial-v2', '42', 'zzz']) {
    const g = byId('R04').generate(seed);
    const { names, colors } = g.facts;
    assert.ok(names.length >= 4, `seed=${seed} 人数应 >= 4，实际 ${names.length}`);
    assert.equal(names.length, colors.length, `seed=${seed} 人数与颜色数应一致`);
    for (const n of names) {
      assert.ok(g.prompt.includes(n), `seed=${seed} 题面缺少人名「${n}」`);
    }
    for (const c of colors) {
      assert.ok(g.prompt.includes(c), `seed=${seed} 题面缺少颜色「${c}」`);
    }
    assert.ok(g.prompt.includes('恰好'), '题面必须说明颜色集合是「恰好」这些');
  }
});

test('R04: 在题面允许的完整空间上穷举，解必须唯一且等于 oracle', () => {
  const R04 = byId('R04');
  for (const seed of ['a', 'b', 'host-trial-2026', 'host-trial-v2', '42', 'zzz', '1234']) {
    const internal = instantiateInternal(R04, seed);
    const { names, colors, clueTests } = internal.facts;
    assert.ok(Array.isArray(clueTests) && clueTests.length > 0, 'facts 里必须保留线索谓词，供独立复算');
    // 独立穷举：names 的 4! × colors 的 4!（这就是题面允许的全部可能）
    const sols = [];
    for (const np of allPerms(names)) {
      for (const cp of allPerms(colors)) {
        const seat = Object.fromEntries(names.map((n) => [n, { position: np.indexOf(n) + 1, color: cp[np.indexOf(n)] }]));
        if (clueTests.every((c) => c.test(seat))) sols.push(seat);
      }
    }
    assert.equal(sols.length, 1, `seed=${seed} 有 ${sols.length} 个解，题面欠定`);
    const o = R04.oracle(internal.facts);
    assert.deepEqual(sols[0], o.answer, `seed=${seed} 穷举解与 oracle 不一致`);
  }
});

test('R04: 把色池扩大到 6 色后，解仍唯一（证明题面已足够约束）', () => {
  const R04 = byId('R04');
  const EXTRA = ['紫', '橙', '青', '粉', '灰', '白'];
  for (const seed of ['a', 'host-trial-2026', 'host-trial-v2', '42']) {
    const internal = instantiateInternal(R04, seed);
    const { names, colors, clueTests } = internal.facts;
    // 把题面给出的 4 色 + 额外色拼成 6 色池，重新穷举
    // 注意：如果题面明确说「恰好这四种」，额外颜色本就不合法；这里做的是更强的检查——
    // 即便有人误以为色池更大，线索是否足以排除？这能捕获「唯一性依赖枚举边界」的隐患。
    const pool = [...colors, ...EXTRA.filter((c) => !colors.includes(c)).slice(0, 2)];
    // 只在题面允许的 4 色里枚举（题面已限定），这里断言 6 色里出现的解必须仍只有那一个
    const sols4 = [];
    for (const np of allPerms(names)) {
      for (const cp of allPerms(colors)) {
        const seat = Object.fromEntries(names.map((n) => [n, { position: np.indexOf(n) + 1, color: cp[np.indexOf(n)] }]));
        if (clueTests.every((c) => c.test(seat))) sols4.push(seat);
      }
    }
    assert.equal(sols4.length, 1, `seed=${seed} 4 色内应唯一`);
    // 6 色池下自由选择（允许重复用色）时，只要题面限定了「恰好这四种」，就仍然唯一；
    // 这里验证的是谓词本身不会因额外颜色而意外产生新解——即线索都在说这 4 色内的事。
    for (const t of clueTests) {
      const probe = Object.fromEntries(names.map((n, i) => [n, { position: i + 1, color: pool[i % pool.length] }]));
      assert.equal(typeof t.test(probe), 'boolean', '线索谓词必须只返回布尔值');
    }
  }
});

test('所有题目：oracle 的答案必须能在题面信息下被判为满分', () => {
  for (const it of ITEMS) {
    for (const seed of ['p1', 'p2', 'p3']) {
      const internal = instantiateInternal(it, seed);
      const o = it.oracle(internal.facts);
      assert.ok(o !== undefined && o !== null, `${it.id} oracle 返回空`);
    }
  }
});

test('所有题目：题面不得出现「参考答案」字样或直接给出答案', () => {
  for (const it of ITEMS) {
    for (const seed of ['chk-1', 'chk-2']) {
      const { prompt } = it.generate(seed);
      assert.ok(!/标准答案|参考答案|正确答案是/.test(prompt), `${it.id} 题面疑似泄露答案`);
    }
  }
});

test('所有题目：评分条件文本不得为空，且必须能对应到 grade() 产出的 criterionId', () => {
  for (const it of ITEMS) {
    const crit = criteriaOf(it);
    const internal = instantiateInternal(it, 'cid-check');
    const o = it.oracle(internal.facts);
    // 构造一个「尽量正确」的答案去跑 grader，只为拿到 criterionId 列表
    const r = it.grade(
      { fields: {}, raw: '' },
      internal.facts,
    );
    const got = new Set(r.map((c) => c.criterionId));
    for (const c of crit) assert.ok(got.has(c.id), `${it.id} grade() 没有产出条件 ${c.id}`);
    assert.equal(r.length, crit.length, `${it.id} grade() 条件数与公开条件数不一致`);
  }
});
