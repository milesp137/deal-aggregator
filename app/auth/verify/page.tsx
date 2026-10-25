"use client";

import axios from "axios";
import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { api } from "@/lib/client";

/** Landing page for the emailed sign-in link. The token is in the URL fragment (never sent to servers). */
export default function VerifyPage() {
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false); // a login token is single-use, so never submit it twice

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const token = new URLSearchParams(window.location.hash.replace(/^#/, "")).get("token");
    // Drop the token from the address bar and history right away.
    window.history.replaceState(null, "", window.location.pathname);
    if (!token) {
      setError("This sign-in link is incomplete. Request a new one.");
      return;
    }
    api
      .post("/api/auth/verify", { token })
      .then(() => window.location.replace("/"))
      .catch((err) =>
        setError(
          axios.isAxiosError(err)
            ? (err.response?.data as { error?: string } | undefined)?.error ?? "Couldn't sign you in."
            : "Couldn't sign you in.",
        ),
      );
  }, []);

  return (
    <div className="grid min-h-screen place-items-center px-4">
      <div className="max-w-sm text-center">
        {error ? (
          <>
            <AlertTriangle className="mx-auto mb-3 h-10 w-10 text-yellow-400" />
            <p className="text-lg font-semibold text-white">Sign-in didn&apos;t work</p>
            <p className="mt-1 text-sm text-zinc-400">{error}</p>
            <a href="/" className="btn-primary mt-5 inline-flex">
              Back to DealRadar
            </a>
          </>
        ) : (
          <>
            <Loader2 className="mx-auto mb-3 h-10 w-10 animate-spin text-brand" />
            <p className="text-lg font-semibold text-white">Signing you in...</p>
          </>
        )}
      </div>
    </div>
  );
}
