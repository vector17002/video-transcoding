// Typed API helpers — all calls go through the Next.js rewrite proxy (/api → localhost:8080/api)

const API_BASE = "/api";

export interface AuthResponse {
  user: { id: string; email: string };
  token: string;
  message?: string;
}

export interface PresignedUrlResponse {
  url: string;
  fileId: string;
  message?: string;
}

// ── Auth ─────────────────────────────────────────────────────────────────────

export async function loginUser(
  email: string,
  password: string
): Promise<AuthResponse> {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || "Login failed");
  return data as AuthResponse;
}

export async function registerUser(
  email: string,
  password: string
): Promise<AuthResponse> {
  const res = await fetch(`${API_BASE}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || "Registration failed");
  return data as AuthResponse;
}

// ── Upload ────────────────────────────────────────────────────────────────────

export async function getPresignedUrl(
  contentType: string,
  token: string
): Promise<PresignedUrlResponse> {
  const res = await fetch(`${API_BASE}/s3/upload`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    credentials: "include",
    body: JSON.stringify({ contentType }),
  });

  if (res.status === 401) {
    throw new Error("UNAUTHORIZED");
  }
  if (!res.ok) {
    throw new Error("Failed to get upload URL");
  }

  return res.json() as Promise<PresignedUrlResponse>;
}

export async function notifyProcessing(
  fileId: string,
  token: string
): Promise<void> {
  await fetch(`${API_BASE}/s3/process`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    credentials: "include",
    body: JSON.stringify({ fileId }),
  });
}

export function uploadToS3WithProgress(
  file: File,
  presignedUrl: string,
  onProgress: (pct: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable) {
        onProgress((e.loaded / e.total) * 100);
      }
    });

    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        reject(new Error(`S3 responded with status ${xhr.status}`));
      }
    });

    xhr.addEventListener("error", () =>
      reject(new Error("Network error during upload"))
    );
    xhr.addEventListener("abort", () => reject(new Error("Upload aborted")));

    xhr.open("PUT", presignedUrl, true);
    xhr.setRequestHeader(
      "Content-Type",
      file.type || "application/octet-stream"
    );
    xhr.send(file);
  });
}
