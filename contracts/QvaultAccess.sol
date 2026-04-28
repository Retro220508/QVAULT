// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title QvaultAccess
 * @author Team TechNova — BITWISE Hackathon
 * @notice Manages decentralized, view-limited access to quantum-encrypted documents
 *         stored on IPFS. Each document is identified by its IPFS CID and mapped
 *         to an owner with configurable view limits and expiration timestamps.
 *
 * @dev Architecture:
 *   1. Owner calls createDocumentAccess() after uploading encrypted blob to IPFS.
 *   2. Viewer calls requestAccess() which atomically checks rules & increments counter.
 *   3. Once maxViews is reached, the contract auto-revokes (isActive → false).
 *   4. Owner can manually revoke at any time via revokeAccess().
 *
 * Deployed on: Polygon Mumbai Testnet (chainId: 80001)
 */
contract QvaultAccess {

    // ─────────────────────────────────────────────────────────────────────────
    // STRUCTS
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @dev Stores all metadata and access-control rules for a single document.
     * @param owner             Wallet address that uploaded and owns the document.
     * @param maxViews          Maximum number of times the document can be accessed.
     * @param currentViews      Running count of successful access grants.
     * @param expirationTimestamp  Unix timestamp after which access is denied (0 = no expiry).
     * @param isActive          Master switch; set to false to permanently revoke.
     * @param encryptedKeyHash  keccak256 of the Kyber ciphertext for on-chain integrity checks.
     */
    struct DocumentAccess {
        address  owner;
        uint256  maxViews;
        uint256  currentViews;
        uint256  expirationTimestamp;
        bool     isActive;
        bytes32  encryptedKeyHash;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // STATE
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Maps IPFS CID string → DocumentAccess metadata
    mapping(string => DocumentAccess) private _documents;

    /// @notice Tracks all CIDs created by an owner for enumeration on the UI
    mapping(address => string[]) private _ownerDocuments;

    // ─────────────────────────────────────────────────────────────────────────
    // EVENTS
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Fired when a new document record is created
    event DocumentCreated(
        string  indexed cid,
        address indexed owner,
        uint256 maxViews,
        uint256 expirationTimestamp
    );

    /// @notice Fired each time a viewer successfully accesses a document
    event AccessGranted(
        string  indexed cid,
        address indexed viewer,
        uint256 viewNumber,
        uint256 remainingViews
    );

    /// @notice Fired when a document is permanently revoked (by owner or auto-burn)
    event AccessRevoked(
        string  indexed cid,
        address indexed revokedBy,
        string  reason
    );

    // ─────────────────────────────────────────────────────────────────────────
    // ERRORS  (gas-efficient custom errors vs. revert strings)
    // ─────────────────────────────────────────────────────────────────────────

    error DocumentAlreadyExists(string cid);
    error DocumentNotFound(string cid);
    error NotDocumentOwner(address caller, address owner);
    error AccessDenied_Inactive(string cid);
    error AccessDenied_ViewLimitReached(string cid, uint256 maxViews);
    error AccessDenied_Expired(string cid, uint256 expirationTimestamp);
    error InvalidMaxViews();
    error InvalidExpiration();

    // ─────────────────────────────────────────────────────────────────────────
    // MODIFIERS
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @dev Ensures the caller is the registered owner of the document.
     */
    modifier onlyDocumentOwner(string calldata cid) {
        DocumentAccess storage doc = _documents[cid];
        if (doc.owner == address(0)) revert DocumentNotFound(cid);
        if (doc.owner != msg.sender) revert NotDocumentOwner(msg.sender, doc.owner);
        _;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // CORE FUNCTIONS
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Registers a new document with its access-control parameters.
     *
     * @dev Called by the document owner immediately after IPFS upload.
     *      The CID must be unique — re-uploading the same document requires a new CID.
     *
     * @param cid               IPFS Content Identifier of the Kyber-encrypted file blob.
     * @param _maxViews         Hard cap on total allowed views (must be > 0).
     * @param _expiration       Unix timestamp of expiration (0 means no time limit).
     * @param _encryptedKeyHash keccak256 of the Kyber ciphertext for integrity verification.
     */
    function createDocumentAccess(
        string  calldata cid,
        uint256 _maxViews,
        uint256 _expiration,
        bytes32 _encryptedKeyHash
    ) external {
        // Guard: CID must not already be registered
        if (_documents[cid].owner != address(0)) {
            revert DocumentAlreadyExists(cid);
        }

        // Guard: maxViews must be a positive integer
        if (_maxViews == 0) revert InvalidMaxViews();

        // Guard: expiration must be in the future (0 is allowed to mean "never")
        if (_expiration != 0 && _expiration <= block.timestamp) {
            revert InvalidExpiration();
        }

        // Write the document record to state
        _documents[cid] = DocumentAccess({
            owner:               msg.sender,
            maxViews:            _maxViews,
            currentViews:        0,
            expirationTimestamp: _expiration,
            isActive:            true,
            encryptedKeyHash:    _encryptedKeyHash
        });

        // Track this CID under the owner's list (for dashboard enumeration)
        _ownerDocuments[msg.sender].push(cid);

        emit DocumentCreated(cid, msg.sender, _maxViews, _expiration);
    }

    /**
     * @notice Atomically validates access rules and increments the view counter.
     *
     * @dev This is the "gate" function. The frontend calls this before attempting
     *      to decrypt. If it reverts, the document is inaccessible.
     *      Auto-burns (sets isActive=false) when maxViews is reached.
     *
     * @param cid  IPFS Content Identifier of the requested document.
     * @return     Always true if the call succeeds (reverts otherwise).
     */
    function requestAccess(string calldata cid) external returns (bool) {
        DocumentAccess storage doc = _documents[cid];

        // Guard: document must exist
        if (doc.owner == address(0)) revert DocumentNotFound(cid);

        // Guard: document must be active (not revoked)
        if (!doc.isActive) revert AccessDenied_Inactive(cid);

        // Guard: view limit must not be exceeded
        if (doc.currentViews >= doc.maxViews) {
            revert AccessDenied_ViewLimitReached(cid, doc.maxViews);
        }

        // Guard: expiration check (skip if expiration == 0 → no time limit)
        if (doc.expirationTimestamp != 0 && block.timestamp >= doc.expirationTimestamp) {
            // Auto-revoke expired documents
            doc.isActive = false;
            emit AccessRevoked(cid, address(this), "EXPIRED");
            revert AccessDenied_Expired(cid, doc.expirationTimestamp);
        }

        // ✅ All checks passed — grant access
        doc.currentViews += 1;

        uint256 remaining = doc.maxViews - doc.currentViews;

        emit AccessGranted(cid, msg.sender, doc.currentViews, remaining);

        // Auto-burn: if this was the last allowed view, permanently revoke
        if (doc.currentViews >= doc.maxViews) {
            doc.isActive = false;
            emit AccessRevoked(cid, address(this), "VIEW_LIMIT_REACHED");
        }

        return true;
    }

    /**
     * @notice Allows the document owner to permanently revoke access to their document.
     *
     * @dev Sets isActive = false. This is irreversible — once revoked, no re-activation.
     *      Only the original owner (msg.sender) can call this.
     *
     * @param cid  IPFS Content Identifier of the document to revoke.
     */
    function revokeAccess(string calldata cid) external onlyDocumentOwner(cid) {
        DocumentAccess storage doc = _documents[cid];

        // Idempotent — no revert if already revoked, just silently succeed
        if (!doc.isActive) return;

        doc.isActive = false;
        emit AccessRevoked(cid, msg.sender, "OWNER_REVOKED");
    }

    // ─────────────────────────────────────────────────────────────────────────
    // VIEW FUNCTIONS (read-only, no gas for calls)
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Returns full metadata for a document.
     * @param cid  IPFS CID to query.
     */
    function getDocumentInfo(string calldata cid)
        external
        view
        returns (
            address  owner,
            uint256  maxViews,
            uint256  currentViews,
            uint256  expirationTimestamp,
            bool     isActive,
            bytes32  encryptedKeyHash,
            uint256  remainingViews
        )
    {
        DocumentAccess storage doc = _documents[cid];
        if (doc.owner == address(0)) revert DocumentNotFound(cid);

        uint256 remaining = doc.currentViews >= doc.maxViews
            ? 0
            : doc.maxViews - doc.currentViews;

        return (
            doc.owner,
            doc.maxViews,
            doc.currentViews,
            doc.expirationTimestamp,
            doc.isActive,
            doc.encryptedKeyHash,
            remaining
        );
    }

    /**
     * @notice Returns whether access would currently be granted (view-only check).
     * @dev Does NOT modify state or increment counter. Use for UI preflight checks.
     * @param cid  IPFS CID to check.
     */
    function checkAccess(string calldata cid) external view returns (bool canAccess, string memory reason) {
        DocumentAccess storage doc = _documents[cid];

        if (doc.owner == address(0))        return (false, "NOT_FOUND");
        if (!doc.isActive)                  return (false, "INACTIVE");
        if (doc.currentViews >= doc.maxViews) return (false, "VIEW_LIMIT_REACHED");
        if (doc.expirationTimestamp != 0 && block.timestamp >= doc.expirationTimestamp)
                                            return (false, "EXPIRED");

        return (true, "OK");
    }

    /**
     * @notice Returns all CIDs registered by a specific owner.
     * @param owner  The wallet address to query.
     */
    function getOwnerDocuments(address owner) external view returns (string[] memory) {
        return _ownerDocuments[owner];
    }
}
