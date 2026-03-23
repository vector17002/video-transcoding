import fs from 'fs';
import path from 'path';
import util from 'util';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure logs directory exists at the root of the server
const logDir = path.join(__dirname, '..', '..', 'logs');
if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
}

// Stream to logs/log.txt
const logFilePath = path.join(logDir, 'log.txt');
const logStream = fs.createWriteStream(logFilePath, { flags: 'a' });

// Store original console methods
const originalConsoleLog = console.log;
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;
const originalConsoleInfo = console.info;
const originalConsoleDebug = console.debug;

function formatMessage(args: any[]) {
    return util.format(...args) + '\n';
}

function writeToLog(level: string, message: string) {
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] [${level.toUpperCase()}] ${message}`;
    logStream.write(logEntry);
}

// Override global console methods to intercept all console outputs
console.log = function (...args: any[]) {
    originalConsoleLog.apply(console, args);
    writeToLog('log', formatMessage(args));
};

console.info = function (...args: any[]) {
    originalConsoleInfo.apply(console, args);
    writeToLog('info', formatMessage(args));
};

console.warn = function (...args: any[]) {
    originalConsoleWarn.apply(console, args);
    writeToLog('warn', formatMessage(args));
};

console.error = function (...args: any[]) {
    originalConsoleError.apply(console, args);
    writeToLog('error', formatMessage(args));
};

console.debug = function (...args: any[]) {
    originalConsoleDebug.apply(console, args);
    writeToLog('debug', formatMessage(args));
};

// Catch unhandled exceptions and promise rejections
let errorHandlersAttached = false;
export function attachErrorHandlers() {
    if (errorHandlersAttached) return;
    errorHandlersAttached = true;
    
    process.on('uncaughtException', (err: Error) => {
        writeToLog('error', `UNCAUGHT EXCEPTION: ${err?.message}\n${err?.stack}\n`);
        originalConsoleError.apply(console, ['UNCAUGHT EXCEPTION', err]);
    });

    process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
        writeToLog('error', `UNHANDLED REJECTION: ${util.format(reason)}\n`);
        originalConsoleError.apply(console, ['UNHANDLED REJECTION', reason]);
    });
}

// Initialize error listeners
attachErrorHandlers();

// Export a robust logger object directly if users want explicit logging
export const logger = {
    log: (...args: any[]) => console.log(...args),
    info: (...args: any[]) => console.info(...args),
    error: (...args: any[]) => console.error(...args),
    warn: (...args: any[]) => console.warn(...args),
    debug: (...args: any[]) => console.debug(...args),
};

export default logger;
