// src/core/run/logger.ts

const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 } as const;
type LevelKey = keyof typeof LEVELS;
type Level = (typeof LEVELS)[LevelKey];

const level: Level = LEVELS[(process.env['LOG_LEVEL']?.toLowerCase() ?? 'warn') as LevelKey] ?? LEVELS.warn;

const logger: Record<LevelKey, (...args: unknown[]) => void> = {
	debug: level <= LEVELS.debug ? (...args) => console.debug('[DEBUG]', ...args) : () => {},
	info: level <= LEVELS.info ? (...args) => console.info('[INFO]', ...args) : () => {},
	warn: level <= LEVELS.warn ? (...args) => console.warn('[WARN]', ...args) : () => {},
	error: level <= LEVELS.error ? (...args) => console.error('[ERROR]', ...args) : () => {},
};

export default logger;
