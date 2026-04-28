/**
 * @file cryptoUtils.ts
 * @description Client-side Post-Quantum Cryptography utilities for Qvault.
 *
 * ARCHITECTURE (Zero-Knowledge Hybrid Encryption):
 * ─────────────────────────────────────────────────
 *  Qvault uses a hybrid encryption scheme:
 *    • AES-256-GCM  → Encrypts the actual file payload (fast, authenticated)
 *    • ML-KEM-768   → Encapsulates the AES key (post-quantum key transport)
 *    • HKDF-SHA256  → Conditions the Kyber shared secret into an AES wrapping key
 *
 *  ENCRYPTION FLOW:
 *    1. Generate a fresh random 256-bit AES-GCM "file key"
 *    2. Encrypt the file with that AES key → encryptedBlob
 *    3. Generate a Kyber keypair (pkR, skR)
 *    4. Encapsulate with pkR → (kyberCiphertext, sharedSecret)
 *    5. HKDF(sharedSecret) → wrappingKey
 *    6. AES-GCM wrap the file key with wrappingKey → wrappedAesKey
 *    7. Q-Link URL fragment carries: kyberCiphertext + wrappedAesKey + skR
 *       (fragment is NEVER sent to the server — pure client-side)
 *
 *  DECRYPTION FLOW (Viewer):
 *    1. Parse URL fragment → { kyberCiphertext, wrappedAesKey, skR }
 *    2. Kyber decap(kyberCiphertext, skR) → sharedSecret
 *    3. HKDF(sharedSecret) → wrappingKey
 *    4. Unwrap wrappedAesKey → aesFileKey
 *    5. AES-GCM decrypt encryptedBlob → original file bytes
 *
 *  NOTE: ML-KEM (CRYSTALS-Kyber) is a KEM, NOT a cipher.
 *  NIST FIPS 203 standardized it as the post-quantum KEM standard.
 */

import { MlKem768 } from "mlkem";

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

/** AES-GCM nonce/IV length: 96 bits per NIST SP 800-38D recommendation */
const AES_IV_BYTES = 12;

/** HKDF info tag for domain separation — prevents key reuse across contexts */
const HKDF_INFO_STR = "qvault-v1-aes-key-wrapping";
const HKDF_SALT_STR = "qvault-kyber768-hkdf-salt-2024";

// ─────────────────────────────────────────────────────────────────────────────
// INTERFACES
// ─────────────────────────────────────────────────────────────────────────────

export interface EncryptionResult {
  /** AES-GCM encrypted file bytes with IV prepended */
  encryptedBlob: Uint8Array;
  /** Base64url-encoded ML-KEM-768 ciphertext (encapsulated shared secret) */
  kyberCiphertext: string;
  /** Base64url-encoded AES key wrapped by the Kyber-derived wrapping key */
  wrappedAesKey: string;
  /** Base64url-encoded Kyber private key (goes in URL fragment ONLY) */
  kyberPrivateKey: string;
  /** Base64url-encoded Kyber public key (stored for reference) */
  kyberPublicKey: string;
}

