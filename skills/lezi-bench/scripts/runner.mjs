/**
 * 兼容入口：真正的实现位于 src/runner.mjs。
 * 保留 scripts/ 下的同名入口，是为了让外部适配器/文档里的路径保持稳定。
 */
export * from '../src/runner.mjs';
