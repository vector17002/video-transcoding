import express from "express";
import cors from "cors";
import authRouter from "./routes/auth.routes.js";
import s3Router from "./routes/s3.routes.js";
import { authMiddleware } from "./middleware/auth.middleware.js";

// Initialize BullMQ workers
import "./workers/transcode.worker.js";
import "./workers/hls.worker.js";

const app = express();
app.use(cors({
    origin: function (origin, callback) {
        // allow all origins including null for local file:// testing
        callback(null, origin || '*');
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json()); // body-parser is built into Express 5

app.use("/api/auth", authRouter);
app.use("/api/s3", authMiddleware, s3Router);

export default app;

