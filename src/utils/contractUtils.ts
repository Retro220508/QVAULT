/**
 * @file contractUtils.ts
 * @description Ethers.js utilities for interacting with the QvaultAccess smart contract.
 *
 * CONTRACT: QvaultAccess.sol deployed on Polygon Mumbai Testnet
 *
 * FUNCTIONS USED:
 *   - createDocumentAccess(cid, maxViews, expiration, encryptedKeyHash) → tx
 *   - requestAccess(cid) → bool (reverts if denied)
 *   - checkAccess(cid) → (bool canAccess, string reason)
 *   - getDocumentInfo(cid) → full struct
 *   - revokeAccess(cid) → tx
 *
 * This module handles wallet detection, provider creation, and all contract calls.
 */

import { ethers } from "ethers";

// ─────────────────────────────────────────────────────────────────────────────
// CONTRACT CONFIGURATION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * QvaultAccess ABI — only the functions we need on the frontend.
 * Keep ABI minimal for smaller bundle size.
 */
export const QVAULT_ABI = [
  // Write functions
  "function createDocumentAccess(string cid, uint256 _maxViews, uint256 _expiration, bytes32 _encryptedKeyHash) external",
  "function requestAccess(string cid) external returns (bool)",
  "function revokeAccess(string cid) external",

  // Read functions
  "function getDocumentInfo(string cid) external view returns (address owner, uint256 maxViews, uint256 currentViews, uint256 expirationTimestamp, bool isActive, bytes32 encryptedKeyHash, uint256 remainingViews)",
  "function checkAccess(string cid) external view returns (bool canAccess, string reason)",
  "function getOwnerDocuments(address owner) external view returns (string[])",

  // Events
  "event DocumentCreated(string indexed cid, address indexed owner, uint256 maxViews, uint256 expirationTimestamp)",
  "event AccessGranted(string indexed cid, address indexed viewer, uint256 viewNumber, uint256 remainingViews)",
  "event AccessRevoked(string indexed cid, address indexed revokedBy, string reason)",
];

/**
 * Contract address on Polygon Mumbai Testnet.
 * Replace this with the actual deployed address after running:
 *   npx hardhat run scripts/deploy.js --network mumbai
 */
export const CONTRACT_ADDRESS = (import.meta as { env?: { VITE_CONTRACT_ADDRESS?: string } }).env?.VITE_CONTRACT_ADDRESS ?? "0x0000000000000000000000000000000000000000";

/** Polygon Mumbai Testnet Chain ID */
export const POLYGON_MUMBAI_CHAIN_ID = 80001;

/** Polygon Mainnet Chain ID */
export const POLYGON_MAINNET_CHAIN_ID = 137;

// ─────────────────────────────────────────────────────────────────────────────
// METAMASK DETECTION & PROVIDER
// ─────────────────────────────────────────────────────────────────────────────

/** Type for window.ethereum (MetaMask injects this) */
interface EthereumProvider {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on: (event: string, handler: (...args: unknown[]) => void) => void;
  removeListener: (event: string, handler: (...args: unknown[]) => void) => void;
  isMetaMask?: boolean;
}

declare global {
  interface Window {
    ethereum?: EthereumProvider;
  }
}

/**
 * Checks if MetaMask (or another Web3 wallet) is installed.
 */
export function isMetaMaskInstalled(): boolean {
  return typeof window !== "undefined" && typeof window.ethereum !== "undefined";
}

/**
 * Gets the ethers BrowserProvider (wraps window.ethereum).
 * Throws a descriptive error if MetaMask isn't installed.
 */
export function getProvider(): ethers.BrowserProvider {
  if (!isMetaMaskInstalled()) {
    throw new Error(
      "MetaMask is not installed. Please install MetaMask (metamask.io) " +
      "to interact with the Qvault smart contract."
    );
  }
  return new ethers.BrowserProvider(window.ethereum!);
}

/**
 * Requests wallet connection and returns the signer.
 * This triggers the MetaMask popup for account authorization.
 */
export async function getSigner(): Promise<ethers.JsonRpcSigner> {
  const provider = getProvider();

  // eth_requestAccounts triggers MetaMask to ask the user to connect
  await provider.send("eth_requestAccounts", []);

  return provider.getSigner();
}

/**
 * Returns the currently connected wallet address, or null if not connected.
 */
