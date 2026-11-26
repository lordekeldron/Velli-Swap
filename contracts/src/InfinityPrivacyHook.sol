// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {PoIRegistry} from "./PoIVerifier.sol";

/// @title IERC5564Announcer
/// @notice Minimal EIP-5564 stealth address announcement interface.
interface IERC5564Announcer {
    function announce(
        uint256 schemeId,
        address stealthAddress,
        bytes calldata ephemeralPubKey,
        bytes calldata metadata
    ) external;
}

/// @title InfinityPrivacyHook
/// @notice PancakeSwap Infinity-compatible pool hook that enforces Proof of Innocence (PoI)
///         for privacy-routed swaps and optionally emits EIP-5564 stealth settlement announcements.
contract InfinityPrivacyHook {
    error MissingInnocenceProof();
    error InvalidHookCaller();

    address public immutable vault;
    PoIRegistry public immutable poiRegistry;
    IERC5564Announcer public immutable announcer;

    uint256 public constant SECP256K1_SCHEME_ID = 1;

    event PrivacySwapSettled(
        address indexed pool,
        address indexed stealthRecipient,
        bytes32 indexed associationRoot,
        uint256 amountOut
    );

    constructor(address _vault, address _poiRegistry, address _announcer) {
        vault = _vault;
        poiRegistry = PoIRegistry(_poiRegistry);
        announcer = IERC5564Announcer(_announcer);
    }

    struct PrivacyHookData {
        bytes zkProof;
        bytes32 associationRoot;
        bytes32 nullifier;
        address stealthRecipient;
        bytes ephemeralPubKey;
        bytes stealthMetadata;
    }

    /// @notice Called before swap execution by Infinity Vault to validate PoI membership.
    function beforeSwap(address sender, bytes calldata hookData) external returns (bytes4) {
        if (msg.sender != vault) revert InvalidHookCaller();
        if (hookData.length == 0) revert MissingInnocenceProof();

        PrivacyHookData memory decoded = abi.decode(hookData, (PrivacyHookData));
        bytes32 commitment = keccak256(abi.encodePacked(sender, decoded.stealthRecipient));

        poiRegistry.verifyInnocence(
            decoded.zkProof,
            decoded.associationRoot,
            decoded.nullifier,
            commitment
        );

        return this.beforeSwap.selector;
    }

    /// @notice Called after swap settlement to broadcast EIP-5564 announcement for stealth scanning.
    function afterSwap(
        address pool,
        uint256 amountOut,
        bytes calldata hookData
    ) external returns (bytes4) {
        if (msg.sender != vault) revert InvalidHookCaller();

        PrivacyHookData memory decoded = abi.decode(hookData, (PrivacyHookData));

        if (decoded.stealthRecipient != address(0) && decoded.ephemeralPubKey.length > 0) {
            announcer.announce(
                SECP256K1_SCHEME_ID,
                decoded.stealthRecipient,
                decoded.ephemeralPubKey,
                decoded.stealthMetadata
            );
        }

        emit PrivacySwapSettled(pool, decoded.stealthRecipient, decoded.associationRoot, amountOut);
        return this.afterSwap.selector;
    }
}
