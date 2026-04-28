/**
 * @file LandingPage.tsx
 * @description Qvault hero landing page with feature showcase.
 */

import { Link } from "react-router-dom";
import {
  Shield, Lock, Eye, Zap, Globe, ChevronRight,
  FileKey, Cpu, Network, CheckCircle
} from "lucide-react";

// ── Animated particle / grid background component ────────────────────────────
function HeroGrid() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {/* Radial gradient overlay */}
      <div className="absolute inset-0 bg-gradient-radial from-cyan-950/30 via-transparent to-transparent" />

      {/* Grid lines */}
      <div
        className="absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage: `
            linear-gradient(rgba(34,211,238,1) 1px, transparent 1px),
            linear-gradient(90deg, rgba(34,211,238,1) 1px, transparent 1px)
          `,
          backgroundSize: "60px 60px",
        }}
      />

      {/* Floating orbs */}
      <div className="absolute top-1/4 left-1/4 h-64 w-64 rounded-full bg-cyan-500/5 blur-3xl animate-pulse" />
      <div className="absolute top-1/3 right-1/3 h-96 w-96 rounded-full bg-violet-500/5 blur-3xl animate-pulse delay-1000" />
      <div className="absolute bottom-1/4 right-1/4 h-48 w-48 rounded-full bg-fuchsia-500/5 blur-3xl animate-pulse delay-2000" />
    </div>
  );
}

// ── Feature card component ────────────────────────────────────────────────────
function FeatureCard({
  icon: Icon,
  title,
  description,
  accent,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
  accent: string;
}) {
  return (
    <div className="group relative rounded-2xl border border-white/5 bg-white/2 p-6 backdrop-blur-sm hover:border-white/10 transition-all duration-300">
      {/* Hover glow */}
      <div className={`absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 ${accent}`} />

      <div className="relative">
        <div className={`mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl ${accent.replace("bg-", "bg-").replace("/5", "/15")}`}>
          <Icon className="h-5 w-5 text-cyan-400" />
        </div>
        <h3 className="mb-2 font-semibold text-white">{title}</h3>
        <p className="text-sm text-slate-400 leading-relaxed">{description}</p>
      </div>
    </div>
  );
}

// ── Step component ────────────────────────────────────────────────────────────
function Step({
  num,
  title,
  description,
}: {
  num: string;
  title: string;
  description: string;
}) {
  return (
    <div className="flex gap-4">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-500 to-violet-600 text-xs font-bold text-white shadow-lg shadow-cyan-500/20">
        {num}
      </div>
      <div>
        <h4 className="font-semibold text-white mb-0.5">{title}</h4>
        <p className="text-sm text-slate-400">{description}</p>
      </div>
    </div>
  );
}

// ── Tech Badge ────────────────────────────────────────────────────────────────
function TechBadge({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-cyan-500/20 bg-cyan-500/5 px-3 py-1 text-xs font-medium text-cyan-400">
      <CheckCircle className="h-3 w-3" />
      {label}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

export default function LandingPage() {
  return (
    <div className="relative">
      {/* ── HERO SECTION ─────────────────────────────────────────────────── */}
      <section className="relative min-h-screen flex items-center justify-center px-4 pt-16">
        <HeroGrid />

        <div className="relative z-10 mx-auto max-w-5xl text-center">
          {/* Badge */}
          <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-cyan-500/20 bg-cyan-500/5 px-4 py-1.5 text-sm text-cyan-400">
            <Zap className="h-3.5 w-3.5" />
            BITWISE Hackathon — Team TechNova
            <ChevronRight className="h-3.5 w-3.5 opacity-60" />
          </div>

          {/* Headline */}
          <h1 className="mb-6 text-5xl font-black tracking-tight md:text-7xl lg:text-8xl">
            <span className="block text-white">Documents.</span>
            <span className="block bg-gradient-to-r from-cyan-400 via-violet-400 to-fuchsia-400 bg-clip-text text-transparent">
              Quantum-Proof.
            </span>
            <span className="block text-white">Yours.</span>
          </h1>

          {/* Subtitle */}
          <p className="mb-10 mx-auto max-w-2xl text-lg text-slate-400 leading-relaxed">
            Qvault encrypts your documents with{" "}
            <span className="text-cyan-400 font-medium">CRYSTALS-Kyber ML-KEM</span>{" "}
            post-quantum cryptography, stores them on{" "}
            <span className="text-violet-400 font-medium">IPFS</span>, and enforces
            view limits via a{" "}
            <span className="text-fuchsia-400 font-medium">Polygon smart contract</span>.
            Zero-knowledge. Unstoppable.
          </p>

          {/* Tech stack badges */}
          <div className="mb-10 flex flex-wrap justify-center gap-2">
            <TechBadge label="ML-KEM-768 (NIST FIPS 203)" />
            <TechBadge label="AES-256-GCM" />
            <TechBadge label="IPFS + Pinata" />
            <TechBadge label="Polygon Testnet" />
            <TechBadge label="Zero-Knowledge" />
          </div>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              to="/upload"
              className="group flex items-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-violet-600 px-8 py-3.5 font-bold text-white shadow-2xl shadow-cyan-500/25 hover:shadow-cyan-500/40 transition-all duration-200"
            >
              <Shield className="h-5 w-5" />
              Generate Q-Link
              <ChevronRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
            </Link>
            <Link
              to="/dashboard"
              className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-8 py-3.5 font-bold text-white hover:bg-white/10 transition-all duration-200"
            >
              View Dashboard
            </Link>
          </div>

          {/* Scroll indicator */}
          <div className="mt-16 flex justify-center">
            <div className="flex flex-col items-center gap-1 opacity-30">
              <div className="h-8 w-5 rounded-full border-2 border-white/40 flex justify-center pt-1.5">
                <div className="h-2 w-0.5 rounded-full bg-white animate-bounce" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── FEATURES SECTION ─────────────────────────────────────────────── */}
      <section className="relative px-4 py-24">
        <div className="mx-auto max-w-6xl">
          <div className="mb-16 text-center">
            <h2 className="mb-4 text-3xl font-bold text-white md:text-4xl">
              Built for the{" "}
              <span className="bg-gradient-to-r from-cyan-400 to-violet-400 bg-clip-text text-transparent">
                post-quantum era
              </span>
            </h2>
            <p className="text-slate-400 max-w-xl mx-auto">
              Every component is purpose-built for security, transparency, and decentralization.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <FeatureCard
              icon={Cpu}
              title="CRYSTALS-Kyber KEM"
              description="ML-KEM-768 (NIST FIPS 203) encapsulates your AES key. Resistant to both classical and quantum computer attacks — the future-proof standard."
              accent="bg-cyan-500/5"
            />
            <FeatureCard
              icon={Lock}
              title="AES-256-GCM Encryption"
              description="Your files are encrypted client-side using AES-256-GCM before leaving your browser. The server never sees plaintext — ever."
              accent="bg-violet-500/5"
            />
            <FeatureCard
              icon={Globe}
              title="IPFS Decentralized Storage"
              description="Encrypted blobs are stored on IPFS via Pinata. Content-addressable and censorship-resistant — no single point of failure."
              accent="bg-fuchsia-500/5"
            />
            <FeatureCard
              icon={Network}
              title="Polygon Smart Contract"
              description="QvaultAccess.sol enforces hard view limits on-chain. When your 3-view Q-Link is burned, no amount of money or power can re-open it."
              accent="bg-emerald-500/5"
            />
            <FeatureCard
              icon={Eye}
              title="Hard View Limits"
              description="Set a maximum of 1, 3, 5, or any number of views. The smart contract auto-revokes access once the limit is reached — immutable and trustless."
              accent="bg-orange-500/5"
            />
            <FeatureCard
              icon={FileKey}
              title="Zero-Knowledge Q-Links"
              description="Decryption keys travel only in the URL fragment (#). Per RFC 3986, fragments are never sent to servers. True client-side-only key transport."
              accent="bg-rose-500/5"
            />
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ─────────────────────────────────────────────────── */}
      <section className="px-4 py-24 bg-white/[0.01] border-y border-white/5">
        <div className="mx-auto max-w-4xl">
          <div className="mb-16 text-center">
            <h2 className="mb-4 text-3xl font-bold text-white md:text-4xl">
              How Q-Links work
            </h2>
            <p className="text-slate-400">
              From upload to view — end-to-end in four transparent steps.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            <div className="space-y-6">
              <h3 className="text-sm font-semibold uppercase tracking-widest text-cyan-400">
                🔐 Sender (Uploader)
              </h3>
              <Step
                num="1"
                title="Local Encryption"
                description="Your browser generates an AES-256 key and encrypts the file. ML-KEM-768 encapsulates the AES key. Zero bytes of plaintext leave your machine."
              />
              <Step
                num="2"
                title="IPFS Upload"
                description="The encrypted blob is pinned to IPFS via Pinata. You receive an immutable CID — a cryptographic fingerprint of the ciphertext."
              />
              <Step
                num="3"
                title="Smart Contract Registration"
                description="Your wallet calls createDocumentAccess() on Polygon with the CID, max view count, and expiry. The chain enforces your rules."
              />
              <Step
                num="4"
                title="Share Q-Link"
                description="A shareable URL is generated: the path holds the CID, the #fragment holds the decryption secret. Send it — the server never learns the key."
              />
            </div>

            <div className="space-y-6">
              <h3 className="text-sm font-semibold uppercase tracking-widest text-violet-400">
                👁️ Viewer (Recipient)
              </h3>
              <Step
                num="1"
                title="Contract Gate Check"
                description="The viewer's wallet calls requestAccess(). The contract checks: active? views remaining? not expired? Reverts if any rule is violated."
              />
              <Step
                num="2"
                title="Counter Increment"
                description="On success, currentViews increments atomically. If this was the last view, isActive is set to false — permanently and irreversibly."
              />
              <Step
                num="3"
                title="Fetch from IPFS"
                description="The encrypted blob is retrieved from IPFS. Anyone can fetch it — but without the #fragment key, it's indistinguishable from random noise."
              />
              <Step
                num="4"
                title="Client-Side Decryption"
                description="ML-KEM decapsulation recovers the AES key from the URL fragment. The file is decrypted in the browser and rendered — never uploaded decrypted."
              />
            </div>
          </div>
        </div>
      </section>

      {/* ── CTA SECTION ──────────────────────────────────────────────────── */}
      <section className="px-4 py-24 text-center">
        <div className="mx-auto max-w-2xl">
          <div className="mb-6 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-500 to-violet-600 shadow-2xl shadow-cyan-500/30">
            <Shield className="h-8 w-8 text-white" />
          </div>
          <h2 className="mb-4 text-3xl font-bold text-white">
            Ready to share securely?
          </h2>
          <p className="mb-8 text-slate-400">
            Encrypt your first document in under 30 seconds. No account required.
            Just your wallet and a file.
          </p>
          <Link
            to="/upload"
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-violet-600 px-10 py-4 text-lg font-bold text-white shadow-2xl shadow-cyan-500/25 hover:shadow-cyan-500/40 transition-all duration-200"
          >
            <Shield className="h-5 w-5" />
            Launch Qvault
          </Link>
          <p className="mt-4 text-xs text-slate-600">
            BITWISE Hackathon submission by Team TechNova
          </p>
        </div>
      </section>
    </div>
  );
}
