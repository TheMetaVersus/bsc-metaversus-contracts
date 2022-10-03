// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";

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
    IERC20Upgradeable paymentToken;
}
struct WalletAsset {
    address owner;
    address nftAddress;
    uint256 tokenId;
}

struct Order {
    uint256 orderId;
    address bidder;
    IERC20Upgradeable paymentToken;
    uint256 bidPrice;
    uint256 marketItemId;
    WalletAsset walletAsset;
    uint256 amount;
    uint256 expiredOrder;
}
