// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/introspection/ERC165Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC1155/IERC1155Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC721/IERC721Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/structs/EnumerableSetUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/CountersUpgradeable.sol";

import "../interfaces/IMarketplaceManager.sol";
import "../lib/NFTHelper.sol";
import "../TransferableToken.sol";
import "hardhat/console.sol";

/**
 *  @title  Dev Order Contract
 *
 *  @author Metaversus Team
 *
 *  @notice This smart contract is the part of marketplace for exhange multiple non-fungiable token with standard ERC721 and ERC1155
 *          all action which user could sell, unsell, buy them.
 */
contract OrderManager is TransferableToken, ReentrancyGuardUpgradeable, ERC165Upgradeable, IOrder {
    using SafeERC20Upgradeable for IERC20Upgradeable;
    using CountersUpgradeable for CountersUpgradeable.Counter;
    using EnumerableSetUpgradeable for EnumerableSetUpgradeable.UintSet;

    /**
     *  @notice marketplace store the address of the marketplaceManager contract
     */
    IMarketplaceManager public marketplace;

    /**
     *  @notice Mapping from OrderId to Order
     *  @dev TokenId -> OrderID[]
     */
    mapping(uint256 => EnumerableSetUpgradeable.UintSet) private tokenIdToWalletOrderIds;
    CountersUpgradeable.Counter private walletOrderIds;

    /**
     *  @notice Mapping from MarketItemId to to Order
     *  @dev MarketId -> OrderID[]
     */
    mapping(uint256 => EnumerableSetUpgradeable.UintSet) private marketItemIdToMarketItemOrderIds;
    CountersUpgradeable.Counter private marketItemOrderIds;

    /**
     *  @notice Mapping from MarketItemId to to Order
     *  @dev OrderID -> Order
     */
    mapping(uint256 => WalletOrder) public walletOrders;

    /**
     *  @notice Mapping from MarketItemId to to Order
     *  @dev OrderID -> MarketItemOrder
     */
    mapping(uint256 => MarketItemOrder) public marketItemOrders;

    /**
     *  @notice Mapping from NFT address => token ID => To => Owner ==> Order Info
     */
    mapping(address => mapping(uint256 => mapping(address => mapping(address => OrderInfo))))
        public walletOrderOfOwners;

    /**
     *  @notice Mapping from marketItemId => Owner ==> Order Info
     */
    mapping(uint256 => mapping(address => OrderInfo)) public marketItemOrderOfOwners;

    event SoldAvailableItem(
        uint256 indexed marketItemId,
        address nftContractAddress,
        uint256 tokenId,
        uint256 amount,
        uint256 price,
        uint256 nftType,
        address seller,
        address buyer,
        uint256 status,
        uint256 startTime,
        uint256 endTime,
        address paymentToken,
        bool isPrivate
    );
    event CanceledSell(
        uint256 indexed marketItemId,
        address nftContractAddress,
        uint256 tokenId,
        uint256 amount,
        uint256 price,
        uint256 nftType,
        address seller,
        address buyer,
        uint256 status,
        uint256 startTime,
        uint256 endTime,
        address paymentToken,
        bool isPrivate
    );
    event Bought(
        uint256 indexed marketItemId,
        address nftContractAddress,
        uint256 tokenId,
        uint256 amount,
        uint256 price,
        uint256 nftType,
        address seller,
        address buyer,
        MarketItemStatus status,
        uint256 startTime,
        uint256 endTime,
        address paymentToken,
        bool isPrivate
    );
    event RoyaltiesPaid(uint256 indexed tokenId, uint256 indexed value);
    event Claimed(uint256 indexed orderId);
    event AcceptedOrder(uint256 indexed orderId);
    event UpdatedOrder(
        uint256 indexed orderId,
        address owner,
        address to,
        address nftAddress,
        uint256 tokenId,
        uint256 amount,
        address paymentToken,
        uint256 bidPrice,
        uint256 expiredTime,
        OrderStatus status
    );
    event MakeOrder(
        uint256 indexed orderId,
        address owner,
        address to,
        address nftAddress,
        uint256 tokenId,
        uint256 amount,
        address paymentToken,
        uint256 bidPrice,
        uint256 expiredTime,
        OrderStatus status
    );
    event UpdateOrder(
        address owner,
        address to,
        address nftAddress,
        uint256 tokenId,
        uint256 amount,
        address paymentToken,
        uint256 bidPrice,
        uint256 expiredTime,
        OrderStatus status
    );
    event CanceledOrder(uint256 indexed orderId);

    modifier validMarketItemId(uint256 _id) {
        require(_id <= marketplace.getCurrentMarketItem() && _id > 0, "ERROR: market ID is not exist !");
        _;
    }

    modifier validWalletOrderId(uint256 _id) {
        require(_id <= walletOrderIds.current() && _id > 0, "ERROR: wallet order ID is not exist !");
        _;
    }

    modifier validMarketItemOrderId(uint256 _id) {
        require(_id <= marketItemOrderIds.current() && _id > 0, "ERROR: market item order ID is not exist !");
        _;
    }

    /**
     *  @notice Initialize new logic contract.
     */
    function initialize(IMarketplaceManager _marketplace, IAdmin _admin)
        public
        initializer
        validMarketplaceManager(_marketplace)
    {
        __TransferableToken_init(_admin);
        __ReentrancyGuard_init();
        __ERC165_init();

        marketplace = _marketplace;
    }

    /**
     * @dev make Order with any NFT in wallet
     *
     * Emit {MadeWalletOrder}
     */
    function makeWalletOrder(
        IERC20Upgradeable _paymentToken,
        uint256 _bidPrice,
        address _to,
        address _nftAddress,
        uint256 _tokenId,
        uint256 _amount,
        uint256 _time
    )
        external
        payable
        nonReentrant
        whenNotPaused
        validPaymentToken(_paymentToken)
        notZero(_bidPrice)
        validWallet(_to)
        notZero(_amount)
    {
        require(_time > block.timestamp, "Invalid order time");
        require(admin.isPermittedPaymentToken(_paymentToken), "Payment token is not valid");
        // Check exist make Offer
        OrderInfo storage existOrder = walletOrderOfOwners[_nftAddress][_tokenId][_to][_msgSender()];
        // check for update
        if (existOrder.bidPrice != 0) {
            // Transfer before update
            if (_bidPrice > existOrder.bidPrice) {
                _transferToken(_paymentToken, _bidPrice - existOrder.bidPrice, _msgSender(), address(this));
            } else if (_bidPrice < existOrder.bidPrice) {
                _transferToken(_paymentToken, existOrder.bidPrice - _bidPrice, address(this), _msgSender());
            }
            // Update status
            existOrder.paymentToken = _paymentToken;
            existOrder.bidPrice = _bidPrice;
            existOrder.amount = _amount;
            existOrder.expiredTime = _time;
            existOrder.status = OrderStatus.PENDING;

            // Emit Event
            emit UpdateOrder(
                _msgSender(),
                _to,
                _nftAddress,
                _tokenId,
                existOrder.amount,
                address(existOrder.paymentToken),
                existOrder.bidPrice,
                existOrder.expiredTime,
                existOrder.status
            );
        } else {
            walletOrderIds.increment();
            // Create Order
            WalletOrder memory walletOrder = WalletOrder({
                owner: _msgSender(),
                to: _to,
                nftAddress: _nftAddress,
                tokenId: _tokenId
            });
            OrderInfo memory orderInfo = OrderInfo({
                amount: _amount,
                paymentToken: _paymentToken,
                bidPrice: _bidPrice,
                expiredTime: _time,
                status: OrderStatus.PENDING
            });
            walletOrderOfOwners[_nftAddress][_tokenId][_to][_msgSender()] = orderInfo;
            walletOrders[walletOrderIds.current()] = walletOrder;

            _transferToken(_paymentToken, _bidPrice, walletOrder.owner, address(this));

            // Emit Event
            emit MakeOrder(
                walletOrderIds.current(),
                walletOrder.owner,
                walletOrder.to,
                walletOrder.nftAddress,
                walletOrder.tokenId,
                orderInfo.amount,
                address(orderInfo.paymentToken),
                orderInfo.bidPrice,
                orderInfo.expiredTime,
                orderInfo.status
            );
        }
    }

    /**
     *  @notice Accept Wallet Order
     *
     * * Emit {AcceptedWalletOrder}
     */
    function acceptWalletOrder(uint256 _orderId)
        external
        payable
        nonReentrant
        whenNotPaused
        validWalletOrderId(_orderId)
    {
        WalletOrder storage walletOrder = walletOrders[_orderId];
        OrderInfo storage orderInfo = walletOrderOfOwners[walletOrder.nftAddress][walletOrder.tokenId][walletOrder.to][
            walletOrder.owner
        ];
        require(walletOrder.owner != address(0), "Invalid order");
        require(walletOrder.to == _msgSender(), "Not the seller");
        require(orderInfo.status == OrderStatus.PENDING, "Order is not available");
        require(orderInfo.expiredTime >= block.timestamp, "Order is expired");

        // Update order information
        orderInfo.status = OrderStatus.ACCEPTED;

        // pay listing fee
        uint256 netSaleValue = orderInfo.bidPrice - marketplace.getListingFee(orderInfo.bidPrice);

        // Pay royalties from the amount actually received
        netSaleValue = _deduceRoyalties(
            walletOrder.nftAddress,
            walletOrder.tokenId,
            netSaleValue,
            orderInfo.paymentToken
        );

        // Transfer Token from Buyer to Seller
        _transferToken(orderInfo.paymentToken, netSaleValue, address(this), walletOrder.to);

        // Transfer NFT from Seller to Buyer
        NFTHelper.transferNFTCall(
            walletOrder.nftAddress,
            walletOrder.tokenId,
            orderInfo.amount,
            walletOrder.to,
            walletOrder.owner
        );

        // Emit event
        emit AcceptedOrder(_orderId);
    }

    /**
     *  @notice make Order any NFT in marketplace
     *
     *  Emit {MadeMaketItemOrder}
     */
    function makeMaketItemOrder(
        uint256 _marketItemId,
        IERC20Upgradeable _paymentToken,
        uint256 _bidPrice,
        uint256 _time,
        bytes32[] memory _proof
    )
        external
        payable
        nonReentrant
        whenNotPaused
        validMarketItemId(_marketItemId)
        validPaymentToken(_paymentToken)
        notZero(_bidPrice)
    {
        require(_time > block.timestamp, "Invalid order time");
        require(admin.isPermittedPaymentToken(_paymentToken), "Payment token is not valid");
        // Check Market Item
        MarketItem memory marketItem = marketplace.getMarketItemIdToMarketItem(_marketItemId);
        require(marketItem.status == MarketItemStatus.LISTING, "Market Item is not available");
        if (marketItem.isPrivate) {
            require(
                admin.isOwnedMetaCitizen(_msgSender()) && marketplace.verify(_marketItemId, _proof, _msgSender()),
                "Require own MetaCitizen NFT"
            );
        }

        OrderInfo storage existOrder = marketItemOrderOfOwners[_marketItemId][_msgSender()];

        if (existOrder.bidPrice != 0) {
            // Transfer before update
            if (_bidPrice > existOrder.bidPrice) {
                _transferToken(_paymentToken, _bidPrice - existOrder.bidPrice, _msgSender(), address(this));
            } else if (_bidPrice < existOrder.bidPrice) {
                _transferToken(_paymentToken, existOrder.bidPrice - _bidPrice, address(this), _msgSender());
            }

            // Update status
            existOrder.paymentToken = _paymentToken;
            existOrder.bidPrice = _bidPrice;
            existOrder.amount = marketItem.amount;
            existOrder.expiredTime = _time;
            existOrder.status = OrderStatus.PENDING;

            // Emit Event
            emit UpdateOrder(
                _msgSender(),
                marketItem.seller,
                marketItem.nftContractAddress,
                marketItem.tokenId,
                existOrder.amount,
                address(existOrder.paymentToken),
                existOrder.bidPrice,
                existOrder.expiredTime,
                existOrder.status
            );
        } else {
            // Create Order
            MarketItemOrder memory marketItemOrder = MarketItemOrder({
                owner: _msgSender(),
                marketItemId: _marketItemId
            });

            OrderInfo memory orderInfo = OrderInfo({
                amount: marketItem.amount,
                paymentToken: _paymentToken,
                bidPrice: _bidPrice,
                expiredTime: _time,
                status: OrderStatus.PENDING
            });

            marketItemOrderIds.increment();
            marketItemOrderOfOwners[_marketItemId][_msgSender()] = orderInfo;
            marketItemOrders[marketItemOrderIds.current()] = marketItemOrder;

            _transferToken(_paymentToken, _bidPrice, marketItemOrder.owner, address(this));

            // Emit Event
            emit MakeOrder(
                marketItemOrderIds.current(),
                _msgSender(),
                marketItem.seller,
                marketItem.nftContractAddress,
                marketItem.tokenId,
                orderInfo.amount,
                address(orderInfo.paymentToken),
                orderInfo.bidPrice,
                orderInfo.expiredTime,
                orderInfo.status
            );
        }
    }

    /**
     *  @notice Accept MarketItem Order
     *
     *  Emit {AcceptedMarketItemOffer}
     */
    function acceptMarketItemOrder(uint256 _orderId)
        external
        payable
        nonReentrant
        whenNotPaused
        validMarketItemOrderId(_orderId)
    {
        // Get Order
        MarketItemOrder storage marketItemOrder = marketItemOrders[_orderId];
        OrderInfo storage orderInfo = marketItemOrderOfOwners[marketItemOrder.marketItemId][marketItemOrder.owner];

        // Get Market Item
        MarketItem memory marketItem = marketplace.getMarketItemIdToMarketItem(marketItemOrder.marketItemId);
        require(marketItem.status == MarketItemStatus.LISTING, "Market Item is not available");

        require(marketItem.seller == _msgSender(), "Invalid seller of asset !");
        require(orderInfo.status == OrderStatus.PENDING, "Order is not available");
        require(orderInfo.expiredTime >= block.timestamp, "Order is expired");

        // Update Order
        orderInfo.status = OrderStatus.ACCEPTED;

        // Update Market Item
        marketItem.status = MarketItemStatus.SOLD;
        marketItem.buyer = marketItemOrder.owner;
        marketplace.setMarketItemIdToMarketItem(marketItemOrder.marketItemId, marketItem);

        // pay listing fee
        uint256 netSaleValue = orderInfo.bidPrice - marketplace.getListingFee(orderInfo.bidPrice);

        // Pay royalties from the amount actually received
        netSaleValue = _deduceRoyalties(
            marketItem.nftContractAddress,
            marketItem.tokenId,
            netSaleValue,
            marketItem.paymentToken
        );

        // Transfer Token from Buyer to Seller
        _transferToken(orderInfo.paymentToken, netSaleValue, address(this), marketItem.seller);

        // Transfer NFT from Seller to Buyer
        marketplace.extTransferNFTCall(
            marketItem.nftContractAddress,
            marketItem.tokenId,
            marketItem.amount,
            address(marketplace),
            marketItem.buyer
        );

        // Emit event
        emit AcceptedOrder(_orderId);
    }

    /**
     *  @notice Cancel Wallet Order
     *
     *  Emit {CanceledWalletOrder}
     */
    function cancelWalletOrder(uint256 _orderId) external whenNotPaused validWalletOrderId(_orderId) {
        WalletOrder storage walletOrder = walletOrders[_orderId];
        OrderInfo storage orderInfo = walletOrderOfOwners[walletOrder.nftAddress][walletOrder.tokenId][walletOrder.to][
            walletOrder.owner
        ];
        require(walletOrder.owner == _msgSender(), "Not the owner of offer");
        require(orderInfo.status == OrderStatus.PENDING, "Order is not available");

        // Update order information
        orderInfo.status = OrderStatus.CANCELED;

        // Payback token to owner
        _transferToken(orderInfo.paymentToken, orderInfo.bidPrice, address(this), walletOrder.owner);

        emit CanceledOrder(_orderId);
    }

    /**
     *  @notice Cancel Wallet Order
     *
     *  Emit {CanceledMarketItemOrder}
     */
    function cancelMarketItemOrder(uint256 _orderId) external whenNotPaused validMarketItemOrderId(_orderId) {
        // Get Order
        MarketItemOrder storage marketItemOrder = marketItemOrders[_orderId];
        OrderInfo storage orderInfo = marketItemOrderOfOwners[marketItemOrder.marketItemId][marketItemOrder.owner];
        require(marketItemOrder.owner == _msgSender(), "Not the owner of offer");
        require(orderInfo.status == OrderStatus.PENDING, "Order is not available");

        // Update Order
        orderInfo.status = OrderStatus.CANCELED;

        // Payback token to owner
        _transferToken(orderInfo.paymentToken, orderInfo.bidPrice, address(this), marketItemOrder.owner);

        emit CanceledOrder(_orderId);
    }

    /**
     *  @notice Resell Market Item avaiable in marketplace after Market Item is expired
     *
     *  Emit {SoldAvailableItem}
     */
    function sellAvailableInMarketplace(
        uint256 marketItemId,
        uint256 price,
        uint256 amount,
        uint256 startTime,
        uint256 endTime,
        IERC20Upgradeable paymentToken
    ) external nonReentrant whenNotPaused validMarketItemId(marketItemId) notZero(price) notZero(amount) {
        MarketItem memory marketItem = marketplace.getMarketItemIdToMarketItem(marketItemId);
        require(marketItem.status == MarketItemStatus.LISTING, "Market Item is not available");
        require(marketItem.seller == _msgSender(), "You are not the seller");
        require(marketItem.endTime < block.timestamp, "Not expired yet");
        require(admin.isPermittedPaymentToken(paymentToken), "Payment token is not valid");

        // NOTE Can this function allowed to change amount of token after resell
        if (marketItem.nftType == NFTHelper.Type.ERC1155) {
            if (amount > marketItem.amount) {
                marketplace.extTransferNFTCall(
                    marketItem.nftContractAddress,
                    marketItem.tokenId,
                    amount - marketItem.amount,
                    _msgSender(),
                    address(marketplace)
                );
                marketItem.amount = amount;
            } else if (amount < marketItem.amount) {
                marketplace.extTransferNFTCall(
                    marketItem.nftContractAddress,
                    marketItem.tokenId,
                    marketItem.amount - amount,
                    address(marketplace),
                    _msgSender()
                );
                marketItem.amount = amount;
            }
        }
        marketItem.price = price;
        marketItem.status = MarketItemStatus.LISTING;
        marketItem.startTime = startTime;
        marketItem.endTime = endTime;
        marketItem.paymentToken = paymentToken;
        marketplace.setMarketItemIdToMarketItem(marketItemId, marketItem);

        emit SoldAvailableItem(
            marketItemId,
            marketItem.nftContractAddress,
            marketItem.tokenId,
            marketItem.amount,
            marketItem.price,
            uint(marketItem.nftType),
            marketItem.seller,
            marketItem.buyer,
            uint256(marketItem.status),
            marketItem.startTime,
            marketItem.endTime,
            address(marketItem.paymentToken),
            marketItem.isPrivate
        );
    }

    /**
     *  @notice Sell any nft
     *
     *  @dev    All caller can call this function.
     */
    function sell(
        address _nftAddress,
        uint256 _tokenId,
        uint256 _amount,
        uint256 _price,
        uint256 _startTime,
        uint256 _endTime,
        IERC20Upgradeable _paymentToken,
        bytes calldata _rootHash
    ) external nonReentrant whenNotPaused validPaymentToken(_paymentToken) notZero(_price) notZero(_amount) {
        require(NFTHelper.isTokenExist(_nftAddress, _tokenId), "Token is not existed");
        require(_startTime >= block.timestamp && _endTime > _startTime, "Invalid time");

        NFTHelper.Type nftType = NFTHelper.getType(_nftAddress);
        require(nftType != NFTHelper.Type.NONE, "Invalid NFT Address");

        if (nftType == NFTHelper.Type.ERC721) {
            require(_amount == 1, "Invalid amount");
        }

        // transfer nft to contract for selling
        marketplace.extTransferNFTCall(_nftAddress, _tokenId, _amount, _msgSender(), address(marketplace));

        // create market item to store data selling
        marketplace.extCreateMarketInfo(
            _nftAddress,
            _tokenId,
            _amount,
            _price,
            _msgSender(),
            _startTime,
            _endTime,
            _paymentToken,
            _rootHash
        );
    }

    /**
     *  @notice Canncel any nft which selling
     *
     *  @dev    All caller can call this function.
     *
     *  Emit {CanceledSell}
     */
    function cancelSell(uint256 marketItemId) external nonReentrant whenNotPaused validMarketItemId(marketItemId) {
        MarketItem memory marketItem = marketplace.getMarketItemIdToMarketItem(marketItemId);
        require(marketItem.status == MarketItemStatus.LISTING, "Market Item is not available");
        require(marketItem.seller == _msgSender(), "You are not the seller");

        // Update Market Item
        marketItem.status = MarketItemStatus.CANCELED;
        marketplace.setMarketItemIdToMarketItem(marketItemId, marketItem);

        // transfer nft back to seller
        marketplace.extTransferNFTCall(
            marketItem.nftContractAddress,
            marketItem.tokenId,
            marketItem.amount,
            address(marketplace),
            _msgSender()
        );

        emit CanceledSell(
            marketItemId,
            marketItem.nftContractAddress,
            marketItem.tokenId,
            marketItem.amount,
            marketItem.price,
            uint(marketItem.nftType),
            marketItem.seller,
            marketItem.buyer,
            uint256(marketItem.status),
            marketItem.startTime,
            marketItem.endTime,
            address(marketItem.paymentToken),
            marketItem.isPrivate
        );
    }

    /**
     *  @notice Buy any nft which selling
     *
     *  @dev    All caller can call this function.
     *
     *  Emit {Bought}
     */
    function buy(uint256 marketItemId, bytes32[] calldata proof)
        external
        payable
        nonReentrant
        whenNotPaused
        validMarketItemId(marketItemId)
    {
        MarketItem memory marketItem = marketplace.getMarketItemIdToMarketItem(marketItemId);
        require(marketItem.status == MarketItemStatus.LISTING, "Market Item is not available");
        require(_msgSender() != marketItem.seller, "Can not buy your own NFT");
        require(
            marketItem.startTime <= block.timestamp && block.timestamp <= marketItem.endTime,
            "Market Item is not selling"
        );
        // Only check when market item is in private collection
        if (marketItem.isPrivate) {
            require(
                marketplace.verify(marketItemId, proof, _msgSender()) && admin.isOwnedMetaCitizen(_msgSender()),
                "Sender is not in whitelist or not own meta citizen NFT"
            );
        }

        // update new buyer for martket item
        marketItem.buyer = _msgSender();
        marketItem.status = MarketItemStatus.SOLD;
        marketplace.setMarketItemIdToMarketItem(marketItemId, marketItem);
        marketplace.removeMarketItemOfOwner(marketItem.seller, marketItemId);
        marketplace.setIsBuyer(_msgSender());
        // Transfer token to contract
        _transferToken(marketItem.paymentToken, marketItem.price, _msgSender(), address(this));

        // Transfer NFT to Buyer
        marketplace.extTransferNFTCall(
            marketItem.nftContractAddress,
            marketItem.tokenId,
            marketItem.amount,
            address(marketplace),
            _msgSender()
        );

        // pay listing fee
        uint256 netSaleValue = marketItem.price - marketplace.getListingFee(marketItem.price);

        // Pay 2.5% royalties from the amount actually received
        netSaleValue = _deduceRoyalties(
            marketItem.nftContractAddress,
            marketItem.tokenId,
            netSaleValue,
            marketItem.paymentToken
        );

        // Pay 97.5% of the amount actually received to seller
        _transferToken(marketItem.paymentToken, netSaleValue, address(this), marketItem.seller);

        emit Bought(
            marketItemId,
            marketItem.nftContractAddress,
            marketItem.tokenId,
            marketItem.amount,
            marketItem.price,
            uint(marketItem.nftType),
            marketItem.seller,
            marketItem.buyer,
            marketItem.status,
            marketItem.startTime,
            marketItem.endTime,
            address(marketItem.paymentToken),
            marketItem.isPrivate
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
    ) private returns (uint256 netSaleAmount) {
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
                _transferToken(paymentToken, royaltiesAmount, address(this), royaltiesReceiver);
                // Broadcast royalties payment
                emit RoyaltiesPaid(tokenId, royaltiesAmount);
            }

            return netSaleValue;
        }
        return grossSaleValue;
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

    function getOrderByWalletOrderId(uint256 waletOrderId) public view returns (WalletOrder memory, OrderInfo memory) {
        WalletOrder memory walletOrder = walletOrders[waletOrderId];
        OrderInfo memory orderInfo = walletOrderOfOwners[walletOrder.nftAddress][walletOrder.tokenId][walletOrder.to][
            walletOrder.owner
        ];
        return (walletOrder, orderInfo);
    }

    function getOrderByMarketItemOrderId(uint256 marketItemOrderId)
        public
        view
        returns (MarketItemOrder memory, OrderInfo memory)
    {
        MarketItemOrder memory marketItemOrder = marketItemOrders[marketItemOrderId];
        OrderInfo memory orderInfo = marketItemOrderOfOwners[marketItemOrder.marketItemId][marketItemOrder.owner];
        return (marketItemOrder, orderInfo);
    }
}
