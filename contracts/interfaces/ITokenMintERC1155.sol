// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

interface ITokenMintERC1155 {
     function mint(address receiver, uint256 amount) external;
}