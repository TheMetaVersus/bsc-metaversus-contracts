// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

interface ITokenMintERC1155 {
    function getTokenCounter() external view returns (uint256 tokenId);

    function mint(
        address seller,
        address receiver,
        uint256 amount,
        string memory uri
    ) external;
}
