import 'dotenv/config.js'
import './utils/logger.js'
import './config/db.js'

// Only the transcription worker runs in this container.
// The regular worker (transcode/hls/thumbnail) runs in the worker image
// which doesn't have Python or faster-whisper installed.
import './workers/transcribe.worker.js'

console.log('🚀 AI Worker started and listening for transcription jobs...')
