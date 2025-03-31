import { MODULE } from '../constants.js';
/**
 * Custom logger class for Spell Book module
 * @class Logger
 */
export class Logger {
  static ID = MODULE.ID;

  static LOG_LEVEL = 3; // Default to verbose logging, can be changed by module settings

  /**
   * Custom logger with caller context information
   * @static
   * @param {number} level - Log level (1=error, 2=warning, 3=verbose)
   * @param {...any} args - Content to log to console
   * @returns {void}
   */
  static log(level, ...args) {
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

    if (this.LOG_LEVEL > 0 && level <= this.LOG_LEVEL) {
      switch (level) {
        case 1:
          console.error(`${this.ID} |`, ...args);
          break;
        case 2:
          console.warn(`${this.ID} |`, ...args);
          break;
        case 3:
        default:
          console.debug(`${this.ID} |`, ...args);
          break;
      }
    }
  }

  /**
   * Log an error message
   * @static
   * @param {...any} args - Error message contents
   */
  static error(...args) {
    this.log(1, ...args);
  }

  /**
   * Log a warning message
   * @static
   * @param {...any} args - Warning message contents
   */
  static warn(...args) {
    this.log(2, ...args);
  }

  /**
   * Log a debug/verbose message
   * @static
   * @param {...any} args - Debug message contents
   */
  static debug(...args) {
    this.log(3, ...args);
  }
}
