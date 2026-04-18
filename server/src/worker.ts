import 'dotenv/config.js'
import './utils/logger.js'
import './config/db.js'

// Initialize BullMQ workers
import './workers/transcode.worker.js'
import './workers/hls.worker.js'
import './workers/thumbnail.worker.js'

console.log('🚀 Workers started and listening for jobs...')