export interface DecryptionPayload {
  kyberCiphertext: string;
  wrappedAesKey: string;
  kyberPrivateKey: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// SAFE ARRAY BUFFER HELPER
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Copies a Uint8Array into a guaranteed plain ArrayBuffer.
 * This prevents TypeScript errors from Uint8Array<SharedArrayBuffer> vs
 * Uint8Array<ArrayBuffer> mismatches in WebCrypto API calls.
 */
function toArrayBuffer(u8: Uint8Array): ArrayBuffer {
  const copy = new ArrayBuffer(u8.byteLength);
  new Uint8Array(copy).set(u8);
  return copy;
}

// ─────────────────────────────────────────────────────────────────────────────
// BASE64URL HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Encode Uint8Array to URL-safe Base64 (no padding).
 * URL-safe variant replaces +/= with -/_ to be safe in URL fragments.
 */
export function toBase64(bytes: Uint8Array): string {
  let binary = "";
  const CHUNK = 8192;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...Array.from(bytes.subarray(i, i + CHUNK)));
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * Decode URL-safe Base64 string to Uint8Array.
 */
export function fromBase64(b64: string): Uint8Array {
  const standard = b64.replace(/-/g, "+").replace(/_/g, "/");
  const padded   = standard + "=".repeat((4 - (standard.length % 4)) % 4);
  const binary   = atob(padded);
  const bytes    = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

// ─────────────────────────────────────────────────────────────────────────────
// HKDF KEY DERIVATION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Derives an AES-256-GCM wrapping key from the raw Kyber shared secret.
 *
 * Why HKDF? The Kyber shared secret is high-entropy but not structured as an
 * AES key. HKDF-SHA256 conditions it into proper keying material with
 * domain separation (info tag), preventing cross-protocol key reuse.
 */
async function deriveWrappingKey(sharedSecret: Uint8Array): Promise<CryptoKey> {
  const enc  = new TextEncoder();
  const info = enc.encode(HKDF_INFO_STR);
  const salt = enc.encode(HKDF_SALT_STR);

  // Import raw Kyber bytes as HKDF key material (non-extractable)
  const ikm = await crypto.subtle.importKey(
    "raw",
    toArrayBuffer(sharedSecret),
    { name: "HKDF" },
    false,
    ["deriveKey"]
  );

  // Derive 256-bit AES-GCM wrapping key via HKDF-SHA256
  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: toArrayBuffer(salt),
      info: toArrayBuffer(info),
    },
    ikm,
    { name: "AES-GCM", length: 256 },
    true,   // extractable needed for wrapKey/unwrapKey
    ["wrapKey", "unwrapKey"]
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN ENCRYPTION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Encrypts a file using hybrid Post-Quantum encryption.
 *
 * Combines ML-KEM-768 (post-quantum key transport) with AES-256-GCM
 * (fast symmetric encryption). Everything runs in the browser — zero
 * plaintext ever leaves the client.
 *
 * @param fileBytes  Raw bytes of the document to encrypt
 * @returns          EncryptionResult containing all ciphertext components
 */
export async function encryptFile(fileBytes: Uint8Array): Promise<EncryptionResult> {
  console.log("[Qvault] Starting hybrid PQ encryption (ML-KEM-768 + AES-256-GCM)…");

  // ── 1. Generate ML-KEM-768 keypair ─────────────────────────────────────────
  //    ML-KEM-768 ≈ 128-bit post-quantum security (NIST Security Level 3)
  const kyber = new MlKem768();
  const [pkR, skR] = await kyber.generateKeyPair();
  console.log("[Qvault] ML-KEM-768 keypair generated. pk size:", pkR.length, "bytes");

  // ── 2. Encapsulate: produce (kyberCiphertext, sharedSecret) ───────────────
  //    kyberCiphertext → safe to store on IPFS / smart contract
  //    sharedSecret    → ephemeral, only recoverable with skR
  const [kyberCiphertext, sharedSecret] = await kyber.encap(pkR);
  console.log("[Qvault] ML-KEM encapsulation complete. ss:", sharedSecret.length, "bytes");

  // ── 3. Derive AES wrapping key from the Kyber shared secret via HKDF ──────
  const wrappingKey = await deriveWrappingKey(sharedSecret);

  // ── 4. Generate fresh AES-256-GCM file encryption key ─────────────────────
  const aesFileKey = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,   // extractable required for wrapKey()
    ["encrypt", "decrypt"]
  );
  console.log("[Qvault] AES-256-GCM file key generated.");

  // ── 5. Wrap (encrypt) the AES file key using the Kyber-derived key ─────────
  const wrapIv = crypto.getRandomValues(new Uint8Array(AES_IV_BYTES));
  const wrappedKeyBuffer = await crypto.subtle.wrapKey(
    "raw",
    aesFileKey,
    wrappingKey,
    { name: "AES-GCM", iv: wrapIv }
  );

  // Pack: [wrapIV (12 bytes)] ‖ [wrappedKey ciphertext]
  const wrappedKeyBytes = new Uint8Array(AES_IV_BYTES + wrappedKeyBuffer.byteLength);
  wrappedKeyBytes.set(wrapIv, 0);
  wrappedKeyBytes.set(new Uint8Array(wrappedKeyBuffer), AES_IV_BYTES);

  // ── 6. Encrypt the file with AES-256-GCM ──────────────────────────────────
  const fileIv   = crypto.getRandomValues(new Uint8Array(AES_IV_BYTES));
  const encBuffer = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: fileIv },
    aesFileKey,
    toArrayBuffer(fileBytes)
  );

  // Pack: [fileIV (12 bytes)] ‖ [encrypted ciphertext]
  const encryptedBlob = new Uint8Array(AES_IV_BYTES + encBuffer.byteLength);
  encryptedBlob.set(fileIv, 0);
  encryptedBlob.set(new Uint8Array(encBuffer), AES_IV_BYTES);

  console.log(`[Qvault] Encryption complete. Ciphertext: ${encryptedBlob.length} bytes.`);

  return {
    encryptedBlob,
    kyberCiphertext: toBase64(kyberCiphertext),
    wrappedAesKey:   toBase64(wrappedKeyBytes),
    kyberPrivateKey: toBase64(skR),
    kyberPublicKey:  toBase64(pkR),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN DECRYPTION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Decrypts a file using secret material from the Q-Link URL fragment.
 *
 * @param encryptedBlob  AES-GCM ciphertext (IV prepended) fetched from IPFS
 * @param payload        Decryption keys extracted from the URL hash fragment
 * @returns              Original plaintext file bytes
 */
export async function decryptFile(
  encryptedBlob: Uint8Array,
  payload: DecryptionPayload
): Promise<Uint8Array> {
  console.log("[Qvault] Starting hybrid PQ decryption…");

  // ── 1. Decode Base64url components from Q-Link ────────────────────────────
  const ciphertextBytes  = fromBase64(payload.kyberCiphertext);
  const wrappedKeyWithIv = fromBase64(payload.wrappedAesKey);
  const privateKeyBytes  = fromBase64(payload.kyberPrivateKey);

  // ── 2. ML-KEM Decapsulation: recover shared secret ───────────────────────
  //    Only the holder of skR can recover the sharedSecret from kyberCiphertext.
  const kyber       = new MlKem768();
  const sharedSecret = await kyber.decap(ciphertextBytes, privateKeyBytes);
  console.log("[Qvault] ML-KEM decapsulation successful.");

  // ── 3. Re-derive the AES wrapping key ─────────────────────────────────────
  const wrappingKey = await deriveWrappingKey(sharedSecret);

  // ── 4. Unwrap the AES file key ────────────────────────────────────────────
  const wrapIv       = wrappedKeyWithIv.slice(0, AES_IV_BYTES);
  const wrappedBytes = wrappedKeyWithIv.slice(AES_IV_BYTES);

  const aesFileKey = await crypto.subtle.unwrapKey(
    "raw",
    toArrayBuffer(wrappedBytes),
    wrappingKey,
    { name: "AES-GCM", iv: wrapIv },
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"]
  );
  console.log("[Qvault] AES file key recovered.");

  // ── 5. Decrypt the file blob ───────────────────────────────────────────────
  const fileIv     = encryptedBlob.slice(0, AES_IV_BYTES);
  const cipherData = encryptedBlob.slice(AES_IV_BYTES);

  const plainBuffer = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fileIv },
    aesFileKey,
    toArrayBuffer(cipherData)
  );

  console.log("[Qvault] File decrypted successfully.");
  return new Uint8Array(plainBuffer);
}

