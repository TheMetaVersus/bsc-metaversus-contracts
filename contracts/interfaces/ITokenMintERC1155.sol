// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

interface ITokenMintERC1155 {
    function mint(
        address seller,
        address receiver,
        uint256 amount,
        string memory uri
    ) external;
}
