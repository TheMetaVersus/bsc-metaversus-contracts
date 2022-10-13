// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

import "../lib/NFTHelper.sol";
import "../lib/TransferHelper.sol";

library OrderHelper {
    enum OrderStatus {
        PENDING,
        ACCEPTED,
        CANCELED
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
    struct DBOrderMap {
        /**
         *  @notice Mapping from MarketItemId to to Order
         *  @dev OrderID -> Order
         */
        mapping(uint256 => WalletOrder) walletOrders;
        /**
         *  @notice Mapping from MarketItemId to to Order
         *  @dev OrderID -> MarketItemOrder
         */
        mapping(uint256 => MarketItemOrder) marketItemOrders;
        /**
         *  @notice OrderId -> OrderInfo
         */
        mapping(uint256 => OrderInfo) orders;
        /**
         *  @notice OrderId -> WalletOrderId or MarketItemId
         */
        mapping(uint256 => uint256) orderIdToItemId;
        /**
         *  @notice Mapping from NFT address => token ID => To => Owner ==> OrderId
         */
        mapping(address => mapping(uint256 => mapping(address => mapping(address => uint256)))) walletOrderOfOwners;
        /**
         *  @notice Mapping from marketItemId => Owner ==> OrderId
         */
        mapping(uint256 => mapping(address => uint256)) marketItemOrderOfOwners;
    }

    event UpdateOrder(address owner, uint256 orderId, uint256 amount, uint256 bidPrice, uint256 expiredTime);
    event RoyaltiesPaid(uint256 indexed tokenId, uint256 indexed value);
    event CanceledOrder(uint256 indexed orderId);

    function _makeWalletOrder(
        uint256 walletOrderId,
        uint256 orderId,
        OrderHelper.DBOrderMap storage data,
        OrderInfo memory order,
        WalletOrder memory walletOrder
    ) internal {
        data.orders[orderId] = order;
        data.orderIdToItemId[orderId] = walletOrderId;

        data.walletOrderOfOwners[walletOrder.nftAddress][walletOrder.tokenId][walletOrder.to][order.owner] = orderId;
        data.walletOrders[walletOrderId] = walletOrder;
    }

    function _makeMarketItemOrder(
        uint256 marketItemOrderId,
        uint256 orderId,
        OrderHelper.DBOrderMap storage data,
        OrderInfo memory order,
        MarketItemOrder memory marketItemOrder
    ) internal {
        data.orders[orderId] = order;
        data.orderIdToItemId[orderId] = marketItemOrderId;

        data.marketItemOrderOfOwners[marketItemOrder.marketItemId][order.owner] = orderId;
        data.marketItemOrders[marketItemOrderId] = marketItemOrder;
    }

    function _cancelOffer(
        OrderHelper.DBOrderMap storage data,
        uint256 orderId,
        address caller
    ) internal {
        OrderInfo storage orderInfo = data.orders[orderId];

        ErrorHelper._checkOwner(orderInfo.owner, caller);
        ErrorHelper._checkAvailableOrder(uint256(orderInfo.status), uint256(OrderStatus.PENDING));
        // Update order information
        orderInfo.status = OrderStatus.CANCELED;

        // Payback token to owner
        TransferHelper._transferToken(orderInfo.paymentToken, orderInfo.bidPrice, address(this), orderInfo.owner);

        emit CanceledOrder(orderId);
    }

    function _updateOrder(
        OrderHelper.OrderInfo storage existOrder,
        uint256 _bidPrice,
        uint256 _amount,
        uint256 _time
    ) internal {
        bool isExcess = _bidPrice < existOrder.bidPrice;
        uint256 excessAmount = isExcess ? existOrder.bidPrice - _bidPrice : _bidPrice - existOrder.bidPrice;

        // Update
        existOrder.bidPrice = _bidPrice;
        existOrder.amount = _amount;
        existOrder.expiredTime = _time;

        // Transfer
        if (excessAmount > 0) {
            if (!isExcess) {
                TransferHelper._transferToken(existOrder.paymentToken, excessAmount, existOrder.owner, address(this));
            } else {
                TransferHelper._transferToken(existOrder.paymentToken, excessAmount, address(this), existOrder.owner);
            }
        }

        // Emit Event
        emit UpdateOrder(
            existOrder.owner,
            existOrder.id,
            existOrder.amount,
            existOrder.bidPrice,
            existOrder.expiredTime
        );
    }

    /**
     *  @notice Transfers royalties to the rightsowner if applicable and return the remaining amount
     *  @param nftContractAddress  address contract of nft
     *  @param tokenId  token id of nft
     *  @param grossSaleValue  price of nft that is listed
     *  @param paymentToken  token for payment
     */
    function _deduceRoyalties(
        address nftContractAddress,
        uint256 tokenId,
        uint256 grossSaleValue,
        IERC20Upgradeable paymentToken
    ) internal returns (uint256 netSaleAmount) {
        // Get amount of royalties to pays and recipient
        if (NFTHelper.isRoyalty(nftContractAddress)) {
            (address royaltiesReceiver, uint256 royaltiesAmount) = _getRoyaltyInfo(
                nftContractAddress,
                tokenId,
                grossSaleValue
            );

            // Deduce royalties from sale value
            uint256 netSaleValue = grossSaleValue - royaltiesAmount;
            // Transfer royalties to rightholder if not zero
            if (royaltiesAmount > 0) {
                TransferHelper._transferToken(paymentToken, royaltiesAmount, address(this), royaltiesReceiver);
                // Broadcast royalties payment
                emit RoyaltiesPaid(tokenId, royaltiesAmount);
            }

            return netSaleValue;
        }
        return grossSaleValue;
    }

    function _getRoyaltyInfo(
        address _nftAddr,
        uint256 _tokenId,
        uint256 _salePrice
    ) internal view returns (address, uint256) {
        (address royaltiesReceiver, uint256 royaltiesAmount) = IERC2981Upgradeable(_nftAddr).royaltyInfo(
            _tokenId,
            _salePrice
        );
        return (royaltiesReceiver, royaltiesAmount);
    }
}
