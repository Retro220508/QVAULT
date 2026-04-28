# 🔐 Qvault — Quantum-Secure Document Sharing Platform

**Team TechNova | BITWISE Hackathon Submission**

Qvault is a decentralized, post-quantum encrypted document sharing platform that combines CRYSTALS-Kyber (ML-KEM) cryptography, IPFS storage, and Polygon smart contracts to create self-destructing "Q-Links" with hard view limits.

---

## 🏗️ Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                    Browser (Client)                      │
│                                                          │
│  ┌──────────────────────────────────────────────────┐   │
│  │           ENCRYPTION PIPELINE                    │   │
│  │                                                  │   │
│  │  File → readFileAsBytes()                        │   │
│  │       → encryptFile() {                          │   │
│  │           1. Generate AES-256-GCM key            │   │
│  │           2. ML-KEM-768.generateKeyPair()        │   │
│  │           3. ML-KEM-768.encap(pk) → [ct, ss]    │   │
│  │           4. HKDF-SHA256(ss) → wrappingKey       │   │
│  │           5. wrapKey(aesKey, wrappingKey)         │   │
│  │           6. AES-256-GCM.encrypt(file)           │   │
│  │         }                                        │   │
│  │       → uploadFile(encryptedBlob) → CID          │   │
│  │       → createDocumentAccess(CID, maxViews, exp) │   │
│  │       → buildQLink(CID, ct, wrappedKey, sk)      │   │
│  └──────────────────────────────────────────────────┘   │
│                                                          │
└─────────┬──────────────────────┬────────────────────────┘
          │                      │
          ▼                      ▼
   ┌──────────────┐    ┌──────────────────────┐
   │  IPFS/Pinata │    │  Polygon Smart Contract│
   │              │    │   QvaultAccess.sol     │
   │  Encrypted   │    │                        │
   │  blob only   │    │  - createDocumentAccess│
   │  (no keys!)  │    │  - requestAccess()     │
   │              │    │  - revokeAccess()      │
   └──────────────┘    │  - getDocumentInfo()  │
                       └──────────────────────┘
```

### Q-Link URL Format

```
https://qvault.app/view/<IPFS_CID>#<kyberCiphertext>.<wrappedAesKey>.<kyberPrivateKey>
```

The `#fragment` is **never sent to any server** (RFC 3986 §3.5). This is the zero-knowledge key transport mechanism.

