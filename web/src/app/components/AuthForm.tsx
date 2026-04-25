"use client";

import { useState } from "react";
import { loginUser, registerUser } from "@/app/lib/api";
import StatusMessage from "./StatusMessage";

interface AuthFormProps {
  onLoginSuccess: (token: string) => void;
}

export default function AuthForm({ onLoginSuccess }: AuthFormProps) {
  const [isLoginMode, setIsLoginMode] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<{
    message: string;
    type: "success" | "error" | "idle";
  }>({ message: "", type: "idle" });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus({ message: "", type: "idle" });
    setLoading(true);
    try {
      const data = isLoginMode
        ? await loginUser(email, password)
        : await registerUser(email, password);
      setStatus({ message: isLoginMode ? "Signed in." : "Account created.", type: "success" });
      setTimeout(() => onLoginSuccess(data.token), 700);
    } catch (err: unknown) {
      setStatus({
        message: err instanceof Error ? err.message : "Something went wrong.",
        type: "error",
      });
    } finally {
      setLoading(false);
    }
  };

  const toggleMode = () => {
    setIsLoginMode((p) => !p);
    setStatus({ message: "", type: "idle" });
  };

  return (
    <div className="w-full max-w-[380px]">

      {/* ── Logo ── */}
      <div className="mb-12">
        <div className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-black">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="white"
            strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
        </div>
      </div>

      {/* ── Heading ── */}
      <h1 className="text-2xl font-semibold text-neutral-900 tracking-tight mb-3">
        {isLoginMode ? "Sign in to your account" : "Create an account"}
      </h1>

      {/* ── Subtitle ── */}
      <p className="text-sm text-neutral-400 leading-relaxed mb-12">
        {isLoginMode
          ? "Welcome back. Enter your details below."
          : "Get started in seconds. No credit card required."}
      </p>

      {/* ── Form ── */}
      <form onSubmit={handleSubmit} noValidate>

        {/* Email field */}
        <div className="mb-8">
          <label
            htmlFor="email"
            className="block text-sm font-medium text-neutral-700 mb-2.5"
          >
            Email address
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            required
            className="w-full h-11 px-3.5 text-sm text-neutral-900 bg-white border border-neutral-200 rounded-lg placeholder-neutral-300 outline-none focus:border-neutral-400 focus:ring-2 focus:ring-neutral-100 transition-all duration-150"
          />
        </div>

        {/* Password field */}
        <div className="mb-10">
          <label
            htmlFor="password"
            className="block text-sm font-medium text-neutral-700 mb-2.5"
          >
            Password
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            required
            className="w-full h-11 px-3.5 text-sm text-neutral-900 bg-white border border-neutral-200 rounded-lg placeholder-neutral-300 outline-none focus:border-neutral-400 focus:ring-2 focus:ring-neutral-100 transition-all duration-150"
          />
        </div>

        {/* Submit */}
        <button
          id="auth-submit-btn"
          type="submit"
          disabled={loading}
          className="w-full h-11 flex items-center justify-center gap-2 bg-black hover:bg-neutral-800 active:scale-[0.99] disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-all duration-150"
        >
          {loading ? (
            <>
              <svg className="animate-spin h-3.5 w-3.5 text-white/50"
                xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10"
                  stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              {isLoginMode ? "Signing in…" : "Creating account…"}
            </>
          ) : isLoginMode ? "Sign in" : "Create account"}
        </button>

      </form>

      {/* ── Status message ── */}
      <div className="mt-4">
        <StatusMessage message={status.message} type={status.type} />
      </div>

      {/* ── Divider ── */}
      <div className="mt-12 pt-10 border-t border-neutral-100">
        <p className="text-sm text-center text-neutral-400">
          {isLoginMode ? "Don't have an account?" : "Already have an account?"}{" "}
          <button
            id="auth-toggle-btn"
            onClick={toggleMode}
            className="text-neutral-800 font-medium hover:text-black underline underline-offset-2 decoration-neutral-300 hover:decoration-neutral-600 transition-colors duration-150"
          >
            {isLoginMode ? "Sign up" : "Sign in"}
          </button>
        </p>
      </div>

    </div>
  );
}
