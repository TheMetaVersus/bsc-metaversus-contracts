// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

interface ITokenMintERC721 {
    function getTokenCounter() external view returns (uint256 tokenId);

    function mint(address receiver, string memory uri) external;
}
