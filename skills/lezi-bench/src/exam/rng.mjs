/**
 * 确定性随机数：同一 seed 在同一 examVersion 下必须产生完全相同的题目实例。
 * 实现为 SHA-256 派生的 mulberry32，跨平台、跨 Node 版本结果一致（只用到 32 位整数运算）。
 */
import { createHash } from 'node:crypto';

export function sha256Hex(input) {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

export function hashBytes(str) {
  return createHash('sha256').update(String(str), 'utf8').digest();
}

/** 从任意字符串派生一个 32 位整数，用于给每个题目独立的子随机流。 */
export function seedInt(seedStr, salt = '') {
  return hashBytes(`${seedStr}::${salt}`).readUInt32LE(0);
}

export function makeRng(seedStr) {
  let a = seedInt(seedStr, 'mulberry') >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const rng = {
    next,
    /** 闭区间整数 [min, max] */
    int(min, max) {
      if (max < min) throw new Error(`rng.int 区间非法: ${min}..${max}`);
      return min + Math.floor(next() * (max - min + 1));
    },
    pick(arr) {
      if (!arr.length) throw new Error('rng.pick 空数组');
      return arr[Math.floor(next() * arr.length)];
    },
    shuffle(arr) {
      const out = [...arr];
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
      }
      return out;
    },
    sample(arr, k) {
      return rng.shuffle(arr).slice(0, Math.max(0, Math.min(k, arr.length)));
    },
    /** 生成 [min,max] 内互不相同的 n 个整数 */
    distinctInts(min, max, n) {
      const pool = [];
      for (let i = min; i <= max; i++) pool.push(i);
      if (n > pool.length) throw new Error('distinctInts 取值不足');
      return rng.sample(pool, n);
    },
  };
  return rng;
}
