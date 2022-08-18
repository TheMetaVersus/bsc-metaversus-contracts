// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

interface IMarketplaceManager {
    function callAfterMint(
        address _nftAddress,
        uint256 _tokenId,
        uint256 _amount,
        uint256 _grossSaleValue,
        address _seller,
        uint256 _startTime,
        uint256 _endTime
    ) external;

    function wasBuyer(address account) external view returns (bool);
}
