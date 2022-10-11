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

    CountersUpgradeable.Counter private walletOrderIds;
    CountersUpgradeable.Counter private marketItemOrderIds;
    CountersUpgradeable.Counter private orderIds;

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
     *  @notice OrderId -> OrderInfo
     */
    mapping(uint256 => OrderInfo) public orders;

    /**
     *  @notice OrderId -> WalletOrderId or MarketItemId
     */
    mapping(uint256 => uint256) public orderIdToItemId;

    /**
     *  @notice Mapping from NFT address => token ID => To => Owner ==> OrderId
     */
    mapping(address => mapping(uint256 => mapping(address => mapping(address => uint256)))) public walletOrderOfOwners;

    /**
     *  @notice Mapping from marketItemId => Owner ==> OrderId
     */
    mapping(uint256 => mapping(address => uint256)) public marketItemOrderOfOwners;

    event SoldAvailableItem(uint256 indexed marketItemId, uint256 price, uint256 startTime, uint256 endTime);
    event CanceledSell(uint256 indexed marketItemId);
    event Bought(
        uint256 indexed marketItemId,
        address nftContractAddress,
        uint256 tokenId,
        uint256 amount,
        uint256 price,
        address buyer,
        MarketItemStatus status
    );
    event RoyaltiesPaid(uint256 indexed tokenId, uint256 indexed value);
    event AcceptedOrder(uint256 indexed orderId);
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
    event UpdateOrder(address owner, uint256 orderId, uint256 amount, uint256 bidPrice, uint256 expiredTime);
    event CanceledOrder(uint256 indexed orderId);

    modifier validMarketItemId(uint256 _id) {
        require(_id <= marketplace.getCurrentMarketItem() && _id > 0, "Market ID is not exist");
        _;
    }

    /**
     *  @notice Initialize new logic contract.
     */
    function initialize(IMarketplaceManager _marketplace, IAdmin _admin) public initializer {
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
        require(_to != _msgSender(), "User can not offer");
        // Check exist make Offer
        OrderInfo storage existOrder = orders[walletOrderOfOwners[_nftAddress][_tokenId][_to][_msgSender()]];

        require(NFTHelper.isERC721(_nftAddress) || NFTHelper.isERC1155(_nftAddress), "Invalid nft address");

        if (NFTHelper.isERC721(_nftAddress)) {
            require(IERC721Upgradeable(_nftAddress).ownerOf(_tokenId) == _to, "Invalid token id");
            require(_amount == 1, "Invalid amount");
        } else if (NFTHelper.isERC1155(_nftAddress)) {
            require(IERC1155Upgradeable(_nftAddress).balanceOf(_to, _tokenId) >= _amount, "Invalid token id");
        }

        // check for update
        if (existOrder.bidPrice != 0 && existOrder.status == OrderStatus.PENDING) {
            require(_paymentToken == existOrder.paymentToken, "Can not update payment token");
            _updateOrder(existOrder, _bidPrice, _amount, _time);
        } else {
            walletOrderIds.increment();
            orderIds.increment();
            // Create Order
            WalletOrder memory walletOrder = WalletOrder({
                to: _to,
                nftAddress: _nftAddress,
                tokenId: _tokenId,
                orderId: orderIds.current()
            });
            OrderInfo memory orderInfo = OrderInfo({
                id: orderIds.current(),
                owner: _msgSender(),
                amount: _amount,
                paymentToken: _paymentToken,
                bidPrice: _bidPrice,
                expiredTime: _time,
                status: OrderStatus.PENDING,
                isWallet: true
            });

            orders[orderIds.current()] = orderInfo;
            orderIdToItemId[orderIds.current()] = walletOrderIds.current();

            walletOrderOfOwners[_nftAddress][_tokenId][_to][_msgSender()] = orderIds.current();
            walletOrders[walletOrderIds.current()] = walletOrder;

            _transferToken(_paymentToken, _bidPrice, _msgSender(), address(this));

            // Emit Event
            emit MakeOrder(
                walletOrderIds.current(),
                _msgSender(),
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
     *  @notice make Order any NFT in marketplace
     *
     *  Emit {MadeMaketItemOrder}
     */
    function makeMarketItemOrder(
        uint256 _marketItemId,
        uint256 _bidPrice,
        uint256 _time,
        bytes32[] memory _proof
    ) external payable nonReentrant whenNotPaused validMarketItemId(_marketItemId) notZero(_bidPrice) {
        require(_time > block.timestamp, "Invalid order time");
        // Check Market Item
        MarketItem memory marketItem = marketplace.getMarketItemIdToMarketItem(_marketItemId);
        require(marketItem.status == MarketItemStatus.LISTING, "Market Item is not available");
        require(marketItem.startTime <= block.timestamp && block.timestamp <= marketItem.endTime, "Not the order time");
        require(marketItem.seller != _msgSender(), "User can not offer");
        if (marketplace.isPrivate(_marketItemId)) {
            require(
                admin.isOwnedMetaCitizen(_msgSender()) && marketplace.verify(_marketItemId, _proof, _msgSender()),
                "Require own MetaCitizen NFT"
            );
        }

        OrderInfo storage existOrder = orders[marketItemOrderOfOwners[_marketItemId][_msgSender()]];

        if (existOrder.bidPrice != 0 && existOrder.status == OrderStatus.PENDING) {
            _updateOrder(existOrder, _bidPrice, marketItem.amount, _time);
        } else {
            orderIds.increment();
            // Create Order
            MarketItemOrder memory marketItemOrder = MarketItemOrder({
                marketItemId: _marketItemId,
                orderId: orderIds.current()
            });

            OrderInfo memory orderInfo = OrderInfo({
                id: orderIds.current(),
                owner: _msgSender(),
                amount: marketItem.amount,
                paymentToken: marketItem.paymentToken,
                bidPrice: _bidPrice,
                expiredTime: _time,
                status: OrderStatus.PENDING,
                isWallet: false
            });

            marketItemOrderIds.increment();

            orders[orderIds.current()] = orderInfo;
            orderIdToItemId[orderIds.current()] = marketItemOrderIds.current();

            marketItemOrderOfOwners[_marketItemId][_msgSender()] = orderIds.current();
            marketItemOrders[marketItemOrderIds.current()] = marketItemOrder;

            _transferToken(marketItem.paymentToken, _bidPrice, _msgSender(), address(this));

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
     *  @notice Accept Order
     *
     * * Emit {acceptOrder}
     */
    function acceptOrder(uint256 _orderId) external nonReentrant whenNotPaused {
        require(_orderId <= orderIds.current() && _orderId > 0, "Invalid order");

        address _nftContractAddress;
        uint256 _tokenId;
        uint256 _amount;
        address _tokenTransfer;
        address _seller;

        OrderInfo storage orderInfo = orders[_orderId];
        if (orderInfo.isWallet) {
            WalletOrder memory walletOrder = walletOrders[orderIdToItemId[orderInfo.id]];

            require(walletOrder.to == _msgSender(), "Not the seller");

            _nftContractAddress = walletOrder.nftAddress;
            _tokenId = walletOrder.tokenId;
            _amount = orderInfo.amount;
            _tokenTransfer = walletOrder.to;
            _seller = walletOrder.to;
        } else {
            // Get Market Item
            MarketItem memory marketItem = marketplace.getMarketItemIdToMarketItem(
                marketItemOrders[orderIdToItemId[orderInfo.id]].marketItemId
            );
            require(marketItem.status == MarketItemStatus.LISTING, "Market Item is not available");
            require(marketItem.seller == _msgSender(), "Not the seller");

            // Update Market Item
            marketItem.status = MarketItemStatus.SOLD;
            marketItem.buyer = orderInfo.owner;
            marketplace.setMarketItemIdToMarketItem(marketItemOrders[orderIdToItemId[orderInfo.id]].marketItemId, marketItem);

            _nftContractAddress = marketItem.nftContractAddress;
            _tokenId = marketItem.tokenId;
            _amount = marketItem.amount;
            _tokenTransfer = address(marketplace);
            _seller = marketItem.seller;
        }

        require(orderInfo.status == OrderStatus.PENDING, "Order is not available");
        require(orderInfo.expiredTime >= block.timestamp, "Order is expired");

        // Update Order
        orderInfo.status = OrderStatus.ACCEPTED;
        marketplace.setIsBuyer(orderInfo.owner);

        _calAndTransfer(
            orderInfo.isWallet,
            orderInfo.bidPrice,
            orderInfo.paymentToken,
            _nftContractAddress,
            _tokenId,
            _amount,
            _tokenTransfer,
            _seller,
            orderInfo.owner
        );

        // Emit event
        emit AcceptedOrder(_orderId);
    }

    /**
     *  @notice Cancel Order
     *
     *  Emit {cancelOrder}
     */
    function cancelOrder(uint256 _orderId) external nonReentrant whenNotPaused {
        require(_orderId <= orderIds.current() && _orderId > 0, "Invalid order");

        OrderInfo storage orderInfo = orders[_orderId];

        require(orderInfo.owner == _msgSender(), "Not the owner of offer");
        require(orderInfo.status == OrderStatus.PENDING, "Order is not available");

        // Update order information
        orderInfo.status = OrderStatus.CANCELED;

        // Payback token to owner
        _transferToken(orderInfo.paymentToken, orderInfo.bidPrice, address(this), orderInfo.owner);

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
        uint256 startTime,
        uint256 endTime
    ) external nonReentrant whenNotPaused validMarketItemId(marketItemId) notZero(price) {
        MarketItem memory marketItem = marketplace.getMarketItemIdToMarketItem(marketItemId);
        require(marketItem.status == MarketItemStatus.LISTING, "Market Item is not available");
        require(marketItem.seller == _msgSender(), "You are not the seller");
        require(marketItem.endTime < block.timestamp, "Not expired yet");
        require(endTime > block.timestamp, "Invalid end time");

        marketItem.price = price;
        marketItem.status = MarketItemStatus.LISTING;
        marketItem.startTime = startTime;
        marketItem.endTime = endTime;
        marketplace.setMarketItemIdToMarketItem(marketItemId, marketItem);

        emit SoldAvailableItem(marketItemId, marketItem.price, marketItem.startTime, marketItem.endTime);
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

        NFTHelper.Type nftType = NFTHelper.getType(_nftAddress);
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

        emit CanceledSell(marketItemId);
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
        if (marketplace.isPrivate(marketItemId)) {
            require(
                marketplace.verify(marketItemId, proof, _msgSender()) && admin.isOwnedMetaCitizen(_msgSender()),
                "Sender is not in whitelist or not own meta citizen NFT"
            );
        }

        // update new buyer for martket item
        marketItem.buyer = _msgSender();
        marketItem.status = MarketItemStatus.SOLD;
        marketplace.setMarketItemIdToMarketItem(marketItemId, marketItem);
        marketplace.setIsBuyer(_msgSender());
        // Transfer token to contract
        _transferToken(marketItem.paymentToken, marketItem.price, _msgSender(), address(this));

        _calAndTransfer(
            false,
            marketItem.price,
            marketItem.paymentToken,
            marketItem.nftContractAddress,
            marketItem.tokenId,
            marketItem.amount,
            address(marketplace),
            marketItem.seller,
            _msgSender()
        );

        emit Bought(
            marketItemId,
            marketItem.nftContractAddress,
            marketItem.tokenId,
            marketItem.amount,
            marketItem.price,
            marketItem.buyer,
            marketItem.status
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

    function _calAndTransfer(
        bool _isWallet,
        uint256 _bidPrice,
        IERC20Upgradeable _paymentToken,
        address _nftContractAddress,
        uint256 _tokenId,
        uint256 _amount,
        address _tokenTransfer,
        address _seller,
        address _buyer
    ) private {
        uint256 _listingFee = marketplace.getListingFee(_bidPrice);
        // pay listing fee
        uint256 netSaleValue = _bidPrice - _listingFee;

        // Pay royalties from the amount actually received
        netSaleValue = _deduceRoyalties(_nftContractAddress, _tokenId, netSaleValue, _paymentToken);

        // Transfer Token from Buyer to Seller
        _transferToken(_paymentToken, netSaleValue, address(this), _seller);
        _transferToken(_paymentToken, _listingFee, address(this), admin.treasury());

        // Transfer NFT from Seller to Buyer
        if (_isWallet) {
            NFTHelper.transferNFTCall(_nftContractAddress, _tokenId, _amount, _tokenTransfer, _buyer);
        } else {
            marketplace.extTransferNFTCall(_nftContractAddress, _tokenId, _amount, _tokenTransfer, _buyer);
        }
    }

    function _updateOrder(
        OrderInfo storage existOrder,
        uint256 _bidPrice,
        uint256 _amount,
        uint256 _time
    ) private {
        bool isExcess = _bidPrice < existOrder.bidPrice;
        uint256 excessAmount = isExcess ? existOrder.bidPrice - _bidPrice : _bidPrice - existOrder.bidPrice;

        // Update
        existOrder.bidPrice = _bidPrice;
        existOrder.amount = _amount;
        existOrder.expiredTime = _time;

        // Transfer
        if (excessAmount > 0) {
            if (!isExcess) {
                _transferToken(existOrder.paymentToken, excessAmount, _msgSender(), address(this));
            } else {
                _transferToken(existOrder.paymentToken, excessAmount, address(this), _msgSender());
            }
        }

        // Emit Event
        emit UpdateOrder(_msgSender(), existOrder.id, existOrder.amount, existOrder.bidPrice, existOrder.expiredTime);
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

    /**
     *  @notice Get current market item order id
     *
     *  @dev    All caller can call this function.
     */
    function getCurrentWalletOrderId() external view returns (uint256) {
        return walletOrderIds.current();
    }

    /**
     *  @notice Get current market item order id
     *
     *  @dev    All caller can call this function.
     */
    function getCurrentMarketItemOrderId() external view returns (uint256) {
        return marketItemOrderIds.current();
    }

    /**
     *  @notice Get current order id
     *
     *  @dev    All caller can call this function.
     */
    function getCurrentOrderId() external view returns (uint256) {
        return orderIds.current();
    }
}
