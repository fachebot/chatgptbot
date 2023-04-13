import winston from "winston"

export const logger = winston.createLogger({
    format: winston.format.combine(
        winston.format.timestamp({
          format: 'YYYY-MM-DD HH:mm:ss'
        }),
        winston.format.json()
      ),
    transports: [
        new winston.transports.Console(),
        new winston.transports.File({ dirname: 'logs', filename: 'chatgptbot.log' })
    ]
})
