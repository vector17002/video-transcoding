import { Router } from "express";
import { s3UploadService, s3GetService, s3ProcessService } from "../services/s3.service.js";

const router = Router()

router.get("/get/:fileId", s3GetService)
router.post("/upload", s3UploadService)
router.post("/process", s3ProcessService)

export default router