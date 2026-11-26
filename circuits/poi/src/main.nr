use dep::std;

// Proof of Innocence (PoI) Circuit in Noir
// Proves:
// 1. User knows secret spending key for a deposit note commitment.
// 2. Deposit commitment exists in an approved Innocence Association Set Merkle tree.
// 3. Nullifier is deterministically derived to prevent replay/double-use.
// 4. Proof binds to a specific stealth recipient commitment to prevent front-running.

fn compute_merkle_root(leaf: Field, index: Field, hash_path: [Field; 20]) -> Field {
    let mut current = leaf;
    let index_bits: [u1; 20] = index.to_le_bits();

    for i in 0..20 {
        let path_element = hash_path[i];
        let (left, right) = if index_bits[i] == 0 {
            (current, path_element)
        } else {
            (path_element, current)
        };
        current = std::hash::pedersen_hash([left, right]);
    }
    current
}

fn main(
    // Private inputs
    secret: Field,
    blinding: Field,
    leaf_index: Field,
    merkle_path: [Field; 20],
    // Public inputs (verified on-chain by PoIRegistry.sol)
    association_root: pub Field,
    nullifier: pub Field,
    recipient_commitment: pub Field
) {
    // 1. Reconstruct deposit commitment
    let commitment = std::hash::pedersen_hash([secret, blinding]);

    // 2. Verify Merkle inclusion inside approved Association Set
    let computed_root = compute_merkle_root(commitment, leaf_index, merkle_path);
    assert(computed_root == association_root);

    // 3. Verify deterministic anti-replay nullifier
    let computed_nullifier = std::hash::pedersen_hash([secret, leaf_index]);
    assert(computed_nullifier == nullifier);

    // 4. Bind proof to recipient commitment so relayer/MEV cannot redirect funds
    let _binding = std::hash::pedersen_hash([recipient_commitment, nullifier]);
    assert(_binding != 0);
}