---

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- MetaMask browser extension
- Polygon Mumbai testnet MATIC (get from [faucet.polygon.technology](https://faucet.polygon.technology))
- Pinata account for IPFS (optional — demo mode works without it)
- Hardhat or Foundry for contract deployment

---

## Step 1: Install Dependencies

```bash
npm install
```

---

## Step 2: Configure Environment Variables

Create a `.env` file in the project root:

```env
# Pinata API credentials (get from https://app.pinata.cloud/keys)
VITE_PINATA_JWT=your_pinata_jwt_token_here

# Smart contract address (fill in after Step 4)
VITE_CONTRACT_ADDRESS=0x0000000000000000000000000000000000000000
```

> **Without Pinata JWT:** The app runs in **Demo Mode** — files are stored in localStorage and contract rules are simulated. This is perfect for judging!

---

## Step 3: Compile the Smart Contract

Install Hardhat (if not already):

```bash
npm install --save-dev hardhat @nomicfoundation/hardhat-toolbox
npx hardhat init  # Choose "Create an empty Hardhat config"
```

Copy the contract:

```bash
# contracts/QvaultAccess.sol is already in the repo
```

Compile:

```bash
npx hardhat compile
```

---

## Step 4: Deploy to Polygon Mumbai Testnet

Create `hardhat.config.js`:

```javascript
require("@nomicfoundation/hardhat-toolbox");

module.exports = {
  solidity: "0.8.20",
  networks: {
    mumbai: {
      url: "https://rpc-mumbai.maticvigil.com/",
      accounts: ["YOUR_PRIVATE_KEY"],  // Never commit this!
    },
  },
};
```

Create `scripts/deploy.js`:

```javascript
const { ethers } = require("hardhat");

async function main() {
  const QvaultAccess = await ethers.getContractFactory("QvaultAccess");
  const contract = await QvaultAccess.deploy();
  await contract.waitForDeployment();
  
  const address = await contract.getAddress();
  console.log("QvaultAccess deployed to:", address);
  console.log("Add this to your .env: VITE_CONTRACT_ADDRESS=" + address);
}

main().catch(console.error);
```

Deploy:

```bash
npx hardhat run scripts/deploy.js --network mumbai
```

Update `.env` with the deployed contract address.

---

## Step 5: Start the React App

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

---

## Step 6: Live Demo Workflow

### As the Uploader:

1. Navigate to `/upload`
2. Connect MetaMask to Polygon Mumbai
3. Drag & drop a PDF or image
4. Set **Max Views** (e.g., 3) and **Expiration** (e.g., 24 Hours)
5. Click **"Generate Q-Link"**:
   - Browser encrypts file locally (ML-KEM-768 + AES-256-GCM)
   - Encrypted blob uploads to IPFS
   - MetaMask prompts to call `createDocumentAccess()` on chain
   - Q-Link URL is displayed (copy & share it!)

### As the Viewer:

1. Open the full Q-Link URL (including `#fragment`)
2. Connect MetaMask
3. Click **"Sign Transaction & View Document"**:
   - Smart contract validates rules & increments counter
   - Encrypted blob fetched from IPFS
   - ML-KEM decapsulation + AES-GCM decryption (all in browser)
   - Document rendered in the browser
4. After **maxViews** accesses: **"🔥 Link Burned"** screen appears

---

## 📁 File Structure

```
qvault/
├── contracts/
│   └── QvaultAccess.sol          ← Solidity smart contract
├── src/
│   ├── utils/
│   │   ├── cryptoUtils.ts        ← ML-KEM + AES-256-GCM encryption
│   │   ├── ipfsService.ts        ← Pinata IPFS upload/download
│   │   └── contractUtils.ts      ← Ethers.js contract interactions
│   ├── pages/
│   │   ├── LandingPage.tsx       ← Hero page with feature overview
│   │   ├── UploadView.tsx        ← Drag-and-drop uploader + Q-Link gen
│   │   ├── DocumentView.tsx      ← Access validation + decryption viewer
│   │   ├── Dashboard.tsx         ← Owner document management
│   │   └── NotFound.tsx          ← 404 page
│   ├── components/
│   │   └── Navbar.tsx            ← Navigation with wallet button
│   ├── App.tsx                   ← Router root
│   └── index.css                 ← Global dark theme styles
├── public/
│   └── images/hero-bg.jpg
├── .env                          ← Your credentials (not in git!)
├── index.html
├── README.md
└── package.json
```

---

## 🔐 Cryptography Deep Dive

### Why ML-KEM-768 (CRYSTALS-Kyber)?

Kyber is the NIST FIPS 203 standardized post-quantum Key Encapsulation Mechanism (KEM). It's based on the **Module Learning With Errors (MLWE)** problem, which remains hard even for quantum computers.

- **ML-KEM-512** → NIST Security Level 1 (≈128-bit classical)  
- **ML-KEM-768** → NIST Security Level 3 (≈192-bit classical, ≈128-bit post-quantum) ← **We use this**
- **ML-KEM-1024** → NIST Security Level 5 (≈256-bit classical)

### Why AES-256-GCM?

- **Performance**: Kyber KEM can only encapsulate a short shared secret (~32 bytes). For file encryption, we need a fast symmetric cipher.
- **Authentication**: GCM provides authenticated encryption (AEAD) — tampering with ciphertext is detectable.
- **Standard**: AES-256-GCM is NIST-approved and accelerated by modern CPUs (AES-NI).

### Why HKDF-SHA256?

The raw Kyber shared secret needs to be "conditioned" before use as a key:
- HKDF provides domain separation (our `info` tag prevents reuse across contexts)
- Adds a fixed salt for key derivation best practices
- Output is a properly-distributed 256-bit key

---

## 📜 Smart Contract Functions

| Function | Access | Description |
|----------|--------|-------------|
| `createDocumentAccess(cid, maxViews, expiration, keyHash)` | Public | Register document with access rules |
| `requestAccess(cid)` | Public | Gate check — reverts if rules violated, increments counter |
| `revokeAccess(cid)` | Owner only | Permanently set `isActive = false` |
| `getDocumentInfo(cid)` | View | Get full document metadata |
| `checkAccess(cid)` | View | Read-only preflight check (no gas) |
| `getOwnerDocuments(address)` | View | List all CIDs owned by an address |

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, Vite 7, TypeScript |
| Styling | Tailwind CSS v4, Inter font |
| Cryptography | ML-KEM-768 (`mlkem` npm), Web Crypto API |
| Blockchain | Ethers.js v6, MetaMask |
| Smart Contract | Solidity 0.8.20, Polygon Mumbai |
| Storage | IPFS via Pinata API |
| Routing | React Router v6 |

---

## 🔒 Security Properties

| Property | Mechanism |
|----------|-----------|
| **Post-Quantum Security** | ML-KEM-768 resists quantum Grover/Shor attacks |
| **Zero-Knowledge Server** | URL fragment (#) never sent to server per RFC 3986 |
| **Forward Secrecy** | Each document uses a fresh ephemeral Kyber keypair |
| **Authenticated Encryption** | AES-256-GCM detects any ciphertext tampering |
| **Immutable View Limits** | Enforced by Polygon smart contract — cannot be bypassed |
| **Decentralized Storage** | IPFS content-addressing prevents server takedowns |
| **On-Chain Integrity** | SHA-256 of Kyber ciphertext stored in contract |

---

## 🧪 Testing the Demo

Without MetaMask or Pinata credentials, the app runs in **Demo Mode**:

1. Files are stored encrypted in `localStorage` (up to ~5MB)
2. Contract rules are enforced in `localStorage` (simulated blockchain)
3. All cryptography runs identically — ML-KEM + AES-256-GCM works fully
4. View limits and revocation work as expected

This is ideal for hackathon judging without any external dependencies!

---

## 📝 License

MIT License — Team TechNova, BITWISE Hackathon 2024

---

*"The next threat isn't a hacker — it's a quantum computer. Qvault is built for the world after that."*
