/**
 * 判断「当前模块是不是被直接 node 执行」的跨平台可靠实现。
 *
 * 为什么不用 `import.meta.url === `file://${process.argv[1]}``：
 *  - Windows 下 argv[1] 是 C:\... 而 import.meta.url 是 file:///C:/...，永远不相等
 *  - 中文/空格路径还会被百分号编码
 * 用 pathToFileURL + realpath 比较才是稳的。
 */
import { pathToFileURL } from 'node:url';
import { realpathSync } from 'node:fs';
import path from 'node:path';

export function isMain(moduleUrl) {
  const argv1 = process.argv[1];
  if (!argv1) return false;
  try {
    const a = new URL(moduleUrl);
    let b = pathToFileURL(path.resolve(argv1));
    // 解析符号链接（npm link / 软链安装时 argv1 与真实文件不同）
    try {
      b = pathToFileURL(realpathSync(argv1));
    } catch { /* argv1 可能不存在，保持原样 */ }
    return a.href === b.href;
  } catch {
    return false;
  }
}
