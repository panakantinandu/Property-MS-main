const { createLogger, format, transports } = require('winston');

const logger = createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: format.combine(
        format.timestamp(),
        format.printf(({ level, message, timestamp }) => `${timestamp} ${level}: ${message}`)
    ),
    transports: [
        new transports.Console(),
        new transports.File({ filename: 'logs/app.log' })
    ]
});

// morgan stream
logger.stream = {
    write: function (message) {
        logger.info(message.trim());
    }
};

module.exports = logger;
