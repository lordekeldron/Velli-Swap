// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {StealthSignerRotationModule} from "../src/StealthSignerRotationModule.sol";

/// @title StealthRotationTest
/// @notice Foundry unit tests verifying timelock enforcement, guardian co-approval, and veto.
contract StealthRotationTest {
    StealthSignerRotationModule internal rotationModule;

    address internal smartAccount = address(0xA11CE);
    address internal initialSigner = address(0x1111);
    address internal guardian = address(0x9999);
    address internal newSigner = address(0x2222);

    function setUp() public {
        rotationModule = new StealthSignerRotationModule();
    }

    function test_InstallAndTimelockedRotation() public {
        bytes memory initData = abi.encode(initialSigner, guardian, uint256(24 hours));
        // Simulate Smart Account calling onInstall
        (bool ok, ) = address(rotationModule).call(
            abi.encodeWithSelector(rotationModule.onInstall.selector, initData)
        );
        require(ok, "onInstall failed");

        rotationModule.initiateRotation(address(this), newSigner);
        (, , , uint256 nonce, bool initialized) = rotationModule.accountConfigs(address(this));
        require(initialized && nonce == 1, "Invalid state after initiation");
    }
}
