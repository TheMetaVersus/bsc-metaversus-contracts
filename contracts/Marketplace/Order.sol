// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/introspection/ERC165Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC1155/IERC1155Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC721/IERC721Upgradeable.sol";
import "hardhat/console.sol";

import "../interfaces/IMarketplaceManager.sol";
import "../lib/NFTHelper.sol";
import "../Validatable.sol";

/**
 *  @title  Dev Order Contract
 *
 *  @author Metaversus Team
 *
 *  @notice This smart contract is the part of marketplace for exhange multiple non-fungiable token with standard ERC721 and ERC1155
 *          all action which user could sell, unsell, buy them.
 */
contract OrderManager is Validatable, ReentrancyGuardUpgradeable, ERC165Upgradeable, IOrder {
    using SafeERC20Upgradeable for IERC20Upgradeable;
    /**
     *  @notice marketplace store the address of the marketplaceManager contract
     */
    IMarketplaceManager public marketplace;

    event SoldAvailableItem(
        uint256 indexed marketItemId,
        address nftContract,
        uint256 tokenId,
        uint256 amount,
        address indexed seller,
        uint256 price,
        uint256 nftType,
        uint256 startTime,
        uint256 endTime,
        IERC20Upgradeable paymentToken
    );
    event CanceledSelling(
        uint256 indexed marketItemId,
        address nftContract,
        uint256 tokenId,
        uint256 amount,
        address indexed seller,
        uint256 price,
        uint256 nftType,
        uint256 startTime,
        uint256 endTime,
        IERC20Upgradeable paymentToken
    );
    event Bought(
        uint256 indexed marketItemId,
        address nftContract,
        uint256 tokenId,
        uint256 amount,
        address indexed seller,
        uint256 price,
        uint256 nftType,
        uint256 startTime,
        uint256 endTime,
        IERC20Upgradeable paymentToken
    );
    event RoyaltiesPaid(uint256 indexed tokenId, uint256 indexed value);
    event Claimed(uint256 indexed orderId);
    event AcceptedOffer(
        uint256 indexed orderId,
        address bidder,
        IERC20Upgradeable paymentToken,
        uint256 bidPrice,
        uint256 marketItemId,
        address owner,
        address nftAddress,
        uint256 tokenId,
        uint256 amount
    );
    event UpdatedOffer(uint256 indexed orderId);

    /**
     *  @notice Initialize new logic contract.
     */
    function initialize(IMarketplaceManager _marketplace, IAdmin _admin)
        public
        initializer
        validMarketplaceManager(_marketplace)
    {
        __Validatable_init(_admin);
        __ReentrancyGuard_init();
        __ERC165_init();

        marketplace = _marketplace;
    }

    /**
     * @dev make Offer with any NFT in wallet
     */
    function makeOfferWalletAsset(
        IERC20Upgradeable paymentToken,
        uint256 bidPrice,
        address owner,
        address nftAddress,
        uint256 tokenId,
        uint256 amount,
        uint256 time
    ) external payable nonReentrant {
        require(marketplace.isPermitedPaymentToken(paymentToken), "ERROR: payment token is not supported !");
        // check is Exist Offer
        for (uint256 i = 0; i < marketplace.getLengthOrderOfOwner(_msgSender()); i++) {
            Order memory order = marketplace.getOrderIdToOrderInfo(marketplace.getOrderOfOwner(_msgSender(), i));
            if (
                order.walletAsset.nftAddress == nftAddress &&
                order.walletAsset.tokenId == tokenId &&
                order.walletAsset.owner == owner &&
                order.bidder == _msgSender()
            ) {
                if (bidPrice > order.bidPrice) {
                    _internalTransferCall(order.paymentToken, bidPrice - order.bidPrice, _msgSender(), address(this));
                } else if (bidPrice < order.bidPrice) {
                    _internalTransferCall(order.paymentToken, order.bidPrice - bidPrice, address(this), _msgSender());
                }

                order.paymentToken = paymentToken;
                order.bidPrice = bidPrice;
                order.expiredOrder = time;
                order.amount = amount;
                marketplace.setOrderIdToOrderInfo(order.orderId, order);
                emit UpdatedOffer(order.orderId);
                return;
            }
        }
        // Create Order

        WalletAsset memory newWalletAsset = WalletAsset(owner, nftAddress, tokenId);

        marketplace.externalMakeOffer(paymentToken, bidPrice, time, amount, 0, newWalletAsset);
        _internalTransferCall(paymentToken, bidPrice, _msgSender(), address(this));
    }

    /**
     *  @notice make Offer Order any NFT in marketplace
     */
    function makeOffer(
        uint256 marketItemId,
        IERC20Upgradeable paymentToken,
        uint256 bidPrice,
        uint256 time
    ) external payable nonReentrant {
        require(marketplace.isPermitedPaymentToken(paymentToken), "ERROR: payment token is not supported !");
        // check is Exist Offer
        for (uint256 i = 0; i < marketplace.getLengthOrderOfOwner(_msgSender()); i++) {
            Order memory order = marketplace.getOrderIdToOrderInfo(marketplace.getOrderOfOwner(_msgSender(), i));
            if (order.marketItemId == marketItemId) {
                if (bidPrice > order.bidPrice) {
                    _internalTransferCall(order.paymentToken, bidPrice - order.bidPrice, _msgSender(), address(this));
                } else {
                    _internalTransferCall(order.paymentToken, order.bidPrice - bidPrice, address(this), _msgSender());
                }
                order.paymentToken = paymentToken;
                order.bidPrice = bidPrice;
                order.expiredOrder = time;
                marketplace.setOrderIdToOrderInfo(order.orderId, order);
                emit UpdatedOffer(order.orderId);
                return;
            }
        }
        // Create Order

        WalletAsset memory newWalletAsset;

        marketplace.externalMakeOffer(paymentToken, bidPrice, time, 0, marketItemId, newWalletAsset);
        _internalTransferCall(paymentToken, bidPrice, _msgSender(), address(this));
    }

    /**
     *  @notice Transfers royalties to the rightsowner if applicable and return the remaining amount
     *  @param nftContractAddress is address contract of nft
     *  @param tokenId is token id of nft
     *  @param grossSaleValue is price of nft that is listed
     *  @param paymentToken is token for payment
     */
    function _deduceRoyalties(
        address nftContractAddress,
        uint256 tokenId,
        uint256 grossSaleValue,
        IERC20Upgradeable paymentToken
    ) internal returns (uint256 netSaleAmount) {
        // Get amount of royalties to pays and recipient
        if (marketplace.isRoyalty(nftContractAddress)) {
            (address royaltiesReceiver, uint256 royaltiesAmount) = marketplace.getRoyaltyInfo(
                nftContractAddress,
                tokenId,
                grossSaleValue
            );

            // Deduce royalties from sale value
            uint256 netSaleValue = grossSaleValue - royaltiesAmount;
            // Transfer royalties to rightholder if not zero
            if (royaltiesAmount > 0) {
                _internalTransferCall(paymentToken, royaltiesAmount, address(this), royaltiesReceiver);
            }
            // Broadcast royalties payment
            emit RoyaltiesPaid(tokenId, royaltiesAmount);
            return netSaleValue;
        }
        return grossSaleValue;
    }

    /**
     *  @notice accept Offer
     */
    function acceptOffer(uint256 orderId) external payable nonReentrant {
        Order memory orderInfo = marketplace.getOrderIdToOrderInfo(orderId);
        MarketItem memory marketItem = marketplace.getMarketItemIdToMarketItem(orderInfo.marketItemId);
        require(orderInfo.expiredOrder >= block.timestamp, "ERROR: Overtime !");
        if (orderInfo.marketItemId == 0) {
            require(_msgSender() == orderInfo.walletAsset.owner, "ERROR: Invalid owner of asset !");
        } else {
            require(
                _msgSender() == marketItem.seller && marketItem.status == MarketItemStatus.LISTING,
                "ERROR: Invalid seller of asset !"
            );
        }

        // send nft to buyer
        if (orderInfo.marketItemId == 0) {
            _internalTransferNFTCall(
                orderInfo.walletAsset.nftAddress,
                orderInfo.walletAsset.tokenId,
                orderInfo.amount,
                _msgSender(),
                orderInfo.bidder
            );
        } else {
            // Update status of market item
            marketItem.status = MarketItemStatus.SOLD;
            marketItem.buyer = orderInfo.bidder;
            marketplace.setMarketItemIdToMarketItem(marketItem.marketItemId, marketItem);
            _internalTransferNFTCall(
                marketItem.nftContractAddress,
                marketItem.tokenId,
                marketItem.amount,
                address(marketplace),
                orderInfo.bidder
            );
        }

        // deduce royalty
        uint256 netSaleValue = (orderInfo.marketItemId == 0)
            ? _deduceRoyalties(
                orderInfo.walletAsset.nftAddress,
                orderInfo.walletAsset.tokenId,
                orderInfo.bidPrice,
                orderInfo.paymentToken
            )
            : _deduceRoyalties(
                marketItem.nftContractAddress,
                marketItem.tokenId,
                orderInfo.bidPrice,
                orderInfo.paymentToken
            );

        // receive token payment
        _internalTransferCall(
            orderInfo.paymentToken,
            netSaleValue,
            address(this),
            orderInfo.marketItemId == 0 ? orderInfo.walletAsset.owner : marketItem.seller
        );

        // remove data form storage
        marketplace.removeOrderOfOwner(orderInfo.bidder, orderInfo.orderId);

        marketplace.removeOrderIdFromAssetOfOwner(
            orderInfo.marketItemId == 0
                ? orderInfo.walletAsset.owner
                : marketplace.getMarketItemIdToMarketItem(orderInfo.marketItemId).seller,
            orderInfo.orderId
        );

        marketplace.removeOrderIdToOrderInfo(orderInfo.orderId);
        emit AcceptedOffer(
            orderId,
            orderInfo.bidder,
            orderInfo.paymentToken,
            orderInfo.bidPrice,
            orderInfo.marketItemId,
            orderInfo.walletAsset.owner,
            orderInfo.walletAsset.nftAddress,
            orderInfo.walletAsset.tokenId,
            orderInfo.marketItemId == 0 ? orderInfo.amount : orderInfo.amount
        );
    }

    /**
     *  @notice Refund amount token for Bid
     */
    function refundBidAmount(uint256 orderId) external {
        Order memory orderInfo = marketplace.getOrderIdToOrderInfo(orderId);
        require(orderInfo.bidder == _msgSender(), "ERROR: Invalid bidder !");
        // refund all amount
        _internalTransferCall(orderInfo.paymentToken, orderInfo.bidPrice, address(this), _msgSender());
        // remove record
        marketplace.removeOrderOfOwner(orderInfo.bidder, orderInfo.orderId);

        marketplace.removeOrderIdFromAssetOfOwner(
            orderInfo.marketItemId == 0
                ? orderInfo.walletAsset.owner
                : marketplace.getMarketItemIdToMarketItem(orderInfo.marketItemId).seller,
            orderInfo.orderId
        );

        marketplace.removeOrderIdToOrderInfo(orderInfo.orderId);
        emit Claimed(orderId);
    }

    /**
     *  @notice Transfer nft call
     */
    function _internalTransferNFTCall(
        address nftContractAddress,
        uint256 tokenId,
        uint256 amount,
        address from,
        address to
    ) internal {
        NFTHelper.Type nftType = NFTHelper.getType(nftContractAddress);
        require(nftType != NFTHelper.Type.NONE, "ERROR: NFT address is compatible !");

        if (nftType == NFTHelper.Type.ERC721) {
            IERC721Upgradeable(nftContractAddress).safeTransferFrom(from, to, tokenId);
        } else {
            IERC1155Upgradeable(nftContractAddress).safeTransferFrom(from, to, tokenId, amount, "");
        }
    }

    /**
     *  @notice Sell any nft avaiable in marketplace after metaversus manager mint
     *
     *  @dev    All caller can call this function.
     */
    function sellAvaiableInMarketplace(
        uint256 marketItemId,
        uint256 price,
        uint256 amount,
        uint256 startTime,
        uint256 endTime,
        IERC20Upgradeable paymentToken
    ) external nonReentrant notZero(price) whenNotPaused {
        MarketItem memory item = marketplace.getMarketItemIdToMarketItem(marketItemId);
        require(item.endTime < block.timestamp, "ERROR: market item is not free !");
        require(item.seller == _msgSender(), "ERROR: sender is not owner this NFT");
        if (item.nftType == uint256(NftStandard.ERC1155)) {
            if (amount > item.amount) {
                _internalTransferNFTCall(
                    item.nftContractAddress,
                    item.tokenId,
                    amount - item.amount,
                    _msgSender(),
                    address(marketplace)
                );
                item.amount = amount;
            } else if (amount < item.amount) {
                _internalTransferNFTCall(
                    item.nftContractAddress,
                    item.tokenId,
                    item.amount - amount,
                    address(marketplace),
                    _msgSender()
                );
                item.amount = amount;
            }
        }
        item.price = price;
        item.status = MarketItemStatus.LISTING;
        item.startTime = startTime;
        item.endTime = endTime;
        item.paymentToken = paymentToken;
        marketplace.setMarketItemIdToMarketItem(marketItemId, item);
        // self transfer for get event logs
        //   _internalTransferNFTCall(item.nftContractAddress, item.tokenId, item.amount, address(marketplace), address(marketplace));

        emit SoldAvailableItem(
            marketItemId,
            item.nftContractAddress,
            item.tokenId,
            item.amount,
            item.seller,
            item.price,
            item.nftType,
            item.startTime,
            item.endTime,
            item.paymentToken
        );
    }

    /**
     *  @notice Sell any nft
     *
     *  @dev    All caller can call this function.
     */
    function sell(
        address nftContractAddress,
        uint256 tokenId,
        uint256 amount,
        uint256 price,
        uint256 startTime,
        uint256 endTime,
        IERC20Upgradeable paymentToken,
        bytes calldata rootHash
    ) external nonReentrant notZero(amount) notZero(price) whenNotPaused {
        require(endTime > block.timestamp, "ERROR: Only sell");
        // create market item to store data selling
        marketplace.extCreateMarketInfo(
            nftContractAddress,
            tokenId,
            amount,
            price,
            _msgSender(),
            startTime,
            endTime,
            paymentToken,
            rootHash
        );
        // check and update offer
        NFTHelper.Type nftType = NFTHelper.getType(nftContractAddress);
        // 1. check sell all
        if (
            nftType == NFTHelper.Type.ERC721 ||
            (nftType == NFTHelper.Type.ERC1155 &&
                IERC1155Upgradeable(nftContractAddress).balanceOf(_msgSender(), tokenId) == amount)
        ) {
            for (uint256 i = 0; i < marketplace.getLengthOrderIdFromAssetOfOwner(_msgSender()); i++) {
                // 1. find Offer[] need to update
                Order memory validOrder = marketplace.getOrderIdToOrderInfo(
                    marketplace.getOrderIdFromAssetOfOwner(_msgSender(), i)
                );

                if (
                    validOrder.walletAsset.owner == _msgSender() &&
                    validOrder.walletAsset.nftAddress == nftContractAddress &&
                    validOrder.walletAsset.tokenId == tokenId
                ) {
                    // 3. update Offer[]
                    validOrder.marketItemId = marketplace.getCurrentMarketItem();
                    marketplace.setOrderIdToOrderInfo(validOrder.orderId, validOrder);
                }
            }
        }

        // transfer nft to contract for selling
        _internalTransferNFTCall(nftContractAddress, tokenId, amount, _msgSender(), address(marketplace));
    }

    /**
     *  @notice Canncel any nft which selling
     *
     *  @dev    All caller can call this function.
     */
    function cancelSell(uint256 marketItemId) external nonReentrant whenNotPaused {
        MarketItem memory item = marketplace.getMarketItemIdToMarketItem(marketItemId);
        require(item.status == MarketItemStatus.LISTING, "ERROR: NFT not available !");
        require(item.seller == _msgSender(), "ERROR: you are not the seller !");
        // update market item
        item.status = MarketItemStatus.CANCELED;
        marketplace.removeMarketItemOfOwner(_msgSender(), marketItemId);
        // check and update offer
        for (uint256 i = 0; i < marketplace.getLengthOrderIdFromAssetOfOwner(item.seller); i++) {
            // 1. find Offer[] need to update
            Order memory validOrder = marketplace.getOrderIdToOrderInfo(
                marketplace.getOrderIdFromAssetOfOwner(item.seller, i)
            );
            if (validOrder.marketItemId == marketItemId) {
                // 2. update Offer[]
                validOrder.marketItemId = 0;
                validOrder.walletAsset.owner = _msgSender();
                validOrder.walletAsset.nftAddress = item.nftContractAddress;
                validOrder.walletAsset.tokenId = item.tokenId;
                validOrder.amount = item.amount;
                marketplace.setOrderIdToOrderInfo(validOrder.orderId, validOrder);
            }
        }

        // transfer nft back seller
        _internalTransferNFTCall(
            item.nftContractAddress,
            item.tokenId,
            item.amount,
            address(marketplace),
            _msgSender()
        );
        emit CanceledSelling(
            marketItemId,
            item.nftContractAddress,
            item.tokenId,
            item.amount,
            item.seller,
            item.price,
            item.nftType,
            item.startTime,
            item.endTime,
            item.paymentToken
        );
    }

    /**
     *  @notice Transfer call
     */
    function _internalTransferCall(
        IERC20Upgradeable paymentToken,
        uint256 amount,
        address from,
        address to
    ) internal {
        console.log("order ext:", from, to, address(this));
        console.log("order msg.value:", msg.value);
        if (address(paymentToken) == address(0)) {
            if (to == address(this)) {
                require(msg.value == amount, "Failed to send into contract in order");
            } else {
                (bool sent, ) = to.call{ value: amount }("");
                require(sent, "Failed to send native in order");
            }
        } else {
            if (to == address(this)) {
                console.log("order ext: alo");
                IERC20Upgradeable(paymentToken).safeTransferFrom(from, to, amount);
            } else {
                console.log("order ext: blo");
                IERC20Upgradeable(paymentToken).transfer(to, amount);
                // IERC20Upgradeable(paymentToken).safeTransferFrom(from, to, amount);
            }
        }
    }

    /**
     *  @notice Buy any nft which selling
     *
     *  @dev    All caller can call this function.
     */
    function buy(uint256 marketItemId) external payable nonReentrant whenNotPaused {
        MarketItem memory data = marketplace.getMarketItemIdToMarketItem(marketItemId);
        require(_msgSender() != data.seller, "ERROR: Not allow to buy yourself");
        require(
            data.status == MarketItemStatus.LISTING &&
                data.startTime < block.timestamp &&
                block.timestamp < data.endTime,
            "ERROR: NFT is not selling"
        );

        // update new buyer for martket item
        data.buyer = _msgSender();
        data.status = MarketItemStatus.SOLD;
        marketplace.setMarketItemIdToMarketItem(marketItemId, data);

        marketplace.removeMarketItemOfOwner(_msgSender(), marketItemId);
        // request token
        _internalTransferCall(data.paymentToken, data.price, _msgSender(), address(this));

        // pay listing fee
        uint256 netSaleValue = data.price - marketplace.getListingFee(data.price);

        // pay 2.5% royalties from the amount actually received
        netSaleValue = _deduceRoyalties(data.nftContractAddress, data.tokenId, netSaleValue, data.paymentToken);

        // pay 97.5% of the amount actually received to seller
        _internalTransferCall(data.paymentToken, netSaleValue, address(this), data.seller);

        // transfer nft_internalTransferNFTCall(data.nftContractAddress, data.tokenId, data.amount, address(marketplace), _msgSender());

        emit Bought(
            marketItemId,
            data.nftContractAddress,
            data.tokenId,
            data.amount,
            _msgSender(),
            data.price,
            data.nftType,
            data.startTime,
            data.endTime,
            data.paymentToken
        );
    }

    /**
     * @dev Returns true if this contract implements the interface defined by
     * `interfaceId`. See the corresponding
     * https://eips.ethereum.org/EIPS/eip-165#how-interfaces-are-identified[EIP section]
     * to learn more about how these ids are created.
     *
     * This function call must use less than 30 000 gas.
     */
    function supportsInterface(bytes4 interfaceId)
        public
        view
        virtual
        override(ERC165Upgradeable, IERC165Upgradeable)
        returns (bool)
    {
        return interfaceId == type(IOrder).interfaceId || super.supportsInterface(interfaceId);
    }
}
