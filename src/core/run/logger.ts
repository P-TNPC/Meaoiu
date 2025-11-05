// src/core/run/logger.ts

const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 } as const;
type LevelKey = keyof typeof LEVELS;
type Level = (typeof LEVELS)[LevelKey];

const getLogLevel = (): Level => {
	const key = process.env['LOG_LEVEL']?.toLowerCase() ?? 'warn';
	return LEVELS[key as LevelKey] ?? LEVELS.warn;
};

const currentLevel = getLogLevel();

const logger: Record<LevelKey, (...args: unknown[]) => void> = {
	debug: (...args) => currentLevel <= LEVELS.debug && console.debug('[DEBUG]', ...args),

	info: (...args) => currentLevel <= LEVELS.info && console.info('[INFO]', ...args),

	warn: (...args) => currentLevel <= LEVELS.warn && console.warn('[WARN]', ...args),

	error: (...args) => currentLevel <= LEVELS.error && console.error('[ERROR]', ...args),
};

export default logger;