export async function getConnectedAddress(): Promise<string | null> {
  if (!isMetaMaskInstalled()) return null;
  try {
    const provider  = getProvider();
    const accounts  = await provider.send("eth_accounts", []) as string[];
    return accounts.length > 0 ? accounts[0] : null;
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// NETWORK UTILITIES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Gets the current network chain ID from MetaMask.
 */
export async function getChainId(): Promise<number> {
  const provider = getProvider();
  const network  = await provider.getNetwork();
  return Number(network.chainId);
}

/**
 * Prompts MetaMask to switch to Polygon Mumbai Testnet.
 * If the network isn't added, prompts to add it first.
 */
export async function switchToPolygonMumbai(): Promise<void> {
  if (!isMetaMaskInstalled()) return;

  try {
    await window.ethereum!.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: `0x${POLYGON_MUMBAI_CHAIN_ID.toString(16)}` }],
    });
  } catch (err: unknown) {
    // Error code 4902: chain not added to MetaMask
    const error = err as { code?: number };
    if (error.code === 4902) {
      await window.ethereum!.request({
        method: "wallet_addEthereumChain",
        params: [{
          chainId: `0x${POLYGON_MUMBAI_CHAIN_ID.toString(16)}`,
          chainName: "Polygon Mumbai Testnet",
          nativeCurrency: { name: "MATIC", symbol: "MATIC", decimals: 18 },
          rpcUrls: ["https://rpc-mumbai.maticvigil.com/"],
          blockExplorerUrls: ["https://mumbai.polygonscan.com/"],
        }],
      });
    } else {
      throw err;
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// CONTRACT INSTANCE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns a read-only contract instance (no signer required).
 * Use for view functions like checkAccess(), getDocumentInfo().
 */
export async function getReadContract(): Promise<ethers.Contract> {
  const provider = getProvider();
  return new ethers.Contract(CONTRACT_ADDRESS, QVAULT_ABI, provider);
}

/**
 * Returns a write-enabled contract instance (signer required).
 * Use for state-changing functions like createDocumentAccess(), requestAccess().
 */
export async function getWriteContract(): Promise<ethers.Contract> {
  const signer = await getSigner();
  return new ethers.Contract(CONTRACT_ADDRESS, QVAULT_ABI, signer);
}

// ─────────────────────────────────────────────────────────────────────────────
// DOCUMENT ACCESS FUNCTIONS
// ─────────────────────────────────────────────────────────────────────────────

export interface DocumentInfo {
  owner: string;
  maxViews: bigint;
  currentViews: bigint;
  expirationTimestamp: bigint;
  isActive: boolean;
  encryptedKeyHash: string;
  remainingViews: bigint;
}

/**
 * Calls createDocumentAccess() on the smart contract.
 * Sets up the access-control rules for a newly uploaded document.
 *
 * @param cid               IPFS CID of the encrypted file
 * @param maxViews          Maximum allowed views (e.g., 3)
 * @param expirationHours   Hours until expiration (0 = never expires)
 * @param encryptedKeyHash  SHA-256 of the Kyber ciphertext (as bytes32 hex)
 * @returns                 Transaction hash
 */
export async function createDocumentAccess(
  cid: string,
  maxViews: number,
  expirationHours: number,
  encryptedKeyHash: string
): Promise<string> {
  const contract = await getWriteContract();

  // Calculate expiration timestamp: 0 means no expiry
  const expirationTimestamp = expirationHours > 0
    ? BigInt(Math.floor(Date.now() / 1000) + expirationHours * 3600)
    : BigInt(0);

  console.log(`[Qvault Contract] createDocumentAccess(${cid}, ${maxViews}, ${expirationTimestamp})`);

  const tx = await contract.createDocumentAccess(
    cid,
    BigInt(maxViews),
    expirationTimestamp,
    encryptedKeyHash
  );

  const receipt = await tx.wait();
  console.log(`[Qvault Contract] Transaction confirmed: ${receipt.hash}`);
  return receipt.hash as string;
}

/**
 * Calls requestAccess() on the smart contract.
 * This is the "gate" — reverts if access rules are violated.
 * Increments the view counter on success.
 *
 * @param cid  IPFS CID of the document
 * @returns    true if access granted (throws if denied)
 */
export async function requestAccess(cid: string): Promise<boolean> {
  const contract = await getWriteContract();
  console.log(`[Qvault Contract] requestAccess(${cid})`);

  const tx = await contract.requestAccess(cid);
  await tx.wait();
  console.log(`[Qvault Contract] Access granted for CID: ${cid}`);
  return true;
}

/**
 * Calls checkAccess() as a read-only view (no gas, no tx).
 * Use for UI preflight to show access status before committing a transaction.
 *
 * @param cid  IPFS CID of the document
 * @returns    { canAccess: boolean, reason: string }
 */
export async function checkAccess(cid: string): Promise<{ canAccess: boolean; reason: string }> {
  try {
    const contract  = await getReadContract();
    const [canAccess, reason] = await contract.checkAccess(cid) as [boolean, string];
    return { canAccess, reason };
  } catch (err) {
    console.error("[Qvault Contract] checkAccess error:", err);
    return { canAccess: false, reason: "CONTRACT_ERROR" };
  }
}

/**
 * Fetches full document metadata from the contract.
 *
 * @param cid  IPFS CID of the document
 * @returns    DocumentInfo struct or null if not found
 */
export async function getDocumentInfo(cid: string): Promise<DocumentInfo | null> {
  try {
    const contract = await getReadContract();
    const result   = await contract.getDocumentInfo(cid) as [string, bigint, bigint, bigint, boolean, string, bigint];
    return {
      owner:               result[0],
      maxViews:            result[1],
      currentViews:        result[2],
      expirationTimestamp: result[3],
      isActive:            result[4],
      encryptedKeyHash:    result[5],
      remainingViews:      result[6],
    };
  } catch {
    return null;
  }
}

/**
 * Calls revokeAccess() — owner-only, permanently revokes the document.
 */
export async function revokeAccess(cid: string): Promise<string> {
  const contract = await getWriteContract();
  const tx       = await contract.revokeAccess(cid);
  const receipt  = await tx.wait();
  return receipt.hash as string;
}

/**
 * Returns all document CIDs owned by an address.
 */
export async function getOwnerDocuments(address: string): Promise<string[]> {
  try {
    const contract = await getReadContract();
    return await contract.getOwnerDocuments(address) as string[];
  } catch {
    return [];
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ERROR PARSING
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parses ethers.js contract errors into user-friendly messages.
 * Smart contract custom errors are decoded here.
 */
export function parseContractError(err: unknown): string {
  if (err instanceof Error) {
    const msg = err.message;

    // MetaMask user rejection
    if (msg.includes("user rejected") || msg.includes("ACTION_REJECTED")) {
      return "Transaction cancelled by user.";
    }

    // Contract reverts — match our custom error names
    if (msg.includes("AccessDenied_ViewLimitReached")) {
      return "Access Denied: View limit reached. This Q-Link has been burned.";
    }
    if (msg.includes("AccessDenied_Inactive")) {
      return "Access Denied: This document has been revoked.";
    }
    if (msg.includes("AccessDenied_Expired")) {
      return "Access Denied: This Q-Link has expired.";
    }
    if (msg.includes("DocumentNotFound")) {
      return "Document not found on-chain. The CID may be incorrect.";
    }
    if (msg.includes("DocumentAlreadyExists")) {
      return "This CID is already registered on-chain.";
    }
    if (msg.includes("NotDocumentOwner")) {
      return "Only the document owner can perform this action.";
    }
    if (msg.includes("MetaMask is not installed")) {
      return "MetaMask is not installed. Please install it from metamask.io.";
    }
    if (msg.includes("insufficient funds")) {
      return "Insufficient MATIC for gas fees. Please add MATIC to your wallet.";
    }

    return msg.slice(0, 200); // Truncate very long messages
  }
  return "An unknown error occurred.";
}

// ─────────────────────────────────────────────────────────────────────────────
// DEMO MODE (no MetaMask / no contract)
// ─────────────────────────────────────────────────────────────────────────────

interface DemoDocument {
  cid: string;
  maxViews: number;
  currentViews: number;
  expirationTimestamp: number;
  isActive: boolean;
  owner: string;
}

const DEMO_DOCS_KEY = "qvault_demo_contracts";

function loadDemoDocs(): Record<string, DemoDocument> {
  try {
    return JSON.parse(localStorage.getItem(DEMO_DOCS_KEY) ?? "{}") as Record<string, DemoDocument>;
  } catch {
    return {};
  }
}

function saveDemoDocs(docs: Record<string, DemoDocument>): void {
  localStorage.setItem(DEMO_DOCS_KEY, JSON.stringify(docs));
}

/** Demo version of createDocumentAccess (no MetaMask required) */
export function demoCreateDocumentAccess(
  cid: string,
  maxViews: number,
  expirationHours: number,
  ownerAddress: string = "0xDemo"
): void {
  const docs = loadDemoDocs();
  docs[cid] = {
    cid,
    maxViews,
    currentViews: 0,
    expirationTimestamp: expirationHours > 0
      ? Math.floor(Date.now() / 1000) + expirationHours * 3600
      : 0,
    isActive: true,
    owner: ownerAddress,
  };
  saveDemoDocs(docs);
}

/** Demo version of requestAccess */
export function demoRequestAccess(cid: string): { granted: boolean; reason: string } {
  const docs = loadDemoDocs();
  const doc  = docs[cid];

  if (!doc) return { granted: false, reason: "NOT_FOUND" };
  if (!doc.isActive) return { granted: false, reason: "INACTIVE" };
  if (doc.currentViews >= doc.maxViews) {
    doc.isActive = false;
    saveDemoDocs(docs);
    return { granted: false, reason: "VIEW_LIMIT_REACHED" };
  }
  if (doc.expirationTimestamp > 0 && Date.now() / 1000 >= doc.expirationTimestamp) {
    doc.isActive = false;
    saveDemoDocs(docs);
    return { granted: false, reason: "EXPIRED" };
  }

  doc.currentViews += 1;
  if (doc.currentViews >= doc.maxViews) doc.isActive = false;
  saveDemoDocs(docs);
  return { granted: true, reason: "OK" };
}

/** Demo version of getDocumentInfo */
export function demoGetDocumentInfo(cid: string): DemoDocument | null {
  return loadDemoDocs()[cid] ?? null;
}
