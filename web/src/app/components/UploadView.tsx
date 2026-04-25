"use client";

import { useState, useRef, useCallback, DragEvent } from "react";
import { getPresignedUrl, uploadToS3WithProgress, notifyProcessing } from "@/app/lib/api";
import StatusMessage from "./StatusMessage";
import ProgressBar from "./ProgressBar";

interface UploadViewProps {
  token: string;
  onUnauthorized: () => void;
  onLogout: () => void;
}

export default function UploadView({ token, onUnauthorized, onLogout }: UploadViewProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [status, setStatus] = useState<{ message: string; type: "success" | "error" | "idle" }>({
    message: "", type: "idle",
  });

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = useCallback((file: File | null) => {
    if (!file) return;
    setSelectedFile(file);
    setStatus({ message: "", type: "idle" });
    setUploadProgress(0);
  }, []);

  const prevent = (e: DragEvent) => { e.preventDefault(); e.stopPropagation(); };
  const handleDragEnter = (e: DragEvent) => { prevent(e); setIsDragOver(true); };
  const handleDragLeave = (e: DragEvent) => { prevent(e); setIsDragOver(false); };
  const handleDrop = (e: DragEvent) => {
    prevent(e);
    setIsDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) handleFileSelect(f);
  };

  const handleUpload = async () => {
    if (!selectedFile) return;
    setStatus({ message: "", type: "idle" });
    setUploading(true);
    setUploadProgress(0);
    try {
      const { url, fileId } = await getPresignedUrl(selectedFile.type || "application/octet-stream", token);
      await uploadToS3WithProgress(selectedFile, url, (pct) => setUploadProgress(pct));
      try { await notifyProcessing(fileId, token); } catch { /* non-fatal */ }
      setStatus({ message: `Upload complete — File ID: ${fileId}`, type: "success" });
      setSelectedFile(null);
      setUploadProgress(0);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (err: unknown) {
      if (err instanceof Error && err.message === "UNAUTHORIZED") { onUnauthorized(); return; }
      setStatus({ message: err instanceof Error ? err.message : "Upload failed.", type: "error" });
    } finally {
      setUploading(false);
    }
  };

  const formatSize = (b: number) =>
    b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${(b / 1024).toFixed(0)} KB`;

  return (
    <div className="w-full max-w-[420px]">

      {/* ── Top nav bar ── */}
      <div className="flex items-center justify-between mb-14">
        <div className="flex items-center gap-3">
          <div className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-black">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white"
              strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
          </div>
          <span className="text-sm font-medium text-neutral-600">S3 Upload</span>
        </div>

        <button
          id="logout-btn"
          onClick={onLogout}
          className="text-sm text-neutral-400 hover:text-neutral-700 transition-colors duration-150"
        >
          Sign out
        </button>
      </div>

      {/* ── Heading ── */}
      <h1 className="text-2xl font-semibold text-neutral-900 tracking-tight mb-3">
        Upload a file
      </h1>

      {/* ── Subtitle ── */}
      <p className="text-sm text-neutral-400 mb-10">
        Files are securely uploaded to S3 via a presigned URL.
      </p>

      {/* ── Drop zone ── */}
      <div
        id="drop-zone"
        onDragEnter={handleDragEnter}
        onDragOver={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`relative rounded-xl border-2 border-dashed cursor-pointer transition-all duration-150 ${
          isDragOver
            ? "border-black bg-neutral-50"
            : "border-neutral-200 hover:border-neutral-300 bg-white hover:bg-neutral-50/60"
        }`}
      >
        <input
          ref={fileInputRef}
          id="file-input"
          type="file"
          className="hidden"
          onChange={(e) => handleFileSelect(e.target.files?.[0] ?? null)}
        />

        <div className="flex flex-col items-center justify-center py-14 px-10 text-center">
          {selectedFile ? (
            <>
              <div className="w-11 h-11 mb-5 rounded-xl border border-neutral-200 flex items-center justify-center bg-white shadow-sm">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#525252"
                  strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                </svg>
              </div>
              <p className="text-sm font-medium text-neutral-800 mb-2 break-all leading-snug max-w-[280px]">
                {selectedFile.name}
              </p>
              <p className="text-xs text-neutral-400 mb-4">
                {formatSize(selectedFile.size)}
              </p>
              <span className="text-xs text-neutral-400 underline underline-offset-2 decoration-neutral-300">
                Click to change
              </span>
            </>
          ) : (
            <>
              <div className="w-11 h-11 mb-5 rounded-xl border border-neutral-200 flex items-center justify-center bg-white shadow-sm">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#a3a3a3"
                  strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
              </div>
              <p className="text-sm font-medium text-neutral-700 mb-2">
                Drag & drop your file here
              </p>
              <p className="text-xs text-neutral-400">
                or{" "}
                <span className="underline underline-offset-2 decoration-neutral-300 text-neutral-500">
                  browse files
                </span>
              </p>
            </>
          )}
        </div>
      </div>

      {/* ── Progress bar ── */}
      <div className="mt-5">
        <ProgressBar progress={uploadProgress} visible={uploading} />
      </div>

      {/* ── Upload button ── */}
      <div className="mt-5">
        <button
          id="upload-btn"
          type="button"
          onClick={handleUpload}
          disabled={!selectedFile || uploading}
          className="w-full h-11 flex items-center justify-center gap-2 bg-black hover:bg-neutral-800 active:scale-[0.99] disabled:opacity-30 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-all duration-150"
        >
          {uploading ? (
            <>
              <svg className="animate-spin h-3.5 w-3.5 text-white/50"
                xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10"
                  stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Uploading… {Math.round(uploadProgress)}%
            </>
          ) : "Upload file"}
        </button>
      </div>

      {/* ── Status message ── */}
      <div className="mt-5">
        <StatusMessage message={status.message} type={status.type} />
      </div>

    </div>
  );
}
