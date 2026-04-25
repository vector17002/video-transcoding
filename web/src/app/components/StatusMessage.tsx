"use client";

import { useEffect, useState } from "react";

interface StatusMessageProps {
  message: string;
  type: "success" | "error" | "idle";
}

export default function StatusMessage({ message, type }: StatusMessageProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(!!(message && type !== "idle"));
  }, [message, type]);

  if (!message || type === "idle") return null;

  const colorMap = {
    success: "text-emerald-600",
    error: "text-red-500",
    idle: "",
  };

  return (
    <p
      className={`mt-3 text-xs text-center transition-opacity duration-200 ${colorMap[type]} ${
        visible ? "opacity-100" : "opacity-0"
      }`}
      role="alert"
    >
      {message}
    </p>
  );
}
