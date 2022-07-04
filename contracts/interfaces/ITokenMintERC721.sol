// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

interface ITokenMintERC721 {
    function mint(
        address seller,
        address receiver,
        string memory uri
    ) external;
}
