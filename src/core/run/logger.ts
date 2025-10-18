// src/core/run/logger.ts

type LogLevel = 'debug' | 'info' | 'warn' | 'error';
const LEVEL_PRIORITY: Record<LogLevel, number> = {
	debug: 0,
	info: 1,
	warn: 2,
	error: 3,
};

const getLogLevel = (): LogLevel => {
	const level = process.env['LOG_LEVEL']?.toLowerCase() as LogLevel;
	return level && LEVEL_PRIORITY[level] !== undefined ? level : 'warn';
	// return level && LEVEL_PRIORITY[level] !== undefined ? level : 'debug';
};

const currentLevel = getLogLevel();

const logger = {
	debug: (...args: any[]) =>
		LEVEL_PRIORITY.debug >= LEVEL_PRIORITY[currentLevel] ? console.debug('[DEBUG]', ...args) : undefined,

	info: (...args: any[]) =>
		LEVEL_PRIORITY.info >= LEVEL_PRIORITY[currentLevel] ? console.info('[INFO]', ...args) : undefined,

	warn: (...args: any[]) =>
		LEVEL_PRIORITY.warn >= LEVEL_PRIORITY[currentLevel] ? console.warn('[WARN]', ...args) : undefined,

	error: (...args: any[]) =>
		LEVEL_PRIORITY.error >= LEVEL_PRIORITY[currentLevel] ? console.error('[ERROR]', ...args) : undefined,
};

export default logger;
