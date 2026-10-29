"""用「只读题面的独立实现」重算 D04 三条夹具。"""
import io
import subprocess
import json

out = subprocess.run(['node', 'qa/d04-recompute.mjs', 'hand-d04-1', 'hand-d04-2', 'hand-d04-3'],
                     cwd='..', capture_output=True, text=True, encoding='utf-8')
if out.returncode != 0:
    raise SystemExit(out.stderr)

data = {}
for chunk in out.stdout.split('=== ')[1:]:
    seed = chunk.split(' ===')[0].strip()
    for line in chunk.split('\n'):
        line = line.strip()
        if line.startswith('{'):
            data[seed] = json.loads(line)
            break
assert len(data) == 3, f'解析到 {len(data)} 段: {list(data)}'

def fmt_levels(levels):
    items = list(levels.items())
    out_lines = []
    for i in range(0, len(items), 5):
        chunk = items[i:i + 5]
        out_lines.append('        ' + ' '.join(f"{k}: '{v}'," for k, v in chunk))
    return '\n'.join(out_lines)

parts = ['  /* ----------------------------- D04 ----------------------------- */']
for seed in ['hand-d04-1', 'hand-d04-2', 'hand-d04-3']:
    d = data[seed]
    lv, c = d['levels'], d['counts']
    by = {}
    for name, level in lv.items():
        by.setdefault(level, []).append(name)
    how = (
        f"钻石 {c['diamond']}（{'、'.join(by.get('钻石', []))}）／"
        f"白金 {c['platinum']}（{'、'.join(by.get('白金', []))}）／"
        f"金牌 {c['gold']}（{'、'.join(by.get('金牌', []))}）／"
        f"银牌 {c['silver']}（{'、'.join(by.get('银牌', []))}）／"
        f"普通 {c['normal']}（{'、'.join(by.get('普通', []))}），合计 14。"
    )
    parts.append(f"""  {{
    id: 'D04',
    seed: '{seed}',
    points: 9,
    factsDigest: {{
      people: 14,
      levels: '钻石/白金/金牌/银牌/普通',
    }},
    // 由「只读题面文本」的独立实现重算（qa/d04-recompute.mjs），未调用 oracle：
    // 解析人名行拿到 年龄/积分/活跃/邀请码/年数，解析规则行拿到四级积分阈值，
    // 再按题面写明的「常规规则 + 例外一 + 例外一的例外」逐人判定。
    answer: {{
      levels: {{
{fmt_levels(lv)}
      }},
      counts: {{ diamond: {c['diamond']}, platinum: {c['platinum']}, gold: {c['gold']}, silver: {c['silver']}, normal: {c['normal']} }},
    }},
    how: '{how}',
  }},""")

new_block = '\n'.join(parts) + '\n'

p = 'tests/hard-data.test.mjs'
s = io.open(p, encoding='utf-8').read()
i = s.index('  /* ----------------------------- D04 ----------------------------- */')
j = s.index('];', i)
s = s[:i] + new_block + s[j:]
io.open(p, 'w', encoding='utf-8').write(s)
print('D04 三条夹具已按独立重算更新')
