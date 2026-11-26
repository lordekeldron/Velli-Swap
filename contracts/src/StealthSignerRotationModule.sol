// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @title StealthSignerRotationModule
/// @notice ERC-7579 compliant Smart Account module enabling signer key rotation with
///         mandatory timelock, guardian co-approval/veto, and anti-replay nonces.
contract StealthSignerRotationModule {
    error AlreadyInitialized();
    error NotInitialized();
    error InvalidSigner();
    error InvalidGuardian();
    error TimelockNotElapsed(uint256 executableAt);
    error NoPendingRotation();
    error UnauthorizedCaller();
    error InvalidDelay();

    uint256 public constant MIN_TIMELOCK_DELAY = 1 hours;
    uint256 public constant MAX_TIMELOCK_DELAY = 30 days;

    struct AccountConfig {
        address activeSigner;
        address guardian;
        uint256 timelockDelay;
        uint256 nonce;
        bool initialized;
    }

    struct PendingRotation {
        address proposedSigner;
        uint256 executableAt;
        bool guardianApproved;
        bool exists;
    }

    mapping(address => AccountConfig) public accountConfigs;
    mapping(address => PendingRotation) public pendingRotations;

    event ModuleInstalled(address indexed account, address indexed initialSigner, address indexed guardian, uint256 delay);
    event RotationInitiated(address indexed account, address indexed proposedSigner, uint256 executableAt, uint256 nonce);
    event GuardianApproved(address indexed account, address indexed guardian, address indexed proposedSigner);
    event RotationCancelled(address indexed account, address indexed cancelledBy);
    event SignerRotated(address indexed account, address indexed oldSigner, address indexed newSigner, uint256 nonce);

    /// @notice ERC-7579 onInstall hook called by the Smart Account (Safe / Kernel v3).
    function onInstall(bytes calldata data) external {
        if (accountConfigs[msg.sender].initialized) revert AlreadyInitialized();

        (address initialSigner, address guardian, uint256 delay) = abi.decode(data, (address, address, uint256));
        if (initialSigner == address(0)) revert InvalidSigner();
        if (guardian == address(0) || guardian == initialSigner) revert InvalidGuardian();
        if (delay < MIN_TIMELOCK_DELAY || delay > MAX_TIMELOCK_DELAY) revert InvalidDelay();

        accountConfigs[msg.sender] = AccountConfig({
            activeSigner: initialSigner,
            guardian: guardian,
            timelockDelay: delay,
            nonce: 0,
            initialized: true
        });

        emit ModuleInstalled(msg.sender, initialSigner, guardian, delay);
    }

    /// @notice Initiates a timelocked signer rotation. Can be triggered by the Smart Account itself
    ///         or its designated guardian in case of key compromise.
    function initiateRotation(address account, address newSigner) external {
        AccountConfig storage cfg = accountConfigs[account];
        if (!cfg.initialized) revert NotInitialized();
        if (msg.sender != account && msg.sender != cfg.guardian) revert UnauthorizedCaller();
        if (newSigner == address(0) || newSigner == cfg.activeSigner || newSigner == cfg.guardian) {
            revert InvalidSigner();
        }

        uint256 executableAt = block.timestamp + cfg.timelockDelay;
        cfg.nonce += 1;

        pendingRotations[account] = PendingRotation({
            proposedSigner: newSigner,
            executableAt: executableAt,
            guardianApproved: msg.sender == cfg.guardian,
            exists: true
        });

        emit RotationInitiated(account, newSigner, executableAt, cfg.nonce);
    }

    /// @notice Guardian co-approves an ongoing rotation (required before execution).
    function approveRotationAsGuardian(address account) external {
        AccountConfig storage cfg = accountConfigs[account];
        if (!cfg.initialized) revert NotInitialized();
        if (msg.sender != cfg.guardian) revert UnauthorizedCaller();

        PendingRotation storage pending = pendingRotations[account];
        if (!pending.exists) revert NoPendingRotation();

        pending.guardianApproved = true;
        emit GuardianApproved(account, msg.sender, pending.proposedSigner);
    }

    /// @notice Guardian or Smart Account can veto/cancel a suspicious rotation during the timelock window.
    function cancelRotation(address account) external {
        AccountConfig storage cfg = accountConfigs[account];
        if (!cfg.initialized) revert NotInitialized();
        if (msg.sender != account && msg.sender != cfg.guardian) revert UnauthorizedCaller();
        if (!pendingRotations[account].exists) revert NoPendingRotation();

        delete pendingRotations[account];
        emit RotationCancelled(account, msg.sender);
    }

    /// @notice Finalizes the signer rotation once the timelock has elapsed and guardian approved.
    function executeRotation(address account) external {
        AccountConfig storage cfg = accountConfigs[account];
        if (!cfg.initialized) revert NotInitialized();

        PendingRotation memory pending = pendingRotations[account];
        if (!pending.exists) revert NoPendingRotation();
        if (block.timestamp < pending.executableAt) revert TimelockNotElapsed(pending.executableAt);
        if (!pending.guardianApproved) revert UnauthorizedCaller();

        address oldSigner = cfg.activeSigner;
        cfg.activeSigner = pending.proposedSigner;
        delete pendingRotations[account];

        emit SignerRotated(account, oldSigner, cfg.activeSigner, cfg.nonce);
    }
}
