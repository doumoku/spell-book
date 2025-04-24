import { MODULE } from './constants.mjs';

/**
 * Custom logger with caller context information
 * @static
 * @param {number} level - Log level (1=error, 2=warning, 3=verbose)
 * @param {...any} args - Content to log to console
 * @returns {void}
 */
export function log(level, ...args) {
  // Get calling context using Error stack trace
  const stack = new Error().stack.split('\n');
  let callerInfo = '';

  if (stack.length > 2) {
    const callerLine = stack[2].trim();
    const callerMatch = callerLine.match(/at\s+([^.]+)\.(\w+)/);
    if (callerMatch) {
      callerInfo = `[${callerMatch[1]}.${callerMatch[2]}] : `;
    }
  }

  // Prepend caller info to first argument if it's a string
  if (typeof args[0] === 'string') {
    args[0] = callerInfo + args[0];
  } else {
    // Insert caller info as first argument
    args.unshift(callerInfo);
  }

  const now = new Date();
  const logEntry = {
    type:
      level === 1 ? 'error'
      : level === 2 ? 'warn'
      : 'debug',
    timestamp: `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`,
    level,
    content: args
  };

  if (!window.console_logs) window.console_logs = [];
  window.console_logs.push(logEntry);

  if (MODULE.LOG_LEVEL > 0 && level <= MODULE.LOG_LEVEL) {
    switch (level) {
      case 1:
        console.error(`${MODULE.ID} |`, ...args);
        break;
      case 2:
        console.warn(`${MODULE.ID} |`, ...args);
        break;
      case 3:
      default:
        console.debug(`${MODULE.ID} |`, ...args);
        break;
    }
  }
}
