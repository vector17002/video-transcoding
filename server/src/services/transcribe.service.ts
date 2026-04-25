import { getDownloadUrl } from "../utils/getPresignedUrl.js";
import axios from "axios";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { spawn } from "child_process";
import ffmpeg from "fluent-ffmpeg";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import s3Client from "../config/s3.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Path to the Python binary inside the venv baked into the ai-worker image
const PYTHON_BIN = '/opt/whisper-venv/bin/python3';

// Model is set via ARG/ENV in the Dockerfile (default: base)
const WHISPER_MODEL = process.env.WHISPER_MODEL ?? 'base';

export interface TranscriptSegment {
    start: number;
    end: number;
    text: string;
}

export interface TranscriptResult {
    language: string;
    duration: number;
    segments: TranscriptSegment[];
    plainText: string;
}

// ── 1. Download the original video from S3 ────────────────────────────────
export const downloadOriginalForTranscription = async (
    fileId: string,
    userId: string,
    jobId: string
): Promise<string> => {
    const currentEnv = process.env.NODE_ENV === 'development' ? 'dev' : 'prod';
    const s3Key = `${currentEnv}/users/${userId}/${fileId}/original`;

    const signedUrl = await getDownloadUrl(s3Key);
    const response = await axios.get(signedUrl, { responseType: 'arraybuffer' });

    const downloadsDir = path.join(__dirname, '..', '..', 'downloads', 'transcribe');
    if (!fs.existsSync(downloadsDir)) {
        fs.mkdirSync(downloadsDir, { recursive: true });
    }

    const videoPath = path.join(downloadsDir, `${fileId}.mp4`);
    fs.writeFileSync(videoPath, response.data);
    console.log(`✅ Video downloaded for transcription: ${videoPath} (job ${jobId})`);
    return videoPath;
};

// ── 2. Extract mono 16 kHz WAV — Whisper's preferred input format ─────────
export const extractAudio = (videoPath: string): Promise<string> => {
    const audioPath = videoPath.replace('.mp4', '.wav');
    return new Promise((resolve, reject) => {
        ffmpeg(videoPath)
            .noVideo()
            .audioCodec('pcm_s16le')   // uncompressed — whisper reads it natively
            .audioFrequency(16000)      // 16 kHz is what Whisper expects
            .audioChannels(1)           // mono
            .output(audioPath)
            .on('end', () => {
                console.log(`✅ Audio extracted: ${audioPath}`);
                resolve(audioPath);
            })
            .on('error', (err) => {
                console.error('❌ Audio extraction failed:', err);
                reject(err);
            })
            .run();
    });
};

// ── 3. Run faster-whisper via Python subprocess ───────────────────────────
// We call the venv Python directly with an inline script so the worker
// container needs no additional setup beyond what the Dockerfile bakes in.
export const runWhisper = (audioPath: string): Promise<TranscriptResult> => {
    return new Promise((resolve, reject) => {
        // Inline Python — reads audio path and model name from argv
        const script = [
            'import sys, json',
            'from faster_whisper import WhisperModel',
            `model = WhisperModel(sys.argv[2], device="cpu", compute_type="int8")`,
            'segments, info = model.transcribe(sys.argv[1], beam_size=5)',
            'seg_list = [{"start": round(s.start, 2), "end": round(s.end, 2), "text": s.text.strip()} for s in segments]',
            'print(json.dumps({"language": info.language, "duration": round(info.duration, 2), "segments": seg_list}))',
        ].join('\n');

        const proc = spawn(PYTHON_BIN, ['-c', script, audioPath, WHISPER_MODEL]);

        let stdout = '';
        let stderr = '';

        proc.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
        proc.stderr.on('data', (chunk) => { stderr += chunk.toString(); });

        proc.on('close', (code) => {
            if (code !== 0) {
                return reject(new Error(`Whisper exited with code ${code}: ${stderr}`));
            }
            try {
                const parsed = JSON.parse(stdout.trim()) as Omit<TranscriptResult, 'plainText'>;
                resolve({
                    ...parsed,
                    plainText: parsed.segments.map((s) => s.text).join(' ').trim(),
                });
            } catch {
                reject(new Error(`Failed to parse Whisper JSON output: ${stdout}`));
            }
        });
    });
};

// ── 4. Upload transcript JSON to S3 ──────────────────────────────────────
export const uploadTranscript = async (
    transcript: TranscriptResult,
    fileId: string,
    userId: string
): Promise<string> => {
    const currentEnv = process.env.NODE_ENV === 'development' ? 'dev' : 'prod';
    const bucket = process.env.S3_BUCKET_NAME;
    const s3Key = `${currentEnv}/users/${userId}/${fileId}/transcript.json`;

    await s3Client.send(new PutObjectCommand({
        Bucket: bucket,
        Key: s3Key,
        Body: JSON.stringify(transcript, null, 2),
        ContentType: 'application/json',
    }));

    console.log(`☁️  Transcript uploaded to S3: ${s3Key}`);
    return s3Key;
};

// ── 5. Clean up local temp files ─────────────────────────────────────────
export const cleanupTranscribeFiles = (videoPath: string, audioPath: string) => {
    for (const filePath of [videoPath, audioPath]) {
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            console.log(`🗑️  Deleted temp file: ${filePath}`);
        }
    }
};
