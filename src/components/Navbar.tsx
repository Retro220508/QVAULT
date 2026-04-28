/**
 * @file Navbar.tsx
 * @description Global navigation bar with wallet connection button.
 */

import { useState, useEffect, useCallback } from "react";
import { Link, useLocation } from "react-router-dom";
import { Shield, Wallet, Menu, X, ChevronRight, Zap } from "lucide-react";
import { getProvider, getConnectedAddress, isMetaMaskInstalled } from "../utils/contractUtils";

export default function Navbar() {
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [isConnecting,  setIsConnecting]  = useState(false);
  const [menuOpen,      setMenuOpen]      = useState(false);
  const location = useLocation();

  /** Truncate wallet address for display: 0x1234…abcd */
  const shortAddress = walletAddress
    ? `${walletAddress.slice(0, 6)}…${walletAddress.slice(-4)}`
    : null;

  /** Check for already-connected wallet on mount */
  useEffect(() => {
    getConnectedAddress().then(addr => {
      if (addr) setWalletAddress(addr);
    });
  }, []);

  /** Listen for MetaMask account changes */
  useEffect(() => {
    if (!isMetaMaskInstalled()) return;
    const handler = (accounts: unknown) => {
      const list = accounts as string[];
      setWalletAddress(list.length > 0 ? list[0] : null);
    };
    window.ethereum!.on("accountsChanged", handler);
    return () => window.ethereum!.removeListener("accountsChanged", handler);
  }, []);

  const connectWallet = useCallback(async () => {
    if (isConnecting) return;
    setIsConnecting(true);
    try {
      if (!isMetaMaskInstalled()) {
        window.open("https://metamask.io/download/", "_blank");
        return;
      }
      const provider  = getProvider();
      await provider.send("eth_requestAccounts", []);
      const accounts  = await provider.send("eth_accounts", []) as string[];
      if (accounts.length > 0) setWalletAddress(accounts[0]);
    } catch (err) {
      console.error("Wallet connection failed:", err);
    } finally {
      setIsConnecting(false);
    }
  }, [isConnecting]);

  const navLinks = [
    { to: "/",          label: "Home"      },
    { to: "/upload",    label: "Upload"    },
    { to: "/dashboard", label: "Dashboard" },
  ];

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 border-b border-white/5 bg-[#080B14]/80 backdrop-blur-xl">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="flex h-16 items-center justify-between">

          {/* ── Logo ─────────────────────────────────────────────────────── */}
          <Link to="/" className="flex items-center gap-2.5 group">
            <div className="relative flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-500 to-violet-600 shadow-lg shadow-cyan-500/20">
              <Shield className="h-4 w-4 text-white" />
              {/* Animated pulse ring */}
              <div className="absolute inset-0 rounded-lg bg-cyan-400/30 animate-ping opacity-0 group-hover:opacity-100 duration-1000" />
            </div>
            <span className="font-bold text-lg tracking-tight">
              Q<span className="text-cyan-400">vault</span>
            </span>
          </Link>

          {/* ── Desktop Nav Links ─────────────────────────────────────────── */}
          <div className="hidden md:flex items-center gap-1">
            {navLinks.map(link => (
              <Link
                key={link.to}
                to={link.to}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all duration-150 ${
                  location.pathname === link.to
                    ? "text-cyan-400 bg-cyan-400/10"
                    : "text-slate-400 hover:text-white hover:bg-white/5"
                }`}
              >
                {link.label}
              </Link>
            ))}
          </div>

          {/* ── Wallet Button ─────────────────────────────────────────────── */}
          <div className="flex items-center gap-3">
            {walletAddress ? (
              <div className="flex items-center gap-2 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-1.5">
                <div className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                <Wallet className="h-3.5 w-3.5 text-cyan-400" />
                <span className="text-xs font-mono text-cyan-300">{shortAddress}</span>
              </div>
            ) : (
              <button
                onClick={connectWallet}
                disabled={isConnecting}
                className="hidden md:flex items-center gap-2 rounded-lg bg-gradient-to-r from-cyan-500 to-violet-600 px-4 py-1.5 text-sm font-semibold text-white shadow-lg shadow-cyan-500/20 hover:shadow-cyan-500/40 transition-all duration-200 disabled:opacity-70"
              >
                {isConnecting ? (
                  <>
                    <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                    Connecting…
                  </>
                ) : (
                  <>
                    <Zap className="h-3.5 w-3.5" />
                    Connect Wallet
                  </>
                )}
              </button>
            )}

            {/* Mobile menu toggle */}
            <button
              onClick={() => setMenuOpen(o => !o)}
              className="md:hidden rounded-lg p-1.5 text-slate-400 hover:text-white hover:bg-white/5"
            >
              {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>
      </div>

      {/* ── Mobile Menu ─────────────────────────────────────────────────── */}
      {menuOpen && (
        <div className="md:hidden border-t border-white/5 bg-[#080B14] px-4 py-3 space-y-1">
          {navLinks.map(link => (
            <Link
              key={link.to}
              to={link.to}
              onClick={() => setMenuOpen(false)}
              className={`flex items-center justify-between rounded-lg px-3 py-2.5 text-sm font-medium ${
                location.pathname === link.to
                  ? "text-cyan-400 bg-cyan-400/10"
                  : "text-slate-300 hover:bg-white/5"
              }`}
            >
              {link.label}
              <ChevronRight className="h-4 w-4 opacity-50" />
            </Link>
          ))}
          {!walletAddress && (
            <button
              onClick={() => { connectWallet(); setMenuOpen(false); }}
              className="w-full mt-2 flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-cyan-500 to-violet-600 px-4 py-2.5 text-sm font-semibold text-white"
            >
              <Zap className="h-4 w-4" />
              Connect Wallet
            </button>
          )}
        </div>
      )}
    </nav>
  );
}
