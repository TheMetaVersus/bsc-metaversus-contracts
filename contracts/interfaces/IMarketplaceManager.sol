// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

interface IMarketplaceManager {
    function callAfterMint(
        address nftAddress,
        uint256 tokenId,
        uint256 amount,
        uint256 price,
        address seller,
        uint256 startTime,
        uint256 endTime,
        address paymentToken
    ) external;

    function wasBuyer(address account) external view returns (bool);
}
