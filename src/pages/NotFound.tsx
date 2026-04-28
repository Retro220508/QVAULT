/**
 * @file NotFound.tsx
 * @description 404 page for unmatched routes.
 */

import { Link } from "react-router-dom";
import { Shield, Home } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4 pt-16">
      <div className="text-center max-w-md">
        {/* Glitch-style 404 */}
        <div className="mb-6 relative">
          <p className="text-9xl font-black text-white/5 select-none">404</p>
          <p className="absolute inset-0 flex items-center justify-center text-4xl font-black bg-gradient-to-r from-cyan-400 to-violet-400 bg-clip-text text-transparent">
            404
          </p>
        </div>

        <div className="mb-4 flex justify-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-500 to-violet-600 shadow-lg">
            <Shield className="h-7 w-7 text-white" />
          </div>
        </div>

        <h1 className="mb-3 text-2xl font-bold text-white">Page Not Found</h1>
        <p className="mb-8 text-slate-400">
          The page you're looking for doesn't exist. If you received a Q-Link,
          make sure the URL starts with <code className="text-cyan-400">/view/</code>
        </p>

        <div className="flex items-center justify-center gap-3">
          <Link
            to="/"
            className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-violet-600 px-6 py-3 font-bold text-white shadow-lg"
          >
            <Home className="h-4 w-4" />
            Go Home
          </Link>
          <Link
            to="/upload"
            className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-6 py-3 font-bold text-white hover:bg-white/10"
          >
            <Shield className="h-4 w-4" />
            Upload
          </Link>
        </div>
      </div>
    </div>
  );
}
