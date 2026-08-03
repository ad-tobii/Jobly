import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import pinoHttp from 'pino-http'
import { randomUUID } from 'node:crypto'

dotenv.config()

import logger from './config/logger.js'
import { respond, errorHandler, notFoundHandler } from './middleware/respond.js'
import { globalLimiter, authLimiter } from './middleware/rateLimit.js'

// routes
import authRoutes from './routes/auth.js'
import cvRoutes from './routes/cv.js'
import jobRoutes from './routes/jobs.js'
import documentRoutes from './routes/documents.js'
import applicationRoutes from './routes/applications.js'
import webhookRoutes from './routes/webhooks.js'

// NOTE: workers no longer run here — see src/worker.js. Keeping them in this
// process meant a Puppeteer OOM took the HTTP server down with it, and made it
// impossible to scale the API separately from the queue consumers.

const app = express()

app.set('trust proxy', 1)

const allowedOrigins = (process.env.FRONTEND_URL || 'http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)

app.use(cors({ origin: allowedOrigins, credentials: true }))

// respond must come before the body parser: a malformed JSON body throws
// inside express.json() and goes straight to the error handler, which needs
// res.fail to already exist.
app.use(respond)
app.use(express.json({ limit: '1mb' }))

// Every request gets an id, echoed in the response header and attached to each
// log line, so a report can be traced from the browser through to the workers.
app.use(
    pinoHttp({
        logger,
        genReqId: (req, res) => {
            const id = req.headers['x-request-id'] || randomUUID()
            res.setHeader('x-request-id', id)
            return id
        },
        customLogLevel: (req, res, err) => {
            if (err || res.statusCode >= 500) return 'error'
            if (res.statusCode >= 400) return 'warn'
            if (req.url === '/health') return 'silent'
            return 'info'
        },
    })
)

app.use(globalLimiter)

// routes
app.use('/auth', authLimiter, authRoutes)
app.use('/cv', cvRoutes)
app.use('/jobs', jobRoutes)
app.use('/documents', documentRoutes)
app.use('/applications', applicationRoutes)
app.use('/webhooks', webhookRoutes)

// health
app.get('/health', (req, res) => {
    res.ok({ status: 'ok' })
})

app.use(notFoundHandler)
app.use(errorHandler)

const PORT = process.env.PORT || 3000
const server = app.listen(PORT, () => {
    logger.info({ port: PORT }, 'API listening')
})

function shutdown(signal) {
    logger.info({ signal }, 'shutting down API')
    server.close(() => process.exit(0))
    // Don't hang forever on a wedged connection.
    setTimeout(() => process.exit(1), 10000).unref()
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))
