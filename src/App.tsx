/**
 * @file App.tsx
 * @description Root application component for Qvault.
 *
 * Routing structure:
 *   /          → Landing page with hero + feature overview
 *   /upload    → UploadView — drag-and-drop encryption & Q-Link generation
 *   /view/:cid → DocumentView — access validation & decryption
 *   /dashboard → Dashboard — owner's document list
 *   *          → 404
 */

import { BrowserRouter, Routes, Route } from "react-router-dom";
import LandingPage from "./pages/LandingPage";
import UploadView from "./pages/UploadView";
import DocumentView from "./pages/DocumentView";
import Dashboard from "./pages/Dashboard";
import NotFound from "./pages/NotFound";
import Navbar from "./components/Navbar";

export default function App() {
  return (
    <BrowserRouter>
      {/* Global dark background */}
      <div className="min-h-screen bg-[#080B14] text-white font-['Inter',sans-serif]">
        <Navbar />
        <Routes>
          <Route path="/"            element={<LandingPage />} />
          <Route path="/upload"      element={<UploadView />} />
          <Route path="/view/:cid"   element={<DocumentView />} />
          <Route path="/dashboard"   element={<Dashboard />} />
          <Route path="*"            element={<NotFound />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}
