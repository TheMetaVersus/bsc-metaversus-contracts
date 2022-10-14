// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";

import "./lib/NFTHelper.sol";

enum NftStandard {
    ERC721,
    ERC1155,
    NONE
}
enum MarketItemStatus {
    LISTING,
    SOLD,
    CANCELED
}

//  prettier-ignore
struct MarketItem {
    address nftContractAddress;                     // NFT Contract Address
    uint256 tokenId;                                // Token Id of NFT contract
    uint256 amount;                                 // Amount if token is ERC1155
    uint256 price;                                  // Price of this token
    NFTHelper.Type nftType;                         // Type of this NFT
    address seller;                                 // The person who sell this NFT
    address buyer;                                  // The person who offer to this NFT
    MarketItemStatus status;                        // Status of this NFT at Marketplace
    uint256 startTime;                              // Time when the NFT push to Marketplace
    uint256 endTime;                                // Time when the NFT expire at Marketplace
    IERC20Upgradeable paymentToken;                 // Token to transfer
}
