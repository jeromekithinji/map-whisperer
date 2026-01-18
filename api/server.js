import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import routes from './routes.js'

// Load environment variables
dotenv.config()

const app = express()
const PORT = process.env.PORT || 3001

// Middleware
app.use(cors())
app.use(express.json())

// Health check endpoint
app.get('/health', (req, res) => {
	res.json({ ok: true, status: 'healthy' })
})

// API routes
app.use('/api', routes)

// 404 handler
app.use((req, res) => {
	res.status(404).json({
		ok: false,
		error: 'Not found',
	})
})

// Error handler
app.use((err, req, res, next) => {
	console.error('Error:', err)
	res.status(500).json({
		ok: false,
		error: err.message || 'Internal server error',
	})
})

// Start server
app.listen(PORT, () => {
	console.log(`Server running on http://localhost:${PORT}`)
	console.log(`API endpoints available at http://localhost:${PORT}/api`)
})
