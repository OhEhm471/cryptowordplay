const { createLogger, format, transports } = require("winston");

const { combine, timestamp, printf, colorize, errors, json } = format;

const devFormat = printf(({ level, message, timestamp, stack, ...meta }) => {
  const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : "";
  return `${timestamp} [${level}] ${stack || message}${metaStr}`;
});

const logger = createLogger({
  level: process.env.NODE_ENV === "production" ? "info" : "debug",
  format: combine(
    errors({ stack: true }),
    timestamp({ format: "YYYY-MM-DD HH:mm:ss" })
  ),
  transports: [
    process.env.NODE_ENV === "production"
      ? new transports.Console({ format: combine(json()) })
      : new transports.Console({ format: combine(colorize(), devFormat) }),
  ],
  exitOnError: false,
});

module.exports = logger;
