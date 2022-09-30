// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

import "../Struct.sol";

interface IMarketplaceManager {
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
    ) external payable;

    function extCreateMarketInfo(
        address _nftAddress,
        uint256 _tokenId,
        uint256 _amount,
        uint256 _price,
        address _seller,
        uint256 _startTime,
        uint256 _endTime,
        address _paymentToken,
        bytes calldata rootHash
    ) external;

    function getListingFee(uint256 amount) external view returns (uint256);

    function deduceRoyalties(
        address nftContractAddress,
        uint256 tokenId,
        uint256 grossSaleValue,
        address paymentToken
    ) external payable returns (uint256);

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
