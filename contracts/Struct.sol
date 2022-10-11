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
    NFTHelper.Type nftType;                         // Type of this NFT
    address seller;                                 // The person who sell this NFT
    address buyer;                                  // The person who offer to this NFT
    MarketItemStatus status;                        // Status of this NFT at Marketplace
    uint256 startTime;                              // Time when the NFT push to Marketplace
    uint256 endTime;                                // Time when the NFT expire at Marketplace
    IERC20Upgradeable paymentToken;                 // Token to transfer
}

//  prettier-ignore
struct WalletOrder {
    address to;                                     // Seller
    address nftAddress;                             // NFT Contract Address of this asset
    uint256 tokenId;                                // Token Id of NFT contract
    uint256 orderId;                                // id order
}

//  prettier-ignore
struct MarketItemOrder {
    uint256 marketItemId;                           // Id of MarketItem
    uint256 orderId;                                // id order
}

//  prettier-ignore
struct OrderInfo {
    uint256 id;                                     // id order
    uint256 amount;                                 // Amount to transfer
    uint256 bidPrice;                               // Bid price
    uint256 expiredTime;                            // Expired time
    address owner;                                  // owner address
    IERC20Upgradeable paymentToken;                 // Token to transfer
    OrderStatus status;                             // Status of order
    bool isWallet;                                  // Check wallet
}
