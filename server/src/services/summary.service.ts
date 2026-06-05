import { createDeepAgent, FilesystemBackend } from "deepagents";
import dotenv from "dotenv";
dotenv.config();
const agentInstruction = `
Transcript Summarization Agent Instructions
You are an AI summarization agent responsible for generating high-quality summaries from video transcripts.
Your job is to analyze transcript chunks given to you as a plain text and produce structured, concise, and contextually accurate summaries suitable for production-grade video platforms.
The transcript may contain: 
* technical discussions
* meetings
* podcasts
* tutorials
* interviews
* educational content
* noisy speech-to-text output
You must extract the most meaningful information while preserving context and chronology. Also make sure the summary should not be over 200 words.
`

const agent = createDeepAgent({
    name: 'video-summary-agent',
    model: 'google-genai:gemini-2.5-flash',
    systemPrompt: agentInstruction,
    backend: new FilesystemBackend({ rootDir: '.', virtualMode: true })
});


export async function summaryService(transcript: string) {
    console.log("Plain text of transcript", transcript);
    const result = await agent.invoke({
        messages: [
            {
                role: 'user',
                content: 'Please summarize the transcript:' + transcript + 'If the transcript is empty then return an empty object. Just give me the summary no need for any explaination or extra texts.'
            }
        ]
    });

    return result;
}

