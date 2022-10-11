// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";

import "../lib/NFTHelper.sol";

library OrderHelper {
    using SafeERC20Upgradeable for IERC20Upgradeable;

    enum OrderStatus {
        PENDING,
        ACCEPTED,
        CANCELED
    }
    //  prettier-ignore
    struct WalletOrder {
        address owner;                                  // The person who want to buy the Item at this Order
        address to;                                     // Seller
        address nftAddress;                             // NFT Contract Address of this asset
        uint256 tokenId;                                // Token Id of NFT contract
    }

    //  prettier-ignore
    struct MarketItemOrder {
        address owner;                                  // The person who want to buy the Item at this Order
        uint256 marketItemId;                           // Id of MarketItem
    }

    //  prettier-ignore
    struct OrderInfo {
        uint256 id;                                     // id order
        address owner;                                  // owner address
        uint256 amount;                                 // Amount to transfer
        IERC20Upgradeable paymentToken;                 // Token to transfer
        uint256 bidPrice;                               // Bid price
        uint256 expiredTime;                            // Expired time
        OrderStatus status;                             // Status of order
    }
    struct DBOrderMap {
        /**
         *  @notice Mapping from MarketItemId to to Order
         *  @dev OrderID -> Order
         */
        mapping(uint256 => WalletOrder) walletOrders;
        /**
         *  @notice Mapping from WalletId to OrderId
         */
        mapping(uint256 => uint256) walletIdToOrderId;
        /**
         *  @notice Mapping from MarketItemId to to Order
         *  @dev OrderID -> MarketItemOrder
         */
        mapping(uint256 => MarketItemOrder) marketItemOrders;
        /**
         *  @notice MarketItemId -> OrderId
         */
        mapping(uint256 => uint256) marketItemIdToOrderId;
        /**
         *  @notice OrderId -> OrderInfo
         */
        mapping(uint256 => OrderInfo) orders;
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

    function makeWalletOrder(
        uint256 walletOrderId,
        uint256 orderId,
        OrderHelper.DBOrderMap storage data,
        OrderInfo memory order,
        WalletOrder memory walletOrder
    ) internal {
        data.walletOrderOfOwners[walletOrder.nftAddress][walletOrder.tokenId][walletOrder.to][
            walletOrder.owner
        ] = walletOrderId;
        data.walletOrders[walletOrderId] = walletOrder;
        data.walletIdToOrderId[walletOrderId] = orderId;
        data.orders[orderId] = order;
    }

    function makeMarketItemOrder(
        uint256 marketItemOrderId,
        uint256 orderId,
        OrderHelper.DBOrderMap storage data,
        OrderInfo memory order,
        MarketItemOrder memory marketItemOrder
    ) internal {
        data.marketItemOrderOfOwners[marketItemOrder.marketItemId][marketItemOrder.owner] = marketItemOrderId;
        data.marketItemOrders[marketItemOrderId] = marketItemOrder;
        data.marketItemIdToOrderId[marketItemOrderId] = orderId;
        data.orders[orderId] = order;
    }

    // function acceptWalletOffer()

    function _updateOrder(
        OrderHelper.OrderInfo storage existOrder,
        uint256 _bidPrice,
        uint256 _amount,
        uint256 _time,
        address _bidder,
        address _contract
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
                _transferToken(existOrder.paymentToken, excessAmount, _bidder, _contract);
            } else {
                _transferToken(existOrder.paymentToken, excessAmount, _contract, _bidder);
            }
        }

        // Emit Event
        emit UpdateOrder(_bidder, existOrder.id, existOrder.amount, existOrder.bidPrice, existOrder.expiredTime);
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
            (address royaltiesReceiver, uint256 royaltiesAmount) = getRoyaltyInfo(
                nftContractAddress,
                tokenId,
                grossSaleValue
            );

            // Deduce royalties from sale value
            uint256 netSaleValue = grossSaleValue - royaltiesAmount;
            // Transfer royalties to rightholder if not zero
            if (royaltiesAmount > 0) {
                _transferToken(paymentToken, royaltiesAmount, address(this), royaltiesReceiver);
                // Broadcast royalties payment
                emit RoyaltiesPaid(tokenId, royaltiesAmount);
            }

            return netSaleValue;
        }
        return grossSaleValue;
    }

    function getRoyaltyInfo(
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

    /**
     *  @notice Transfer token
     */
    function _transferToken(
        IERC20Upgradeable _paymentToken,
        uint256 _amount,
        address _from,
        address _to
    ) internal {
        if (_to == address(this)) {
            if (address(_paymentToken) == address(0)) {
                require(msg.value == _amount, "Failed to send into contract");
            } else {
                IERC20Upgradeable(_paymentToken).safeTransferFrom(_from, _to, _amount);
            }
        } else {
            if (address(_paymentToken) == address(0)) {
                transferNativeToken(_to, _amount);
            } else {
                IERC20Upgradeable(_paymentToken).safeTransfer(_to, _amount);
            }
        }
    }

    /**
     *  @notice Transfer native token
     */
    function transferNativeToken(address _to, uint256 _amount) internal {
        // solhint-disable-next-line indent
        (bool success, ) = _to.call{ value: _amount }("");
        require(success, "SafeTransferNative: transfer failed");
    }

    /**
     *  @notice Check payment token or native token
     */
    function isNativeToken(IERC20Upgradeable _paymentToken) internal pure returns (bool) {
        return address(_paymentToken) == address(0);
    }
}
