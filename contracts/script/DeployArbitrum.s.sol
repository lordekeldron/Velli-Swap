// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {StealthSignerRotationModule} from "../src/StealthSignerRotationModule.sol";
import {PoIRegistry} from "../src/PoIVerifier.sol";
import {InfinityPrivacyHook} from "../src/InfinityPrivacyHook.sol";

/// @title DeployArbitrum
/// @notice Foundry deployment script for Arbitrum Sepolia (421614) and Anvil (31337).
contract DeployArbitrum {
    function run(
        address governance,
        address verifier,
        address infinityVault,
        address erc5564Announcer,
        bytes32 initialAssociationRoot
    ) external returns (
        StealthSignerRotationModule rotationModule,
        PoIRegistry poiRegistry,
        InfinityPrivacyHook privacyHook
    ) {
        rotationModule = new StealthSignerRotationModule();
        poiRegistry = new PoIRegistry(governance, verifier, initialAssociationRoot);
        privacyHook = new InfinityPrivacyHook(infinityVault, address(poiRegistry), erc5564Announcer);
    }
}
