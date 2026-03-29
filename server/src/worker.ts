import 'dotenv/config.js'
import './utils/logger.js'

// Initialize BullMQ workers
import './workers/transcode.worker.js'
import './workers/hls.worker.js'

console.log('🚀 Workers started and listening for jobs...')
