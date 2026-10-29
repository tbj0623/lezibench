/**
 * 目录定位工具 —— 兼容 Node 18。
 *
 * 为什么需要它：`import.meta.dirname` 是 **Node 20.11+** 才有的 API，
 * 而 package.json 的 engines 写的是 `>=18.17.0`，CI 矩阵也覆盖 Node 18。
 * 直接用会让 Node 18 用户拿到 `undefined`，接着 `path.resolve(undefined, ...)` 抛异常 ——
 * 表现为 `node scripts/sync-skill.mjs` 直接崩。
 *
 * 实测：Node 18.20.4 上 6 处命中，其中 sync-skill / demo 是**真实用户会踩到**的路径。
 */
import { fileURLToPath } from 'node:url';
import path from 'node:path';

/** 当前模块所在目录（等价于 import.meta.dirname，但 Node 18 也能用） */
export function moduleDir(metaUrl) {
  return path.dirname(fileURLToPath(metaUrl));
}

/** 从某个模块向上找 n 级目录 */
export function moduleUp(metaUrl, levels = 1) {
  let dir = moduleDir(metaUrl);
  for (let i = 0; i < levels; i++) dir = path.dirname(dir);
  return dir;
}
