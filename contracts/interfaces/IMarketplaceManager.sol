// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

interface IMarketplaceManager {
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
        bool isPrivate;
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

    function wasBuyer(address account) external view returns (bool);

    // order

    function getOrderIdToOrderInfo(uint256 orderId) external view returns (Order memory);

    function setOrderIdToOrderInfo(uint256 orderId, Order memory value) external;

    function removeOrderIdToOrderInfo(uint256 orderId) external;

    // Market Item

    function getMarketItemIdToMarketItem(uint256 marketItemId) external view returns (MarketItem memory);

    function setMarketItemIdToMarketItem(uint256 marketItemId, MarketItem memory value) external;

    // Payment token

    function setPermitedPaymentToken(address _paymentToken, bool allow) external;

    function isPermitedPaymentToken(address token) external view returns (bool);

    // AssetOfOwner
    function getOrderIdFromAssetOfOwner(address owner, uint256 index) external view returns (uint256);

    function removeOrderIdFromAssetOfOwner(address owner, uint256 orderId) external;

    function getLengthOrderIdFromAssetOfOwner(address owner) external view returns (uint256);

    // OrderOfOwner
    function getOrderOfOwner(address owner, uint256 index) external view returns (uint256);

    function removeOrderOfOwner(address owner, uint256 orderId) external;

    function getLengthOrderOfOwner(address owner) external view returns (uint256);

    // MarketItemOfOwner
    function removeMarketItemOfOwner(address owner, uint256 marketItemId) external;

    function externalMakeOffer(
        address paymentToken,
        uint256 bidPrice,
        uint256 time,
        uint256 amount,
        uint256 marketItemId,
        WalletAsset memory walletAsset
    ) external;

    function extCreateMarketInfo(
        address nftAddress,
        uint256 tokenId,
        uint256 amount,
        uint256 price,
        address seller,
        uint256 startTime,
        uint256 endTime,
        address paymentToken
    ) external;

    function getListingFee(uint256 amount) external view returns (uint256);

    function deduceRoyalties(
        address nftContractAddress,
        uint256 tokenId,
        uint256 grossSaleValue,
        address paymentToken
    ) external returns (uint256);

    function extTransferCall(
        address paymentToken,
        uint256 amount,
        address from,
        address to
    ) external;

    function extTransferNFTCall(
        address nftContractAddress,
        uint256 tokenId,
        uint256 amount,
        address from,
        address to
    ) external;

    function checkNftStandard(address contractAddr) external returns (NftStandard);

    function getCurrentMarketItem() external view returns (uint256);

    function getCurrentOrder() external view returns (uint256);
}
