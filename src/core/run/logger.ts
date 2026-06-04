// src/core/run/logger.ts

export const enum LogLevel {
	DEBUG = 0,
	INFO = 1,
	WARN = 2,
	ERROR = 3,
}
type LevelKey = Lowercase<keyof typeof LogLevel>;
const DO_NOTHING = () => {};
const logger: Record<LevelKey, (...args: unknown[]) => void> = {
	debug: DO_NOTHING,
	info: DO_NOTHING,
	warn: DO_NOTHING,
	error: DO_NOTHING,
};

export function setLogLevel(level: LogLevel): void {
	logger.debug = level <= LogLevel.DEBUG ? (...args) => console.debug('[DEBUG]', ...args) : DO_NOTHING;
	logger.info = level <= LogLevel.INFO ? (...args) => console.info('[INFO]', ...args) : DO_NOTHING;
	logger.warn = level <= LogLevel.WARN ? (...args) => console.warn('[WARN]', ...args) : DO_NOTHING;
	logger.error = level <= LogLevel.ERROR ? (...args) => console.error('[ERROR]', ...args) : DO_NOTHING;
}
setLogLevel(LogLevel.WARN);

export default logger as Readonly<typeof logger>;
