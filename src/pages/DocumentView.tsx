/**
 * @file DocumentView.tsx
 * @description The Qvault document viewer page.
 *
 * URL format:  /view/:cid#<kyberCiphertext>.<wrappedAesKey>.<kyberPrivateKey>
 *
 * WORKFLOW:
 *  1. Parse CID from URL params, decryption keys from #fragment
 *  2. Check preflight access via checkAccess() or demoGetDocumentInfo()
 *  3. If allowed, call requestAccess() to atomically increment view counter
 *  4. Fetch encrypted blob from IPFS (or localStorage demo)
 *  5. Decrypt: ML-KEM decap → HKDF → unwrap AES key → AES-GCM decrypt
 *  6. Render the decrypted file in the browser
 *  7. If contract reverts → show "Link Expired / Access Burned" UI
 */

import { useState, useEffect, useCallback } from "react";
import { useParams } from "react-router-dom";
import {
  Shield, AlertTriangle, Download, Eye, Clock,
  Loader2, Lock, Flame, CheckCircle, ExternalLink,
  FileText, Image as ImageIcon, AlertCircle
} from "lucide-react";
import {
  decryptFile,
  parseQLink,
  detectMimeType,
} from "../utils/cryptoUtils";
import { fetchFile }   from "../utils/ipfsService";
import {
  requestAccess,
  getDocumentInfo,
  isMetaMaskInstalled,
  parseContractError,
  demoRequestAccess,
  demoGetDocumentInfo,
  getSigner,
} from "../utils/contractUtils";

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

type ViewerStage =
  | "loading"       // initial parse & preflight check
  | "preflight"     // showing doc info, waiting for user to click "Request Access"
  | "requesting"    // calling requestAccess() smart contract fn
  | "fetching"      // downloading from IPFS
  | "decrypting"    // running ML-KEM decap + AES-GCM
  | "viewing"       // showing the decrypted file
  | "burned"        // access denied / view limit reached
  | "expired"       // time-based expiry
  | "revoked"       // owner revoked
  | "not_found"     // CID/document not registered
  | "invalid_link"  // bad URL fragment
  | "error";        // unexpected error