// ─────────────────────────────────────────────────────────────────────────────
// Q-LINK BUILDER & PARSER
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Constructs the shareable Q-Link URL.
 *
 * SECURITY: The URL fragment (#…) is NEVER sent to the server per the HTTP
 * specification (RFC 3986 §3.5). It lives purely in the browser, making this
 * a zero-knowledge sharing mechanism — the server never sees the decryption key.
 *
 * Format:
 *   https://qvault.app/view/<CID>#<kyberCiphertext>.<wrappedAesKey>.<kyberPrivateKey>
 *
 * "." delimiter is safe in base64url — does not conflict with URL syntax.
 */
export function buildQLink(
  cid: string,
  result: Pick<EncryptionResult, "kyberCiphertext" | "wrappedAesKey" | "kyberPrivateKey">,
  baseUrl?: string
): string {
  const origin   = baseUrl ?? window.location.origin;
  const fragment = [result.kyberCiphertext, result.wrappedAesKey, result.kyberPrivateKey].join(".");
  return `${origin}/view/${cid}#${fragment}`;
}

/**
 * Parses the Q-Link URL fragment into a DecryptionPayload.
 *
 * @param hash  Raw URL hash string (with or without leading '#')
 * @returns     DecryptionPayload or null if malformed
 */
export function parseQLink(hash?: string): DecryptionPayload | null {
  try {
    const raw   = (hash ?? window.location.hash).replace(/^#/, "").trim();
    const parts = raw.split(".");

    if (parts.length !== 3) {
      console.error("[Qvault] Invalid Q-Link: need 3 dot-separated parts, got", parts.length);
      return null;
    }

    const [kyberCiphertext, wrappedAesKey, kyberPrivateKey] = parts;

    if (!kyberCiphertext || !wrappedAesKey || !kyberPrivateKey) {
      console.error("[Qvault] Q-Link has empty components.");
      return null;
    }

    return { kyberCiphertext, wrappedAesKey, kyberPrivateKey };
  } catch (err) {
    console.error("[Qvault] Failed to parse Q-Link:", err);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// INTEGRITY HASH (for on-chain storage)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Computes SHA-256 of the Kyber ciphertext, formatted as a bytes32 hex string.
 * Stored in the smart contract for on-chain integrity verification.
 * The contract can verify that fetched IPFS data matches the registered hash.
 */
export async function computeKeyHash(kyberCiphertextB64: string): Promise<string> {
  const bytes  = fromBase64(kyberCiphertextB64);
  const digest = await crypto.subtle.digest("SHA-256", toArrayBuffer(bytes));
  return "0x" + Array.from(new Uint8Array(digest))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

// ─────────────────────────────────────────────────────────────────────────────
// FILE HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Reads a browser File object into a Uint8Array via FileReader API.
 */
export function readFileAsBytes(file: File): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const reader    = new FileReader();
    reader.onload   = (e) => resolve(new Uint8Array(e.target!.result as ArrayBuffer));
    reader.onerror  = ()  => reject(new Error(`Failed to read file: ${file.name}`));
    reader.readAsArrayBuffer(file);
  });
}

/**
 * Detects MIME type from magic bytes for rendering decrypted content.
 * Used to reconstruct the blob type after AES-GCM decryption.
 */
export function detectMimeType(bytes: Uint8Array): string {
  const hex = Array.from(bytes.slice(0, 8))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");

  if (hex.startsWith("89504e47"))          return "image/png";
  if (hex.startsWith("ffd8ff"))            return "image/jpeg";
  if (hex.startsWith("47494638"))          return "image/gif";
  if (hex.startsWith("25504446"))          return "application/pdf";
  if (hex.startsWith("504b0304"))          return "application/zip";
  if (hex.startsWith("52494646"))          return "image/webp";
  if (hex.startsWith("000000") && hex.includes("667479")) return "video/mp4";
  return "application/octet-stream";
}
