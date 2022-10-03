// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

import "@openzeppelin/contracts-upgradeable/utils/introspection/ERC165Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC1155/IERC1155Upgradeable.sol";

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
        address paymentToken
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
        address paymentToken
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
        address paymentToken
    );

    event Claimed(uint256 indexed orderId);
    event AcceptedOffer(
        uint256 indexed orderId,
        address bidder,
        address paymentToken,
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
    function initialize(IMarketplaceManager _marketplace, IAdmin _admin) public initializer {
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
                    marketplace.extTransferCall(
                        order.paymentToken,
                        bidPrice - order.bidPrice,
                        _msgSender(),
                        address(marketplace)
                    );
                } else if (bidPrice < order.bidPrice) {
                    marketplace.extTransferCall(
                        order.paymentToken,
                        order.bidPrice - bidPrice,
                        address(marketplace),
                        _msgSender()
                    );
                }

                order.paymentToken = address(paymentToken);
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

        marketplace.externalMakeOffer(address(paymentToken), bidPrice, time, amount, 0, newWalletAsset);
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
                    marketplace.extTransferCall(
                        order.paymentToken,
                        bidPrice - order.bidPrice,
                        _msgSender(),
                        address(marketplace)
                    );
                } else {
                    marketplace.extTransferCall(
                        order.paymentToken,
                        order.bidPrice - bidPrice,
                        address(marketplace),
                        _msgSender()
                    );
                }
                order.paymentToken = address(paymentToken);
                order.bidPrice = bidPrice;
                order.expiredOrder = time;
                marketplace.setOrderIdToOrderInfo(order.orderId, order);
                emit UpdatedOffer(order.orderId);
                return;
            }
        }
        // Create Order

        WalletAsset memory newWalletAsset;

        marketplace.externalMakeOffer(address(paymentToken), bidPrice, time, 0, marketItemId, newWalletAsset);
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
            marketplace.extTransferNFTCall(
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
            marketplace.extTransferNFTCall(
                marketItem.nftContractAddress,
                marketItem.tokenId,
                marketItem.amount,
                address(marketplace),
                orderInfo.bidder
            );
        }

        // deduce royalty
        uint256 netSaleValue = (orderInfo.marketItemId == 0)
            ? marketplace.deduceRoyalties(
                orderInfo.walletAsset.nftAddress,
                orderInfo.walletAsset.tokenId,
                orderInfo.bidPrice,
                orderInfo.paymentToken
            )
            : marketplace.deduceRoyalties(
                marketItem.nftContractAddress,
                marketItem.tokenId,
                orderInfo.bidPrice,
                orderInfo.paymentToken
            );

        // receive token payment
        marketplace.extTransferCall(
            orderInfo.paymentToken,
            netSaleValue,
            address(marketplace),
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
        marketplace.extTransferCall(orderInfo.paymentToken, orderInfo.bidPrice, address(marketplace), _msgSender());
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
        address paymentToken
    ) external nonReentrant notZero(price) whenNotPaused {
        MarketItem memory item = marketplace.getMarketItemIdToMarketItem(marketItemId);
        require(item.endTime < block.timestamp, "ERROR: market item is not free !");
        require(item.seller == _msgSender(), "ERROR: sender is not owner this NFT");
        if (item.nftType == uint256(NftStandard.ERC1155)) {
            if (amount > item.amount) {
                marketplace.extTransferNFTCall(
                    item.nftContractAddress,
                    item.tokenId,
                    amount - item.amount,
                    _msgSender(),
                    address(marketplace)
                );
                item.amount = amount;
            } else if (amount < item.amount) {
                marketplace.extTransferNFTCall(
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
        //   marketplace.extTransferNFTCall(item.nftContractAddress, item.tokenId, item.amount, address(marketplace), address(marketplace));

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
        address paymentToken,
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
        marketplace.extTransferNFTCall(nftContractAddress, tokenId, amount, _msgSender(), address(marketplace));
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
        marketplace.extTransferNFTCall(
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
        marketplace.extTransferCall(data.paymentToken, data.price, _msgSender(), address(marketplace));

        // pay listing fee
        uint256 netSaleValue = data.price - marketplace.getListingFee(data.price);

        // pay 2.5% royalties from the amount actually received
        netSaleValue = marketplace.deduceRoyalties(
            data.nftContractAddress,
            data.tokenId,
            netSaleValue,
            data.paymentToken
        );

        // pay 97.5% of the amount actually received to seller
        marketplace.extTransferCall(data.paymentToken, netSaleValue, address(marketplace), data.seller);

        // transfer nft to buyer
        marketplace.extTransferNFTCall(
            data.nftContractAddress,
            data.tokenId,
            data.amount,
            address(marketplace),
            _msgSender()
        );

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