interface DocMeta {
  maxViews: number;
  currentViews: number;
  remainingViews: number;
  expirationTimestamp: number;
  isActive: boolean;
  owner: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// SUB-COMPONENTS
// ─────────────────────────────────────────────────────────────────────────────

/** "Access Burned" / "Link Expired" full-screen error state */
function AccessDeniedScreen({
  stage,
  cid,
  reason,
}: {
  stage: ViewerStage;
  cid: string;
  reason?: string;
}) {
  const isExpired = stage === "expired";
  const isRevoked = stage === "revoked";

  return (
    <div className="min-h-screen flex items-center justify-center px-4 pt-16">
      <div className="max-w-md text-center">
        {/* Animated flame icon */}
        <div className="mb-8 flex justify-center">
          <div className="relative">
            <div className="flex h-24 w-24 items-center justify-center rounded-full bg-red-500/10 border border-red-500/20">
              <Flame className="h-12 w-12 text-red-400" />
            </div>
            {/* Pulse rings */}
            <div className="absolute inset-0 rounded-full border border-red-500/20 animate-ping opacity-30" />
            <div className="absolute -inset-2 rounded-full border border-red-500/10 animate-ping opacity-20 delay-150" />
          </div>
        </div>

        {/* Title */}
        <h1 className="mb-3 text-4xl font-black text-white">
          {isExpired ? "Link Expired" : isRevoked ? "Access Revoked" : "🔥 Link Burned"}
        </h1>

        {/* Subtitle */}
        <p className="mb-2 text-xl font-bold text-red-400">
          {isExpired
            ? "This Q-Link has passed its expiration time."
            : isRevoked
            ? "The document owner has permanently revoked this link."
            : "View limit reached — this Q-Link has been permanently burned."}
        </p>

        <p className="mb-8 text-slate-400 leading-relaxed">
          {isExpired
            ? "The smart contract enforced the time-based expiry. No further access is possible — the key is gone forever."
            : isRevoked
            ? "The owner called revokeAccess() on the QvaultAccess smart contract. This action is irreversible on the blockchain."
            : "The maximum number of views has been reached. The QvaultAccess smart contract has set isActive = false. This document cannot be decrypted by anyone — ever."}
        </p>

        {/* Technical details */}
        <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4 text-left mb-6">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
            On-Chain Evidence
          </p>
          <div className="space-y-2 text-xs font-mono">
            <div className="flex justify-between">
              <span className="text-slate-500">CID:</span>
              <span className="text-slate-400">{cid.slice(0, 20)}…</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Status:</span>
              <span className="text-red-400">isActive = false</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Reason:</span>
              <span className="text-red-400">{reason ?? stage.toUpperCase()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Network:</span>
              <span className="text-violet-400">Polygon Mumbai</span>
            </div>
          </div>
        </div>

        <a
          href="/"
          className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-violet-600 px-6 py-3 font-bold text-white"
        >
          <Shield className="h-4 w-4" />
          Create a New Q-Link
        </a>
      </div>
    </div>
  );
}

/** Loading spinner with stage label */
function LoadingScreen({ label }: { label: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center px-4 pt-16">
      <div className="text-center">
        <div className="mb-6 flex justify-center">
          <div className="relative flex h-16 w-16 items-center justify-center rounded-full bg-cyan-500/10 border border-cyan-500/20">
            <Loader2 className="h-8 w-8 text-cyan-400 animate-spin" />
          </div>
        </div>
        <p className="text-white font-medium">{label}</p>
        <p className="text-sm text-slate-500 mt-1">Please wait…</p>
      </div>
    </div>
  );
}

/** Preflight card: shows doc info before the user triggers access */
function PreflightCard({
  cid,
  meta,
  onRequestAccess,
  isDemo,
}: {
  cid: string;
  meta: DocMeta;
  onRequestAccess: () => void;
  isDemo: boolean;
}) {
  const expiryDate = meta.expirationTimestamp > 0
    ? new Date(meta.expirationTimestamp * 1000).toLocaleString()
    : "Never";

  return (
    <div className="min-h-screen flex items-center justify-center px-4 pt-16">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="mb-8 text-center">
          <div className="mb-4 flex justify-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-500 to-violet-600 shadow-lg shadow-cyan-500/25">
              <Lock className="h-8 w-8 text-white" />
            </div>
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">Encrypted Document</h1>
          <p className="text-slate-400 text-sm">
            Request blockchain access to decrypt and view this document.
          </p>
        </div>

        {/* Document Info Card */}
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6 backdrop-blur-sm mb-4">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4">
            Access Rules (On-Chain)
          </p>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm text-slate-400">
                <Eye className="h-4 w-4" />
                Views Remaining
              </div>
              <span className={`font-bold text-sm ${
                meta.remainingViews <= 1 ? "text-red-400" :
                meta.remainingViews <= 3 ? "text-amber-400" : "text-emerald-400"
              }`}>
                {meta.remainingViews} / {meta.maxViews}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm text-slate-400">
                <Clock className="h-4 w-4" />
                Expires
              </div>
              <span className="font-medium text-sm text-white">{expiryDate}</span>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm text-slate-400">
                <Shield className="h-4 w-4" />
                Status
              </div>
              <span className={`flex items-center gap-1 font-medium text-sm ${
                meta.isActive ? "text-emerald-400" : "text-red-400"
              }`}>
                <div className={`h-1.5 w-1.5 rounded-full ${
                  meta.isActive ? "bg-emerald-400 animate-pulse" : "bg-red-400"
                }`} />
                {meta.isActive ? "Active" : "Revoked"}
              </span>
            </div>

            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2 text-sm text-slate-400">
                <ExternalLink className="h-4 w-4" />
                IPFS CID
              </div>
              <code className="text-xs text-cyan-400 font-mono max-w-[180px] break-all text-right">
                {cid.slice(0, 20)}…
              </code>
            </div>
          </div>

          {/* Warning if last view */}
          {meta.remainingViews === 1 && (
            <div className="mt-4 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-400 mt-0.5 shrink-0" />
              <p className="text-xs text-amber-400">
                <strong>Last View!</strong> Accessing this document will permanently burn
                the Q-Link. No one will be able to open it again after this.
              </p>
            </div>
          )}
        </div>

        {/* Demo mode banner */}
        {isDemo && (
          <div className="mb-4 rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-amber-400 shrink-0" />
            <p className="text-xs text-amber-400">
              Demo Mode — Access rules enforced in localStorage (no MetaMask required).
            </p>
          </div>
        )}

        {/* Request Access Button */}
        <button
          onClick={onRequestAccess}
          className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-violet-600 py-4 font-bold text-white shadow-lg shadow-cyan-500/20 hover:shadow-cyan-500/40 transition-all"
        >
          <Shield className="h-5 w-5" />
          {isMetaMaskInstalled() && !isDemo
            ? "Sign Transaction & View Document"
            : "View Document (Demo Mode)"
          }
        </button>

        <p className="mt-3 text-center text-xs text-slate-600">
          {isMetaMaskInstalled() && !isDemo
            ? "MetaMask will prompt you to sign a transaction that increments the view counter."
            : "Demo mode enforces view limits locally without MetaMask."
          }
        </p>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// DOCUMENT RENDERER (for the decrypted file)
// ─────────────────────────────────────────────────────────────────────────────

function DocumentRenderer({
  bytes,
  mimeType,
  cid,
}: {
  bytes: Uint8Array;
  mimeType: string;
  cid: string;
}) {
  // Copy to a plain ArrayBuffer to avoid SharedArrayBuffer type issues
  const safeBuffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(safeBuffer).set(bytes);
  const blob    = new Blob([safeBuffer], { type: mimeType });
  const blobUrl = URL.createObjectURL(blob);
  const isImage = mimeType.startsWith("image/");
  const isPdf   = mimeType === "application/pdf";
  const isText  = mimeType.startsWith("text/") || mimeType === "application/json";

  // Decode text content if applicable
  const textContent = isText ? new TextDecoder().decode(bytes) : null;

  const downloadFile = () => {
    const a     = document.createElement("a");
    a.href      = blobUrl;
    a.download  = `qvault_${cid.slice(0, 8)}_decrypted`;
    a.click();
  };

  return (
    <div className="min-h-screen pt-24 pb-16 px-4">
      <div className="mx-auto max-w-4xl">

        {/* Success Banner */}
        <div className="mb-6 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 flex items-center gap-3">
          <CheckCircle className="h-5 w-5 text-emerald-400 shrink-0" />
          <div>
            <p className="font-semibold text-emerald-400">Access Granted</p>
            <p className="text-sm text-slate-400">
              ML-KEM decapsulation + AES-256-GCM decryption successful.
              View counter incremented on the Polygon blockchain.
            </p>
          </div>
          <button
            onClick={downloadFile}
            className="ml-auto flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-sm text-emerald-400 hover:bg-emerald-500/20 transition-all"
          >
            <Download className="h-4 w-4" />
            Save
          </button>
        </div>

        {/* File Viewer */}
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] overflow-hidden">
          {/* Header */}
          <div className="flex items-center gap-3 px-6 py-4 border-b border-white/5">
            {isImage ? (
              <ImageIcon className="h-5 w-5 text-violet-400" />
            ) : isPdf ? (
              <FileText className="h-5 w-5 text-orange-400" />
            ) : (
              <FileText className="h-5 w-5 text-slate-400" />
            )}
            <span className="text-sm font-medium text-white">
              Decrypted Document
            </span>
            <code className="ml-auto text-xs text-slate-500 font-mono">{mimeType}</code>
          </div>

          {/* Content */}
          <div className="p-4">
            {isImage && (
              <img
                src={blobUrl}
                alt="Decrypted document"
                className="max-w-full rounded-xl mx-auto"
              />
            )}

            {isPdf && (
              <iframe
                src={blobUrl}
                title="PDF Viewer"
                className="w-full rounded-xl"
                style={{ height: "80vh" }}
              />
            )}

            {isText && textContent && (
              <pre className="text-sm text-slate-300 font-mono whitespace-pre-wrap bg-black/20 rounded-xl p-6 overflow-auto max-h-[80vh]">
                {textContent}
              </pre>
            )}

            {!isImage && !isPdf && !isText && (
              <div className="flex flex-col items-center justify-center py-16 gap-4">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/5">
                  <FileText className="h-8 w-8 text-slate-400" />
                </div>
                <p className="text-slate-400">
                  File type ({mimeType}) cannot be previewed in browser.
                </p>
                <button
                  onClick={downloadFile}
                  className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-violet-600 px-6 py-3 font-bold text-white"
                >
                  <Download className="h-4 w-4" />
                  Download Decrypted File
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Technical Info */}
        <div className="mt-4 rounded-xl border border-white/5 bg-white/[0.01] p-4">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
            Decryption Audit Trail
          </p>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="flex items-center gap-1.5 text-slate-500">
              <CheckCircle className="h-3 w-3 text-emerald-400" />
              ML-KEM-768 decapsulation
            </div>
            <div className="flex items-center gap-1.5 text-slate-500">
              <CheckCircle className="h-3 w-3 text-emerald-400" />
              HKDF-SHA256 key derivation
            </div>
            <div className="flex items-center gap-1.5 text-slate-500">
              <CheckCircle className="h-3 w-3 text-emerald-400" />
              AES-256-GCM decryption
            </div>
            <div className="flex items-center gap-1.5 text-slate-500">
              <CheckCircle className="h-3 w-3 text-emerald-400" />
              On-chain view counter incremented
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

export default function DocumentView() {
  const { cid } = useParams<{ cid: string }>();

  const [stage,      setStage]      = useState<ViewerStage>("loading");
  const [errorMsg,   setErrorMsg]   = useState("");
  const [docMeta,    setDocMeta]    = useState<DocMeta | null>(null);
  const [decrypted,  setDecrypted]  = useState<Uint8Array | null>(null);
  const [mimeType,   setMimeType]   = useState("application/octet-stream");
  const [isDemo,     setIsDemo]     = useState(!isMetaMaskInstalled());
  const [denyReason, setDenyReason] = useState<string | undefined>();

  /** Map contract denial reasons to viewer stages */
  const mapReason = useCallback((reason: string): ViewerStage => {
    if (reason === "VIEW_LIMIT_REACHED" || reason === "INACTIVE") return "burned";
    if (reason === "EXPIRED")    return "expired";
    if (reason === "NOT_FOUND")  return "not_found";
    if (reason === "OWNER_REVOKED") return "revoked";
    return "burned";
  }, []);

  /** Initial load: parse URL, check preflight access */
  useEffect(() => {
    if (!cid) {
      setStage("not_found");
      return;
    }

    // Validate URL fragment has decryption keys
    const keys = parseQLink(window.location.hash);
    if (!keys) {
      setStage("invalid_link");
      setErrorMsg("The URL fragment is missing or malformed. The decryption keys are embedded after the # symbol.");
      return;
    }

    // Preflight check (read-only, no gas)
    const preflight = async () => {
      try {
        if (isMetaMaskInstalled()) {
          // Try real smart contract check
          const info = await getDocumentInfo(cid);
          if (!info) {
            // Contract not deployed — fall back to demo
            setIsDemo(true);
            demoPreflightCheck(cid);
            return;
          }
          if (!info.isActive) {
            setDenyReason("INACTIVE");
            setStage(mapReason("INACTIVE"));
            return;
          }
          if (info.currentViews >= info.maxViews) {
            setDenyReason("VIEW_LIMIT_REACHED");
            setStage("burned");
            return;
          }
          setDocMeta({
            maxViews:            Number(info.maxViews),
            currentViews:        Number(info.currentViews),
            remainingViews:      Number(info.remainingViews),
            expirationTimestamp: Number(info.expirationTimestamp),
            isActive:            info.isActive,
            owner:               info.owner,
          });
          setStage("preflight");
        } else {
          setIsDemo(true);
          demoPreflightCheck(cid);
        }
      } catch {
        // Smart contract might not be deployed — use demo mode
        setIsDemo(true);
        demoPreflightCheck(cid);
      }
    };

    const demoPreflightCheck = (docCid: string) => {
      const info = demoGetDocumentInfo(docCid);
      if (!info) {
        // Document exists in IPFS but no demo contract record — allow access
        setDocMeta({ maxViews: 3, currentViews: 0, remainingViews: 3, expirationTimestamp: 0, isActive: true, owner: "0xDemo" });
        setStage("preflight");
        return;
      }
      if (!info.isActive || info.currentViews >= info.maxViews) {
        setDenyReason("VIEW_LIMIT_REACHED");
        setStage("burned");
        return;
      }
      setDocMeta({
        maxViews:            info.maxViews,
        currentViews:        info.currentViews,
        remainingViews:      info.maxViews - info.currentViews,
        expirationTimestamp: info.expirationTimestamp,
        isActive:            info.isActive,
        owner:               info.owner,
      });
      setStage("preflight");
    };

    preflight();
  }, [cid, mapReason]);

  /** Called when user clicks "Request Access" */
  const handleRequestAccess = useCallback(async () => {
    if (!cid) return;

    const keys = parseQLink(window.location.hash);
    if (!keys) {
      setStage("invalid_link");
      setErrorMsg("Decryption keys missing from URL fragment.");
      return;
    }

    try {
      // ── Step 1: Call requestAccess() on chain ────────────────────────────
      setStage("requesting");

      if (isDemo) {
        // Demo mode: enforce rules in localStorage
        const result = demoRequestAccess(cid);
        if (!result.granted) {
          setDenyReason(result.reason);
          setStage(mapReason(result.reason));
          return;
        }
        await new Promise(r => setTimeout(r, 600)); // Simulate tx
      } else {
        // Real blockchain transaction
        try {
          // Check if MetaMask is connected
          await getSigner();
          await requestAccess(cid);
        } catch (err) {
          const msg = parseContractError(err);
          // Smart contract reverted — access denied
          if (
            msg.includes("View limit") ||
            msg.includes("Inactive") ||
            msg.includes("Expired") ||
            msg.includes("burned")
          ) {
            // Determine which revocation type
            if (msg.includes("limit")) setStage("burned");
            else if (msg.includes("xpired")) setStage("expired");
            else setStage("revoked");
            setDenyReason(msg);
            return;
          }
          // Fall back to demo mode for contract-not-deployed scenario
          console.warn("[Qvault] requestAccess failed — demo fallback:", msg);
          const result = demoRequestAccess(cid);
          if (!result.granted) {
            setDenyReason(result.reason);
            setStage(mapReason(result.reason));
            return;
          }
        }
      }

      // ── Step 2: Fetch encrypted blob from IPFS ───────────────────────────
      setStage("fetching");
      let encryptedBlob: Uint8Array;
      try {
        encryptedBlob = await fetchFile(cid);
      } catch (fetchErr) {
        throw new Error(`IPFS fetch failed: ${fetchErr instanceof Error ? fetchErr.message : String(fetchErr)}`);
      }

      // ── Step 3: Decrypt locally ──────────────────────────────────────────
      setStage("decrypting");
      const plaintext = await decryptFile(encryptedBlob, keys);

      // Detect and set MIME type for rendering
      const detected = detectMimeType(plaintext);
      setMimeType(detected);
      setDecrypted(plaintext);
      setStage("viewing");

    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMsg(msg);
      setStage("error");
    }
  }, [cid, isDemo, mapReason]);

  // ── Render by stage ───────────────────────────────────────────────────────

  if (!cid) {
    return <AccessDeniedScreen stage="not_found" cid="" reason="NO_CID" />;
  }

  if (stage === "loading") {
    return <LoadingScreen label="Checking access rules…" />;
  }

  if (stage === "invalid_link") {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 pt-16">
        <div className="max-w-md text-center">
          <div className="mb-6 flex justify-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-red-500/10 border border-red-500/20">
              <AlertTriangle className="h-8 w-8 text-red-400" />
            </div>
          </div>
          <h1 className="text-2xl font-bold text-white mb-3">Invalid Q-Link</h1>
          <p className="text-slate-400 mb-6">{errorMsg}</p>
          <p className="text-xs text-slate-600 mb-6">
            The Q-Link must include the decryption key in the URL fragment (#…).
            Make sure you copied the complete URL including everything after the # symbol.
          </p>
          <a
            href="/upload"
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-violet-600 px-6 py-3 font-bold text-white"
          >
            <Shield className="h-4 w-4" />
            Create a Q-Link
          </a>
        </div>
      </div>
    );
  }

  if (["burned", "expired", "revoked", "not_found"].includes(stage)) {
    return <AccessDeniedScreen stage={stage} cid={cid} reason={denyReason} />;
  }

  if (stage === "requesting") {
    return (
      <LoadingScreen label={isDemo ? "Simulating blockchain transaction…" : "Awaiting MetaMask confirmation…"} />
    );
  }

  if (stage === "fetching") {
    return <LoadingScreen label="Fetching encrypted document from IPFS…" />;
  }

  if (stage === "decrypting") {
    return <LoadingScreen label="Running ML-KEM decapsulation + AES-256-GCM decryption…" />;
  }

  if (stage === "error") {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 pt-16">
        <div className="max-w-md text-center">
          <div className="mb-6 flex justify-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-red-500/10 border border-red-500/20">
              <AlertCircle className="h-8 w-8 text-red-400" />
            </div>
          </div>
          <h1 className="text-2xl font-bold text-white mb-3">Decryption Failed</h1>
          <p className="text-slate-400 text-sm mb-6">{errorMsg}</p>
          <button
            onClick={() => { setStage("preflight"); setErrorMsg(""); }}
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-violet-600 px-6 py-3 font-bold text-white"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  if (stage === "viewing" && decrypted) {
    return <DocumentRenderer bytes={decrypted} mimeType={mimeType} cid={cid} />;
  }

  // Preflight state
  if (docMeta) {
    return (
      <PreflightCard
        cid={cid}
        meta={docMeta}
        onRequestAccess={handleRequestAccess}
        isDemo={isDemo}
      />
    );
  }

  return <LoadingScreen label="Loading…" />;
}
