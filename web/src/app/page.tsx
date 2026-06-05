"use client";

import { useAuth } from "@/app/hooks/useAuth";
import AuthForm from "@/app/components/AuthForm";
import UploadView from "@/app/components/UploadView";

export default function HomePage() {
  const { token, isLoggedIn, isChecking, login, logout } = useAuth();

  if (isChecking) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-white" style={{ backgroundColor: '#ffffff' }}>
        <div className="w-4 h-4 border-2 border-neutral-200 border-t-neutral-400 rounded-full animate-spin" />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-white flex items-center justify-center px-6 py-24" style={{ backgroundColor: '#ffffff' }}>
      {isLoggedIn && token ? (
        <UploadView token={token} onUnauthorized={logout} onLogout={logout} />
      ) : (
        <AuthForm onLoginSuccess={login} />
      )}
    </main>
  );
}
