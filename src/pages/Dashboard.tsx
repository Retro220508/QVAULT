/**
 * @file Dashboard.tsx
 * @description Owner dashboard showing all uploaded documents and their access stats.
 *
 * Lists all documents registered by the connected wallet, with real-time
 * status from the smart contract (or demo localStorage).
 */

import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import {
  Shield, Eye, Clock, Activity, Flame, Plus,
  RefreshCw, ExternalLink, AlertCircle, Loader2,
  BarChart3, Lock, Unlock, Wallet
} from "lucide-react";
import {
  getConnectedAddress,
  getOwnerDocuments,
  getDocumentInfo,
  revokeAccess,
  isMetaMaskInstalled,
  parseContractError,
  getSigner,
} from "../utils/contractUtils";

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

interface DocumentEntry {
  cid: string;
  maxViews: number;
  currentViews: number;
  remainingViews: number;
  expirationTimestamp: number;
  isActive: boolean;
  owner: string;
  isDemo?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// DEMO MODE: Load from localStorage
// ─────────────────────────────────────────────────────────────────────────────

function loadDemoDashboard(): DocumentEntry[] {
  try {
    const contracts = JSON.parse(
      localStorage.getItem("qvault_demo_contracts") ?? "{}"
    ) as Record<string, {
      cid: string;
      maxViews: number;
      currentViews: number;
      expirationTimestamp: number;
      isActive: boolean;
      owner: string;
    }>;

    return Object.values(contracts).map(doc => ({
      ...doc,
      remainingViews: Math.max(0, doc.maxViews - doc.currentViews),
      isDemo: true,
    }));
  } catch {
    return [];
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SUB-COMPONENTS
// ─────────────────────────────────────────────────────────────────────────────

function StatusBadge({ isActive, remainingViews }: { isActive: boolean; remainingViews: number }) {
  if (!isActive || remainingViews === 0) {
    return (
      <span className="flex items-center gap-1.5 rounded-full border border-red-500/20 bg-red-500/10 px-2.5 py-0.5 text-xs font-medium text-red-400">
        <Flame className="h-3 w-3" />
        Burned
      </span>
    );
  }
  if (remainingViews <= 1) {
    return (
      <span className="flex items-center gap-1.5 rounded-full border border-amber-500/20 bg-amber-500/10 px-2.5 py-0.5 text-xs font-medium text-amber-400">
        <AlertCircle className="h-3 w-3" />
        Last View
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-400">
      <div className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
      Active
    </span>
  );
}

function ViewProgress({ current, max }: { current: number; max: number }) {
  const pct = Math.min(100, (current / max) * 100);
  const color = pct >= 100 ? "bg-red-500" : pct >= 66 ? "bg-amber-500" : "bg-cyan-500";

  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-slate-500">Views Used</span>
        <span className="text-slate-300 font-medium">{current} / {max}</span>
      </div>
      <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function DocumentCard({
  doc,
  onRevoke,
}: {
  doc: DocumentEntry;
  onRevoke: (cid: string) => void;
}) {
  const expiryDate = doc.expirationTimestamp > 0
    ? new Date(doc.expirationTimestamp * 1000).toLocaleString()
    : "Never";

  const isExpired = doc.expirationTimestamp > 0 && Date.now() / 1000 >= doc.expirationTimestamp;
  const isBurned  = !doc.isActive || doc.remainingViews === 0;

  return (
    <div className={`rounded-2xl border bg-white/[0.02] p-5 transition-all hover:bg-white/[0.03] ${
      isBurned ? "border-red-500/10 opacity-60" : "border-white/10"
    }`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-center gap-2 min-w-0">
          <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
            isBurned ? "bg-red-500/10" : "bg-cyan-500/10"
          }`}>
            {isBurned
              ? <Flame className="h-4 w-4 text-red-400" />
              : <Shield className="h-4 w-4 text-cyan-400" />
            }
          </div>
          <div className="min-w-0">
            <code className="text-xs text-cyan-400 font-mono">
              {doc.cid.slice(0, 16)}…{doc.cid.slice(-8)}
            </code>
            {doc.isDemo && (
              <span className="ml-2 text-[10px] text-amber-400 border border-amber-500/20 rounded px-1.5 py-0.5">
                DEMO
              </span>
            )}
          </div>
        </div>
        <StatusBadge isActive={doc.isActive} remainingViews={doc.remainingViews} />
      </div>

      {/* View Progress */}
      <div className="mb-4">
        <ViewProgress current={doc.currentViews} max={doc.maxViews} />
      </div>

      {/* Details */}
      <div className="mb-4 space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="flex items-center gap-1.5 text-slate-500">
            <Clock className="h-3 w-3" />
            Expires
          </span>
          <span className={`text-slate-400 ${isExpired ? "text-red-400" : ""}`}>
            {isExpired ? "⚠️ Expired" : expiryDate}
          </span>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="flex items-center gap-1.5 text-slate-500">
            <Eye className="h-3 w-3" />
            Remaining
          </span>
          <span className={`font-semibold ${
            doc.remainingViews === 0 ? "text-red-400" :
            doc.remainingViews <= 2 ? "text-amber-400" : "text-emerald-400"
          }`}>
            {doc.remainingViews} view{doc.remainingViews !== 1 ? "s" : ""}
          </span>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        {!isBurned && (
          <Link
            to={`/view/${doc.cid}`}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] py-2 text-xs text-slate-400 hover:text-white hover:border-white/20 transition-all"
          >
            <ExternalLink className="h-3 w-3" />
            View
          </Link>
        )}
        {doc.isActive && (
          <button
            onClick={() => onRevoke(doc.cid)}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-red-500/20 bg-red-500/5 py-2 text-xs text-red-400 hover:bg-red-500/10 transition-all"
          >
            <Lock className="h-3 w-3" />
            Revoke
          </button>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const [address,  setAddress]  = useState<string | null>(null);
  const [docs,     setDocs]     = useState<DocumentEntry[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState("");
  const [isDemo,   setIsDemo]   = useState(!isMetaMaskInstalled());
  const [revoking, setRevoking] = useState<string | null>(null);

  const loadDocuments = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      let addr = await getConnectedAddress();

      if (!addr && isMetaMaskInstalled()) {
        // Try to connect
        try {
          const signer = await getSigner();
          addr = await signer.getAddress();
        } catch {
          addr = null;
        }
      }

      setAddress(addr);

      if (addr && !isDemo) {
        // Real blockchain data
        try {
          const cids = await getOwnerDocuments(addr);
          const entries = await Promise.all(
            cids.map(async (cid) => {
              const info = await getDocumentInfo(cid);
              if (!info) return null;
              return {
                cid,
                maxViews:            Number(info.maxViews),
                currentViews:        Number(info.currentViews),
                remainingViews:      Number(info.remainingViews),
                expirationTimestamp: Number(info.expirationTimestamp),
                isActive:            info.isActive,
                owner:               info.owner,
              } as DocumentEntry;
            })
          );
          setDocs(entries.filter(Boolean) as DocumentEntry[]);
        } catch {
          // Contract not deployed — fall back to demo
          setIsDemo(true);
          setDocs(loadDemoDashboard());
        }
      } else {
        // Demo mode
        setIsDemo(true);
        setDocs(loadDemoDashboard());
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load documents");
    } finally {
      setLoading(false);
    }
  }, [isDemo]);

  useEffect(() => {
    loadDocuments();
  }, [loadDocuments]);

  const handleRevoke = useCallback(async (cid: string) => {
    if (!confirm(`Permanently revoke access to document ${cid.slice(0, 16)}…? This cannot be undone.`)) {
      return;
    }

    setRevoking(cid);
    try {
      if (isDemo) {
        // Demo: update localStorage
        const contracts = JSON.parse(localStorage.getItem("qvault_demo_contracts") ?? "{}");
        if (contracts[cid]) {
          contracts[cid].isActive = false;
          localStorage.setItem("qvault_demo_contracts", JSON.stringify(contracts));
        }
        setDocs(prev => prev.map(d => d.cid === cid ? { ...d, isActive: false } : d));
      } else {
        await revokeAccess(cid);
        // Refresh the document status
        await loadDocuments();
      }
    } catch (err) {
      alert(`Failed to revoke: ${parseContractError(err)}`);
    } finally {
      setRevoking(null);
    }
  }, [isDemo, loadDocuments]);

  // Stats
  const totalDocs    = docs.length;
  const activeDocs   = docs.filter(d => d.isActive && d.remainingViews > 0).length;
  const burnedDocs   = docs.filter(d => !d.isActive || d.remainingViews === 0).length;
  const totalViews   = docs.reduce((s, d) => s + d.currentViews, 0);

  return (
    <div className="min-h-screen pt-24 pb-16 px-4">
      <div className="mx-auto max-w-5xl">

        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white mb-1">My Documents</h1>
            <p className="text-slate-400 text-sm">
              {address
                ? `Connected: ${address.slice(0, 6)}…${address.slice(-4)}`
                : isDemo ? "Demo Mode — no wallet required"
                : "Connect your wallet to see your documents"
              }
            </p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={loadDocuments}
              disabled={loading}
              className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-400 hover:text-white transition-all"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </button>
            <Link
              to="/upload"
              className="flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-cyan-500 to-violet-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-cyan-500/20"
            >
              <Plus className="h-4 w-4" />
              New Q-Link
            </Link>
          </div>
        </div>

        {/* Demo Banner */}
        {isDemo && (
          <div className="mb-6 rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 flex items-start gap-3">
            <AlertCircle className="h-4 w-4 text-amber-400 mt-0.5 shrink-0" />
            <div className="text-sm">
              <p className="font-medium text-amber-400">Demo Mode Dashboard</p>
              <p className="text-slate-400 mt-0.5">
                Showing documents from localStorage demo. Upload a document to see it here.
                Connect MetaMask and deploy the contract for real on-chain management.
              </p>
            </div>
          </div>
        )}

        {/* Stats Cards */}
        <div className="mb-8 grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "Total Docs",    value: totalDocs,  icon: Shield,    color: "text-white"       },
            { label: "Active Links",  value: activeDocs, icon: Activity,  color: "text-emerald-400" },
            { label: "Burned Links",  value: burnedDocs, icon: Flame,     color: "text-red-400"     },
            { label: "Total Views",   value: totalViews, icon: BarChart3, color: "text-cyan-400"    },
          ].map(stat => {
            const Icon = stat.icon;
            return (
              <div key={stat.label} className="rounded-2xl border border-white/5 bg-white/[0.02] p-5">
                <div className="flex items-center gap-2 mb-3">
                  <Icon className={`h-4 w-4 ${stat.color}`} />
                  <span className="text-xs text-slate-500">{stat.label}</span>
                </div>
                <p className={`text-3xl font-black ${stat.color}`}>{stat.value}</p>
              </div>
            );
          })}
        </div>

        {/* Document List */}
        {loading ? (
          <div className="flex items-center justify-center py-24">
            <div className="flex flex-col items-center gap-4">
              <Loader2 className="h-8 w-8 animate-spin text-cyan-400" />
              <p className="text-slate-400 text-sm">Loading documents…</p>
            </div>
          </div>
        ) : error ? (
          <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-6 text-center">
            <AlertCircle className="h-8 w-8 text-red-400 mx-auto mb-3" />
            <p className="text-red-400 font-medium mb-2">Failed to load documents</p>
            <p className="text-slate-400 text-sm">{error}</p>
          </div>
        ) : docs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/5">
              <Shield className="h-8 w-8 text-slate-600" />
            </div>
            <h3 className="text-lg font-semibold text-slate-400">No documents yet</h3>
            <p className="text-sm text-slate-600 max-w-xs">
              Upload your first document to create a quantum-secure Q-Link.
            </p>
            <Link
              to="/upload"
              className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-violet-600 px-6 py-3 font-bold text-white mt-2"
            >
              <Plus className="h-4 w-4" />
              Upload First Document
            </Link>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {docs.map(doc => (
              <div key={doc.cid} className="relative">
                {revoking === doc.cid && (
                  <div className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-black/50 backdrop-blur-sm">
                    <div className="flex items-center gap-2 text-sm text-white">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Revoking…
                    </div>
                  </div>
                )}
                <DocumentCard doc={doc} onRevoke={handleRevoke} />
              </div>
            ))}
          </div>
        )}

        {/* Connect Wallet CTA if not connected */}
        {!address && !isDemo && !loading && (
          <div className="mt-8 rounded-2xl border border-white/5 bg-white/[0.02] p-8 text-center">
            <Wallet className="h-10 w-10 text-slate-600 mx-auto mb-4" />
            <h3 className="font-semibold text-white mb-2">Connect Your Wallet</h3>
            <p className="text-slate-400 text-sm mb-4">
              Connect MetaMask to see your on-chain documents and manage access.
            </p>
            <div className="flex items-center justify-center gap-2">
              <Unlock className="h-4 w-4 text-slate-500" />
              <span className="text-xs text-slate-500">Or explore in demo mode — no wallet required.</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
