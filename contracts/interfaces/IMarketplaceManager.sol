// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

interface IMarketplaceManager {
    function createMarketInfo(
        address _nftAddress,
        uint256 _tokenId,
        uint256 _amount,
        uint256 _grossSaleValue,
        address _seller
    ) external;
}
