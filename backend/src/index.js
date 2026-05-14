import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'

dotenv.config()

// routes
import authRoutes from './routes/auth.js'
import cvRoutes from './routes/cv.js'
import jobRoutes from './routes/jobs.js'
import documentRoutes from './routes/documents.js'
import applicationRoutes from './routes/applications.js'
import webhookRoutes from './routes/webhooks.js'

// workers — import to initialise them
import './workers/cvWorker.js'
import './workers/scrapeWorker.js'
import './workers/scoreWorker.js'
import './workers/docgenWorker.js'
import './workers/digestWorker.js'
import './workers/digestScheduler.js'

const app = express()

app.use(cors())
app.use(express.json())

// routes
app.use('/auth', authRoutes)
app.use('/cv', cvRoutes)
app.use('/jobs', jobRoutes)
app.use('/documents', documentRoutes)
app.use('/applications', applicationRoutes)
app.use('/webhooks', webhookRoutes)

// health
app.get('/health', (req, res) => {
    res.json({ status: 'ok' })
})

const PORT = process.env.PORT || 3000
app.listen(PORT, () => {
    console.log(`✅ Server running on port ${PORT}`)
})