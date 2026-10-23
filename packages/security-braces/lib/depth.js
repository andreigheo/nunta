'use strict';

// Fixed, non-configurable ceiling: options must not bypass the safety boundary.
const MAX_DEPTH = 128;
const reject = () => {
  const error = new RangeError('Brace pattern exceeds the maximum nesting depth');
  error.code = 'ERR_BRACES_DEPTH';
  throw error;
};

const assertDepth = ast => {
  const pending = [[ast, 0]];
  const visited = new Set();
  while (pending.length) {
    const [node, depth] = pending.pop();
    if (!node || typeof node !== 'object') continue;
    if (depth > MAX_DEPTH || visited.has(node)) reject();
    visited.add(node);
    if (node.nodes) {
      for (const child of node.nodes) pending.push([child, depth + 1]);
    }
  }
};

module.exports = { MAX_DEPTH, assertDepth, reject };
