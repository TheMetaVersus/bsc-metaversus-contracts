// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

interface IMarketplaceManager {
    function updateCreateNFT(
        address _nftAddress,
        uint256 _tokenId,
        uint256 _amount,
        address _owner
    ) external;
}
