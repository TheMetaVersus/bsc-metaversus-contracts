// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";

import "../lib/NFTHelper.sol";
import "../interfaces/IAdmin.sol";
import "../interfaces/ITokenMintERC721.sol";
import "../interfaces/ITokenMintERC1155.sol";
import "../interfaces/ITreasury.sol";
import "../interfaces/IMarketplaceManager.sol";
import "../interfaces/Collection/ICollectionFactory.sol";
import "../interfaces/IStakingPool.sol";
import "../interfaces/IOrder.sol";
import "../interfaces/IMetaCitizen.sol";
import "../interfaces/IMetaversusManager.sol";
import "../interfaces/Collection/ITokenERC721.sol";
import "../interfaces/Collection/ITokenERC1155.sol";

library ErrorHelper {
    error InsufficientBalance(uint256 _available, uint256 _required);
    error InValidOrderContract(address _contract);
    error InValidMetaversusManagerContract(address _contract);
    error InValidTokenCollectionERC721Contract(address _contract);
    error InValidTokenCollectionERC1155Contract(address _contract);
    error InValidAdminContract(address _contract);
    error InValidTokenMintERC721Contract(address _contract);
    error InValidTokenMintERC1155Contract(address _contract);
    error InValidTreasuryContract(address _contract);
    error InValidMarketplaceManagerContract(address _contract);
    error InValidCollectionFactoryContract(address _contract);
    error InValidStakingPoolContract(address _contract);
    error InValidMetaCitizenContract(address _contract);
}
