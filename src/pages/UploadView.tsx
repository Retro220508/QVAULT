/**
 * @file UploadView.tsx
 * @description The Qvault upload dashboard.
 *
 * WORKFLOW:
 *  1. User drags & drops or selects a file
 *  2. Configures maxViews and expirationHours
 *  3. Clicks "Generate Q-Link":
 *     a. readFileAsBytes() — read file locally
 *     b. encryptFile()     — ML-KEM-768 + AES-256-GCM local encryption
 *     c. uploadFile()      — push encrypted blob to IPFS (or demo localStorage)
 *     d. createDocumentAccess() — MetaMask tx on Polygon smart contract
 *     e. buildQLink()      — construct the shareable URL with #fragment key
 *  4. Displays the Q-Link for copying/sharing
 */

import { useState, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import {
  Upload, Shield, Link2, Copy, Check, AlertCircle,
  FileText, Image, File, Eye, Clock, Zap, ChevronDown,
  Loader2, ExternalLink, Lock, Cpu, Globe
} from "lucide-react";
import {
  encryptFile,
  readFileAsBytes,
  buildQLink,
  computeKeyHash,
} from "../utils/cryptoUtils";
import { uploadFile }                        from "../utils/ipfsService";
import {
  createDocumentAccess,
  demoCreateDocumentAccess,
  isMetaMaskInstalled,
  parseContractError,
} from "../utils/contractUtils";

// ─────────────────────────────────────────────────────────────────────────────
// TYPES & CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

type Stage =
  | "idle"
  | "reading"
  | "encrypting"
  | "uploading"
  | "contracting"
  | "done"
  | "error";

interface StageInfo {
  label: string;
  icon: React.ElementType;
  color: string;
}

const STAGES: Record<Stage, StageInfo> = {
  idle:        { label: "Ready",                      icon: Shield,   color: "text-slate-400" },
  reading:     { label: "Reading file…",              icon: FileText, color: "text-blue-400"  },
  encrypting:  { label: "Encrypting with ML-KEM…",   icon: Cpu,      color: "text-cyan-400"  },
  uploading:   { label: "Pinning to IPFS…",           icon: Globe,    color: "text-violet-400"},
  contracting: { label: "Awaiting MetaMask…",         icon: Zap,      color: "text-fuchsia-400"},
  done:        { label: "Q-Link Generated!",          icon: Lock,     color: "text-emerald-400"},
  error:       { label: "Error",                      icon: AlertCircle, color: "text-red-400" },
};

const MAX_FILE_SIZE_MB = 50;
const MAX_VIEWS_OPTIONS = [1, 3, 5, 10, 25, 50];
const EXPIRY_OPTIONS    = [
  { label: "Never",    hours: 0   },
  { label: "1 Hour",   hours: 1   },
  { label: "6 Hours",  hours: 6   },
  { label: "24 Hours", hours: 24  },
  { label: "7 Days",   hours: 168 },
  { label: "30 Days",  hours: 720 },
];

// ─────────────────────────────────────────────────────────────────────────────
// SUB-COMPONENTS
// ─────────────────────────────────────────────────────────────────────────────

function FileIcon({ mime }: { mime: string }) {
  if (mime.startsWith("image/")) return <Image className="h-8 w-8 text-violet-400" />;
  if (mime === "application/pdf") return <FileText className="h-8 w-8 text-orange-400" />;
  return <File className="h-8 w-8 text-slate-400" />;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024)        return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function StageIndicator({ stage }: { stage: Stage }) {
  const info = STAGES[stage];
  const Icon = info.icon;
  const isSpinning = ["reading", "encrypting", "uploading", "contracting"].includes(stage);

  return (
    <div className={`flex items-center gap-2 text-sm font-medium ${info.color}`}>
      {isSpinning
        ? <Loader2 className="h-4 w-4 animate-spin" />
        : <Icon className="h-4 w-4" />
      }
      {info.label}
    </div>
  );
}

function CopyButton({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={copy}
      className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-white/10 hover:text-white transition-all"
    >
      {copied
        ? <><Check className="h-3.5 w-3.5 text-emerald-400" /> Copied!</>
        : <><Copy className="h-3.5 w-3.5" /> {label ?? "Copy"}</>
      }
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────name="UploadView"──────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────

export default function UploadView() {
  const [file,            setFile]            = useState<File | null>(null);
  const [maxViews,        setMaxViews]        = useState(3);
  const [expiryHours,     setExpiryHours]     = useState(0);
  const [stage,           setStage]           = useState<Stage>("idle");
  const [errorMsg,        setErrorMsg]        = useState("");
  const [qLink,           setQLink]           = useState("");
  const [cid,             setCid]             = useState("");
  const [txHash,          setTxHash]          = useState("");
  const [isDemoMode,      setIsDemoMode]      = useState(!isMetaMaskInstalled());
  const [encryptionStats, setEncryptionStats] = useState<{
    originalSize: number;
    encryptedSize: number;
    duration: number;
  } | null>(null);

  const progressSteps = ["reading", "encrypting", "uploading", "contracting", "done"];
  const currentStep   = progressSteps.indexOf(stage);

  // ── Dropzone ──────────────────────────────────────────────────────────────
  const onDrop = useCallback((accepted: File[]) => {
    if (accepted.length === 0) return;
    const f = accepted[0];
    if (f.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
      setErrorMsg(`File too large. Maximum size is ${MAX_FILE_SIZE_MB}MB.`);
      setStage("error");
      return;
    }
    setFile(f);
    setStage("idle");
    setErrorMsg("");
    setQLink("");
    setCid("");
    setEncryptionStats(null);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    multiple: false,
    accept: {
      "image/*":       [],
      "application/pdf": [],
      "text/*":        [],
      "application/json": [],
      "application/zip": [],
    },
    maxSize: MAX_FILE_SIZE_MB * 1024 * 1024,
  });

  // ── Main "Generate Q-Link" Handler ────────────────────────────────────────
  const generateQLink = async () => {
    if (!file) return;

    setErrorMsg("");
    setQLink("");
    setCid("");

    try {
      // ── Step 1: Read file bytes ─────────────────────────────────────────
      setStage("reading");
      const fileBytes = await readFileAsBytes(file);
      console.log(`[Qvault] File read: ${fileBytes.length} bytes`);

      // ── Step 2: Local encryption ─────────────────────────────────────────
      setStage("encrypting");
      const encStart = performance.now();
      const result   = await encryptFile(fileBytes);
      const encDuration = performance.now() - encStart;

      setEncryptionStats({
        originalSize:  fileBytes.length,
        encryptedSize: result.encryptedBlob.length,
        duration:      Math.round(encDuration),
      });

      console.log(`[Qvault] Encrypted in ${encDuration.toFixed(0)}ms`);

      // ── Step 3: Upload encrypted blob to IPFS ───────────────────────────
      setStage("uploading");
      const uploadResult = await uploadFile(result.encryptedBlob, file.name);
      setCid(uploadResult.cid);
      setIsDemoMode(uploadResult.isDemo);

      console.log(`[Qvault] IPFS CID: ${uploadResult.cid}`);

      // ── Step 4: Smart contract interaction ──────────────────────────────
      setStage("contracting");
      const keyHash = await computeKeyHash(result.kyberCiphertext);

      let txh = "";
      if (isMetaMaskInstalled() && !uploadResult.isDemo) {
        // Real blockchain transaction
        try {
          txh = await createDocumentAccess(
            uploadResult.cid,
            maxViews,
            expiryHours,
            keyHash
          );
          setTxHash(txh);
        } catch (contractErr) {
          const errMsg = parseContractError(contractErr);
          // If contract address not set, fall back to demo
          if (errMsg.includes("NOT_FOUND") || errMsg.includes("0x0000")) {
            console.warn("[Qvault] Contract not deployed — using demo mode");
            demoCreateDocumentAccess(uploadResult.cid, maxViews, expiryHours);
          } else {
            throw contractErr;
          }
        }
      } else {
        // Demo mode: store rules in localStorage
        demoCreateDocumentAccess(uploadResult.cid, maxViews, expiryHours);
        await new Promise(r => setTimeout(r, 800)); // Simulate tx wait
      }

      // ── Step 5: Build Q-Link ─────────────────────────────────────────────
      const link = buildQLink(uploadResult.cid, result);
      setQLink(link);
      setStage("done");

      console.log(`[Qvault] Q-Link generated: ${link.slice(0, 80)}…`);

    } catch (err: unknown) {
      const msg = parseContractError(err);
      console.error("[Qvault] Upload error:", err);
      setErrorMsg(msg);
      setStage("error");
    }
  };

  const reset = () => {
    setFile(null);
    setStage("idle");
    setErrorMsg("");
    setQLink("");
    setCid("");
    setTxHash("");
    setEncryptionStats(null);
  };

  const isProcessing = ["reading", "encrypting", "uploading", "contracting"].includes(stage);

  return (
    <div className="min-h-screen pt-24 pb-16 px-4">
      <div className="mx-auto max-w-2xl">

        {/* ── Header ────────────────────────────────────────────────────── */}
        <div className="mb-8 text-center">
          <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500 to-violet-600 shadow-lg shadow-cyan-500/25">
            <Shield className="h-6 w-6 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">Upload & Encrypt</h1>
          <p className="text-slate-400 text-sm">
            Your file is encrypted locally before leaving your browser. Zero-knowledge.
          </p>
        </div>

        {/* ── Demo Mode Banner ──────────────────────────────────────────── */}
        {isDemoMode && (
          <div className="mb-4 rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 flex items-start gap-3">
            <AlertCircle className="h-4 w-4 text-amber-400 mt-0.5 shrink-0" />
            <div className="text-sm">
              <p className="font-medium text-amber-400">Demo Mode Active</p>
              <p className="text-slate-400 mt-0.5">
                MetaMask not detected or Pinata not configured. Files will be stored
                in localStorage and contract rules will be simulated. Perfect for judging!
              </p>
            </div>
          </div>
        )}

        {/* ── Main Card ─────────────────────────────────────────────────── */}
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] backdrop-blur-sm overflow-hidden">

          {/* ── Dropzone ────────────────────────────────────────────────── */}
          <div className="p-6 border-b border-white/5">
            {!file ? (
              <div
                {...getRootProps()}
                className={`relative rounded-xl border-2 border-dashed cursor-pointer transition-all duration-200 p-10 text-center ${
                  isDragActive
                    ? "border-cyan-400 bg-cyan-400/5"
                    : "border-white/10 hover:border-white/20 hover:bg-white/[0.02]"
                }`}
              >
                <input {...getInputProps()} />

                {/* Drag active overlay */}
                {isDragActive && (
                  <div className="absolute inset-0 rounded-xl bg-cyan-400/5 flex items-center justify-center">
                    <div className="text-cyan-400 font-semibold text-lg">Drop it here!</div>
                  </div>
                )}

                <div className="flex flex-col items-center gap-3">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/5">
                    <Upload className="h-7 w-7 text-slate-400" />
                  </div>
                  <div>
                    <p className="font-medium text-white mb-1">
                      Drag & drop your file here
                    </p>
                    <p className="text-sm text-slate-500">
                      or <span className="text-cyan-400 hover:underline">click to browse</span>
                    </p>
                    <p className="text-xs text-slate-600 mt-2">
                      PDF, Images, Text, JSON — Max {MAX_FILE_SIZE_MB}MB
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              /* Selected file preview */
              <div className="flex items-center gap-4 rounded-xl border border-white/10 bg-white/[0.03] p-4">
                <FileIcon mime={file.type} />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-white truncate">{file.name}</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {formatBytes(file.size)} · {file.type || "unknown type"}
                  </p>
                </div>
                {stage === "idle" && (
                  <button
                    onClick={reset}
                    className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
                  >
                    Change
                  </button>
                )}
              </div>
            )}
          </div>

          {/* ── Access Control Settings ────────────────────────────────── */}
          <div className="p-6 border-b border-white/5 space-y-4">
            <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-widest">
              Access Rules
            </h3>

            {/* Max Views */}
            <div>
              <label className="mb-2 flex items-center gap-2 text-sm text-slate-400">
                <Eye className="h-4 w-4" />
                Maximum Views
                <span className="ml-auto text-cyan-400 font-semibold">{maxViews}</span>
              </label>
              <div className="flex gap-2 flex-wrap">
                {MAX_VIEWS_OPTIONS.map(v => (
                  <button
                    key={v}
                    onClick={() => setMaxViews(v)}
                    disabled={isProcessing}
                    className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-all ${
                      maxViews === v
                        ? "bg-cyan-500/20 border border-cyan-500/40 text-cyan-400"
                        : "border border-white/5 bg-white/[0.03] text-slate-400 hover:border-white/10 hover:text-slate-300"
                    }`}
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>

            {/* Expiration */}
            <div>
              <label className="mb-2 flex items-center gap-2 text-sm text-slate-400">
                <Clock className="h-4 w-4" />
                Expiration Time
                <span className="ml-auto text-violet-400 font-semibold">
                  {EXPIRY_OPTIONS.find(o => o.hours === expiryHours)?.label ?? "Custom"}
                </span>
              </label>
              <div className="relative">
                <select
                  value={expiryHours}
                  onChange={e => setExpiryHours(Number(e.target.value))}
                  disabled={isProcessing}
                  className="w-full appearance-none rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-violet-500/50 disabled:opacity-50"
                >
                  {EXPIRY_OPTIONS.map(o => (
                    <option key={o.hours} value={o.hours} className="bg-[#0f1220]">
                      {o.label}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500 pointer-events-none" />
              </div>
            </div>
          </div>

          {/* ── Encryption Pipeline Progress ───────────────────────────── */}
          {stage !== "idle" && (
            <div className="px-6 py-4 border-b border-white/5">
              <div className="flex items-center justify-between mb-3">
                <StageIndicator stage={stage} />
                {stage !== "error" && (
                  <span className="text-xs text-slate-600">
                    {Math.max(0, currentStep)}/{progressSteps.length - 1}
                  </span>
                )}
              </div>

              {/* Progress bar */}
              {stage !== "error" && (
                <div className="h-1 rounded-full bg-white/5 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-violet-500 transition-all duration-500"
                    style={{ width: `${((Math.max(0, currentStep)) / (progressSteps.length - 1)) * 100}%` }}
                  />
                </div>
              )}

              {/* Pipeline steps */}
              <div className="mt-3 grid grid-cols-4 gap-1">
                {[
                  { key: "reading",     label: "Read"     },
                  { key: "encrypting",  label: "Encrypt"  },
                  { key: "uploading",   label: "IPFS"     },
                  { key: "contracting", label: "Chain"    },
                ].map((step, idx) => (
                  <div
                    key={step.key}
                    className={`flex flex-col items-center gap-1 rounded-lg py-1.5 text-center transition-all ${
                      progressSteps.indexOf(stage) > idx + 1
                        ? "opacity-100"
                        : progressSteps.indexOf(stage) === idx + 1
                        ? "opacity-100"
                        : "opacity-30"
                    }`}
                  >
                    <div className={`h-1.5 w-1.5 rounded-full ${
                      progressSteps.indexOf(stage) > idx + 1
                        ? "bg-emerald-400"
                        : progressSteps.indexOf(stage) === idx + 1
                        ? "bg-cyan-400 animate-pulse"
                        : "bg-slate-600"
                    }`} />
                    <span className="text-[10px] text-slate-500">{step.label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Error Message ─────────────────────────────────────────── */}
          {stage === "error" && (
            <div className="mx-6 my-4 rounded-xl border border-red-500/20 bg-red-500/5 p-4 flex items-start gap-3">
              <AlertCircle className="h-4 w-4 text-red-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-red-400">Encryption Failed</p>
                <p className="text-sm text-slate-400 mt-1">{errorMsg}</p>
              </div>
            </div>
          )}

          {/* ── Encryption Stats ──────────────────────────────────────── */}
          {encryptionStats && stage === "done" && (
            <div className="mx-6 mt-4 rounded-xl border border-cyan-500/10 bg-cyan-500/5 p-4">
              <p className="text-xs font-semibold text-cyan-400 uppercase tracking-wider mb-3">
                Encryption Stats
              </p>
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <p className="text-lg font-bold text-white">{formatBytes(encryptionStats.originalSize)}</p>
                  <p className="text-xs text-slate-500">Original</p>
                </div>
                <div>
                  <p className="text-lg font-bold text-cyan-400">{formatBytes(encryptionStats.encryptedSize)}</p>
                  <p className="text-xs text-slate-500">Encrypted</p>
                </div>
                <div>
                  <p className="text-lg font-bold text-violet-400">{encryptionStats.duration}ms</p>
                  <p className="text-xs text-slate-500">Duration</p>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-500">
                <div className="flex items-center gap-1">
                  <div className="h-1 w-1 rounded-full bg-emerald-400" />
                  ML-KEM-768 encapsulation ✓
                </div>
                <div className="flex items-center gap-1">
                  <div className="h-1 w-1 rounded-full bg-emerald-400" />
                  AES-256-GCM encryption ✓
                </div>
                <div className="flex items-center gap-1">
                  <div className="h-1 w-1 rounded-full bg-emerald-400" />
                  HKDF-SHA256 key derivation ✓
                </div>
                <div className="flex items-center gap-1">
                  <div className="h-1 w-1 rounded-full bg-emerald-400" />
                  Zero-knowledge (client-only) ✓
                </div>
              </div>
            </div>
          )}

          {/* ── Q-Link Result ─────────────────────────────────────────── */}
          {stage === "done" && qLink && (
            <div className="p-6 border-t border-white/5">
              <div className="flex items-center gap-2 mb-3">
                <Link2 className="h-4 w-4 text-emerald-400" />
                <span className="text-sm font-semibold text-emerald-400">Q-Link Generated!</span>
                {isDemoMode && (
                  <span className="ml-auto text-xs text-amber-400 border border-amber-500/20 bg-amber-500/5 rounded px-2 py-0.5">
                    Demo Mode
                  </span>
                )}
              </div>

              {/* IPFS CID */}
              <div className="mb-3 rounded-lg border border-white/5 bg-white/[0.02] p-3">
                <p className="text-xs text-slate-500 mb-1">IPFS CID</p>
                <div className="flex items-center justify-between gap-2">
                  <code className="text-xs text-cyan-400 font-mono break-all">{cid}</code>
                  <CopyButton text={cid} label="CID" />
                </div>
              </div>

              {/* Transaction Hash */}
              {txHash && (
                <div className="mb-3 rounded-lg border border-white/5 bg-white/[0.02] p-3">
                  <p className="text-xs text-slate-500 mb-1">Transaction Hash</p>
                  <div className="flex items-center justify-between gap-2">
                    <code className="text-xs text-violet-400 font-mono break-all">
                      {txHash.slice(0, 20)}…{txHash.slice(-8)}
                    </code>
                    <a
                      href={`https://mumbai.polygonscan.com/tx/${txHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-xs text-slate-400 hover:text-white"
                    >
                      <ExternalLink className="h-3 w-3" />
                      PolygonScan
                    </a>
                  </div>
                </div>
              )}

              {/* Full Q-Link */}
              <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-emerald-400 uppercase tracking-wider">
                    🔗 Shareable Q-Link
                  </p>
                  <div className="flex gap-2">
                    <CopyButton text={qLink} label="Copy Q-Link" />
                  </div>
                </div>
                <div className="rounded-lg bg-black/30 p-3 overflow-x-auto">
                  <code className="text-xs text-emerald-300 font-mono break-all leading-relaxed">
                    {qLink}
                  </code>
                </div>
                <div className="mt-3 flex items-start gap-2">
                  <AlertCircle className="h-3.5 w-3.5 text-amber-400 mt-0.5 shrink-0" />
                  <p className="text-xs text-slate-400">
                    <strong className="text-amber-400">Security Note:</strong> The #fragment
                    contains the decryption key and is NEVER sent to any server. Share this
                    entire URL (including the #) with recipients.
                    Limit: <strong className="text-white">{maxViews} view{maxViews !== 1 ? "s" : ""}</strong>.
                  </p>
                </div>
              </div>

              <button
                onClick={reset}
                className="mt-4 w-full rounded-xl border border-white/10 bg-white/5 py-2.5 text-sm text-slate-400 hover:text-white hover:bg-white/10 transition-all"
              >
                Upload Another File
              </button>
            </div>
          )}

          {/* ── Generate Button ───────────────────────────────────────── */}
          {stage !== "done" && (
            <div className="p-6">
              <button
                onClick={generateQLink}
                disabled={!file || isProcessing}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-violet-600 py-3.5 font-bold text-white shadow-lg shadow-cyan-500/20 hover:shadow-cyan-500/40 transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none"
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" />
                    {STAGES[stage].label}
                  </>
                ) : (
                  <>
                    <Shield className="h-5 w-5" />
                    Generate Q-Link
                  </>
                )}
              </button>

              {!file && (
                <p className="mt-2 text-center text-xs text-slate-600">
                  Select a file above to get started
                </p>
              )}
            </div>
          )}
        </div>

        {/* ── Security Note ─────────────────────────────────────────────── */}
        <div className="mt-4 rounded-xl border border-white/5 bg-white/[0.01] p-4">
          <div className="flex items-start gap-3">
            <Lock className="h-4 w-4 text-cyan-400 mt-0.5 shrink-0" />
            <div className="text-xs text-slate-500 space-y-1">
              <p><strong className="text-slate-400">Zero-Knowledge Design:</strong> Qvault performs all encryption in your browser using the Web Crypto API. No plaintext file data is ever transmitted to any server.</p>
              <p><strong className="text-slate-400">Post-Quantum Security:</strong> ML-KEM-768 (CRYSTALS-Kyber) is the NIST FIPS 203 standard for post-quantum key encapsulation, providing ≈128-bit post-quantum security.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
