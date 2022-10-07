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

enum OrderStatus {
    PENDING,
    ACCEPTED,
    CANCELED
}

//  prettier-ignore
struct MarketItem {
    address nftContractAddress;                     // NFT Contract Address
    uint256 tokenId;                                // Token Id of NFT contract
    uint256 amount;                                 // Amount if token is ERC1155
    uint256 price;                                  // Price of this token
    NFTHelper.Type nftType;                                // Type of this NFT
    address seller;                                 // The person who sell this NFT
    address buyer;                                  // The person who offer to this NFT
    MarketItemStatus status;                        // Status of this NFT at Marketplace
    uint256 startTime;                              // Time when the NFT push to Marketplace
    uint256 endTime;                                // Time when the NFT expire at Marketplace
    IERC20Upgradeable paymentToken;                 // Token to transfer
    bool isPrivate;                                 // Access status
}

//  prettier-ignore
struct WalletOrder {
    address owner;                                  // The person who want to buy the Item at this Order
    address to;                                     // Seller
    address nftAddress;                             // NFT Contract Address of this asset
    uint256 tokenId;                                // Token Id of NFT contract
    uint256 amount;                                 // Amount to transfer
    IERC20Upgradeable paymentToken;                 // Token to transfer
    uint256 bidPrice;                               // Bid price
    uint256 expiredTime;                            // Expired time
    OrderStatus status;                             // Order status
}

//  prettier-ignore
struct MarketItemOrder {
    address owner;                                  // The person who want to buy the Item at this Order
    uint256 marketItemId;                           // Id of MarketItem
    IERC20Upgradeable paymentToken;                 // Token to transfer
    uint256 bidPrice;                               // Bid price
    uint256 expiredTime;                            // Expired time
    OrderStatus status;                             // Order status
}
