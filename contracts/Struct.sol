// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

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
struct MarketItem {
    uint256 marketItemId;
    address nftContractAddress;
    uint256 tokenId;
    uint256 amount;
    uint256 price;
    uint256 nftType;
    address seller;
    address buyer;
    MarketItemStatus status;
    uint256 startTime;
    uint256 endTime;
    address paymentToken;
}
struct WalletAsset {
    address owner;
    address nftAddress;
    uint256 tokenId;
}

struct Order {
    uint256 orderId;
    address bidder;
    address paymentToken;
    uint256 bidPrice;
    uint256 marketItemId;
    WalletAsset walletAsset;
    uint256 amount;
    uint256 expiredOrder;
}
