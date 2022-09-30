// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

import "./ITokenMintERC721.sol";
import "./ITokenMintERC1155.sol";
import "./IMarketplaceManager.sol";
import "./IStakingPool.sol";
import "./IOrder.sol";

interface IAdmin {
    function isAdmin(address _account) external view returns (bool);

    function isPaused() external view returns (bool);

    function owner() external view returns (address);

    function isTokenMintERC721(ITokenMintERC721 _tokenMintERC721) external view returns (bool);

    function isTokenMintERC1155(ITokenMintERC1155 _tokenMintERC1155) external view returns (bool);

    function isMarketplaceManager(IMarketplaceManager _marketplaceManager) external view returns (bool);

    function isStakingPool(IStakingPool _stakingPool) external view returns (bool);

    function isOrder(IOrder _order) external view returns (bool);
}
