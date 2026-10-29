/**
 * 解析器单元测试（node --test）
 * 重点：等价答案必须通过，冲突/非法输入必须拒绝，绝不 eval。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normText, normKey, squash, cnToInt, toNumber, sameNumber, toBool, toList,
  sameSet, sameMultiset, sameSeq, sameText, extractJsonSnippets, pickField, extractLines, buildParse, coerce,
} from '../src/grading/parse.mjs';

test('normText: NFKC 全角转半角、折叠空白、去尾部标点', () => {
  assert.equal(normText('  ＡＢＣ　１２３  '), 'ABC 123');
  assert.equal(normText('周三上午10点。'), '周三上午10点');
  assert.equal(normText('"答案"'), '答案');
  assert.equal(normText('「周三」'), '周三');
  assert.equal(normText(null), null);
  assert.equal(normText(52), '52');
});

test('normText 不得删除否定词或数字', () => {
  assert.ok(normText('不需要预算表').includes('不'));
  assert.ok(normText('不需要预算表').includes('预算表'));
  assert.ok(normText('共 57 元').includes('57'));
});

test('normKey: 字段名大小写/下划线/空格不敏感', () => {
  assert.equal(normKey('budget_attached'), normKey('budgetAttached'));
  assert.equal(normKey('Budget Attached'), normKey('budgetattached'));
  assert.notEqual(normKey('deadline'), normKey('owner'));
});

test('cnToInt: 常用中文数字', () => {
  assert.equal(cnToInt('五'), 5);
  assert.equal(cnToInt('十'), 10);
  assert.equal(cnToInt('十一'), 11);
  assert.equal(cnToInt('二十'), 20);
  assert.equal(cnToInt('一百零五'), 105);
  assert.equal(cnToInt('三千'), 3000);
  assert.equal(cnToInt('五二'), null, '纯中文数字串不应被猜测');
  assert.equal(cnToInt('abc'), null);
});

test('toNumber: 整数/小数/货币/千分位/单位', () => {
  assert.equal(toNumber('52'), 52);
  assert.equal(toNumber('52.00'), 52);
  assert.equal(toNumber('1,234'), 1234);
  assert.equal(toNumber('￥52元', { units: true }), 52);
  assert.equal(toNumber('52元'), 52);
  assert.equal(toNumber('3/4'), 0.75);
  assert.equal(toNumber('五十二'), 52);
});

test('toNumber 必须拒绝 NaN/Infinity/空/混杂串', () => {
  assert.equal(toNumber('NaN'), null);
  assert.equal(toNumber('Infinity'), null);
  assert.equal(toNumber('-Infinity'), null);
  assert.equal(toNumber(''), null);
  assert.equal(toNumber('52 和 57'), null);
  assert.equal(toNumber('abc'), null);
  assert.equal(toNumber(NaN), null);
  assert.equal(toNumber(Infinity), null);
  assert.equal(toNumber(true), null);
});

test('sameNumber: 整数精确、小数容差', () => {
  assert.ok(sameNumber(52, 52));
  assert.ok(sameNumber(52.0, 52));
  assert.ok(!sameNumber(52, 53));
  assert.ok(sameNumber(0.1 + 0.2, 0.3));
  assert.ok(!sameNumber(NaN, NaN));
  assert.ok(!sameNumber(null, 0));
});

test('toBool: 中英真假词，否定优先', () => {
  assert.equal(toBool('true'), true);
  assert.equal(toBool('是'), true);
  assert.equal(toBool('false'), false);
  assert.equal(toBool('否'), false);
  assert.equal(toBool('不需要'), false);
  assert.equal(toBool('需要'), true);
  assert.equal(toBool('不附'), false);
  assert.equal(toBool(1), true);
  assert.equal(toBool(0), false);
  assert.equal(toBool('也许吧'), null);
});

test('toList: 数组/逗号/顿号/编号列表', () => {
  assert.deepEqual(toList(['a', 'b']), ['a', 'b']);
  assert.deepEqual(toList('a,b'), ['a', 'b']);
  assert.deepEqual(toList('a、b、c'), ['a', 'b', 'c']);
  assert.deepEqual(toList('1. a\n2. b'), ['a', 'b']);
  assert.deepEqual(toList(''), []);
});

test('sameSet 顺序无关且自动去重；sameSeq 顺序敏感；sameMultiset 严格计数', () => {
  assert.ok(sameSet(['a', 'b'], ['b', 'a']));
  assert.ok(!sameSeq(['a', 'b'], ['b', 'a']));
  // 集合语义：重复写同一个元素不应被判错
  assert.ok(sameSet(['a', 'b', 'a'], ['a', 'b']));
  // 但严格多重集必须计数一致
  assert.ok(!sameMultiset(['a', 'b', 'a'], ['a', 'b']));
  assert.ok(!sameSet(['a', 'b'], ['a', 'c']));
  assert.ok(!sameSet(['a', 'b'], ['a']));
});

test('sameText 支持别名表且不放过不同文本', () => {
  assert.ok(sameText('部分通过', '部分批准', { 部分批准: ['部分通过'] }));
  assert.ok(sameText('部分批准', '部分批准'));
  assert.ok(!sameText('批准', '转人工'));
});

test('extractJsonSnippets: 纯 JSON / 代码块 / 前后有解释', () => {
  assert.equal(extractJsonSnippets('{"a":1}').length, 1);
  const fenced = extractJsonSnippets('这是答案：\n```json\n{"a":1}\n```\n请查收');
  assert.equal(fenced.length, 1);
  assert.deepEqual(fenced[0].value, { a: 1 });
  const inline = extractJsonSnippets('我的答案是 {"a": 1} 就这样');
  assert.equal(inline.length, 1);
  assert.deepEqual(inline[0].value, { a: 1 });
});

test('extractJsonSnippets 不把正文花括号误当 JSON', () => {
  assert.equal(extractJsonSnippets('集合 {a, b, c} 不是 JSON').length, 0);
});

test('pickField: 别名匹配、嵌套一层', () => {
  const obj = { answer: { Position: 2, COLOR: '红' } };
  assert.equal(pickField(obj, ['position']).value, 2);
  assert.equal(pickField(obj, ['color']).value, '红');
  assert.equal(pickField(obj, ['nope']).found, false);
});

test('pickField 检测同名字段冲突', () => {
  const obj = { deadline: '周三', nested: { deadline: '周二' } };
  const hit = pickField(obj, ['deadline']);
  assert.ok(hit.found);
  assert.equal(hit.conflict, true, '两层里同名字段值不同必须标为冲突');
});

test('extractLines: Q01: 值 形式', () => {
  const lines = extractLines('Q01: 52\n原价 = 57');
  assert.equal(lines.length, 2);
  assert.equal(lines[0].key, 'Q01');
  assert.equal(lines[0].value, '52');
});

test('buildParse: 对象走 JSON 路径并记录缺失字段', () => {
  const r = buildParse('{"subtotal":57}', { subtotal: { type: 'number' }, total: { type: 'number' } });
  assert.equal(r.fields.subtotal, 57);
  assert.equal(r.fields.total, undefined);
  assert.ok(r.problems.some((p) => p.includes('缺少字段 total')));
});

test('buildParse: 多个冲突 JSON 片段必须判为不可解析', () => {
  const r = buildParse('答案一：{"total":52}\n答案二：{"total":99}', { total: { type: 'number' } });
  assert.equal(r.fields.total, undefined);
  assert.ok(r.problems.some((p) => p.includes('冲突')));
});

test('buildParse: 字段值无法转换时记录问题而非猜值', () => {
  const r = buildParse('{"total":"很多钱"}', { total: { type: 'number' } });
  assert.equal(r.fields.total, undefined);
  assert.ok(r.problems.some((p) => p.includes('无法解析')));
});

test('buildParse: 行格式兜底', () => {
  const r = buildParse('subtotal: 57\ntotal: 52', { subtotal: { type: 'number' }, total: { type: 'number' } });
  assert.equal(r.source, 'lines');
  assert.equal(r.fields.subtotal, 57);
  assert.equal(r.fields.total, 52);
});

test('coerce 对非法类型一律返回 null', () => {
  assert.equal(coerce({}, { type: 'number' }), null);
  assert.equal(coerce([], { type: 'number' }), null);
  assert.equal(coerce('很多钱', { type: 'number' }), null);
  assert.equal(coerce([], { type: 'list' }), null, '空数组视为没有可用列表');
  assert.equal(coerce('', { type: 'list' }), null);
});

test('解析器不接受代码执行：eval 式输入只当文本', () => {
  const r = buildParse('process.exit(1)', { total: { type: 'number' } });
  assert.equal(Object.keys(r.fields).length, 0);
});
