// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @title IPoIVerifier
/// @notice Interface for Noir-generated UltraHonk/Groth16 Proof of Innocence verifier.
interface IPoIVerifier {
    function verify(bytes calldata proof, bytes32[] calldata publicInputs) external view returns (bool);
}

/// @title PoIRegistry
/// @notice Maintains Merkle roots for approved Association Sets (Proof of Innocence) and nullifiers.
contract PoIRegistry {
    error InvalidRoot();
    error NullifierAlreadyUsed();
    error InvalidProof();
    error Unauthorized();

    address public governance;
    IPoIVerifier public immutable verifier;

    mapping(bytes32 => bool) public validAssociationRoots;
    mapping(bytes32 => bool) public usedNullifiers;

    event AssociationRootUpdated(bytes32 indexed root, bool active);
    event ProofOfInnocenceVerified(bytes32 indexed associationRoot, bytes32 indexed nullifier, address indexed account);

    constructor(address _governance, address _verifier, bytes32 _initialRoot) {
        governance = _governance;
        verifier = IPoIVerifier(_verifier);
        validAssociationRoots[_initialRoot] = true;
        emit AssociationRootUpdated(_initialRoot, true);
    }

    function setAssociationRoot(bytes32 root, bool active) external {
        if (msg.sender != governance) revert Unauthorized();
        validAssociationRoots[root] = active;
        emit AssociationRootUpdated(root, active);
    }

    /// @notice Verifies a Noir ZK proof that the caller belongs to an approved Association Set
    ///         without revealing the underlying source UTXO/address.
    /// @param proof Raw Noir proof bytes
    /// @param associationRoot Public input[0]: active association Merkle root
    /// @param nullifier Public input[1]: anti-replay nullifier
    /// @param recipientCommitment Public input[2]: stealth address / smart account binding
    function verifyInnocence(
        bytes calldata proof,
        bytes32 associationRoot,
        bytes32 nullifier,
        bytes32 recipientCommitment
    ) external returns (bool) {
        if (!validAssociationRoots[associationRoot]) revert InvalidRoot();
        if (usedNullifiers[nullifier]) revert NullifierAlreadyUsed();

        bytes32[] memory publicInputs = new bytes32[](3);
        publicInputs[0] = associationRoot;
        publicInputs[1] = nullifier;
        publicInputs[2] = recipientCommitment;

        if (!verifier.verify(proof, publicInputs)) revert InvalidProof();

        usedNullifiers[nullifier] = true;
        emit ProofOfInnocenceVerified(associationRoot, nullifier, msg.sender);
        return true;
    }
}
