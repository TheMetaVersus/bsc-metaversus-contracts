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
    mapping(uint256 => WalletOrder) walletOrders;

    /**
     *  @notice Mapping from MarketItemId to to Order
     *  @dev OrderID -> MarketItemOrder
     */
    mapping(uint256 => MarketItemOrder) marketItemOrders;

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
        uint256 status,
        uint256 startTime,
        uint256 endTime,
        address paymentToken,
        bool isPrivate
    );
    event RoyaltiesPaid(uint256 indexed tokenId, uint256 indexed value);
    event MadeWalletOrder(
        uint256 indexed orderId,
        address owner,
        address to,
        address nftAddress,
        uint256 tokenId,
        uint256 amount,
        address paymentToken,
        uint256 bidPrice,
        uint256 expiredTime,
        uint256 status
    );
    event MadeMaketItemOrder(
        uint256 indexed orderId,
        address nftContractAddress,
        uint256 tokenId,
        uint256 amount,
        uint256 price,
        uint256 nftType,
        address seller,
        address buyer,
        uint256 marketItemStatus,
        uint256 startTime,
        uint256 endTime,
        address marketItemPaymentToken,
        bool isPrivate,
        address owner,
        uint256 marketItemId,
        address marketItemOrderPaymentToken,
        uint256 bidPrice,
        uint256 expiredTime,
        uint256 marketItemOrderStatus
    );
    event AcceptedWalletOrder(
        uint256 indexed orderId,
        address owner,
        address to,
        address nftAddress,
        uint256 tokenId,
        uint256 amount,
        address paymentToken,
        uint256 bidPrice,
        uint256 expiredTime,
        uint256 status
    );
    event AcceptedMarketItemOffer(
        uint256 indexed orderId,
        address nftContractAddress,
        uint256 tokenId,
        uint256 amount,
        uint256 price,
        uint256 nftType,
        address seller,
        address buyer,
        uint256 marketItemStatus,
        uint256 startTime,
        uint256 endTime,
        address marketItemPaymentToken,
        bool isPrivate,
        address owner,
        uint256 marketItemId,
        address marketItemOrderPaymentToken,
        uint256 bidPrice,
        uint256 expiredTime,
        uint256 marketItemOrderStatus
    );
    event CanceledWalletOrder(
        uint256 indexed orderId,
        address owner,
        address to,
        address nftAddress,
        uint256 tokenId,
        uint256 amount,
        address paymentToken,
        uint256 bidPrice,
        uint256 expiredTime,
        uint256 status
    );
    event CanceledMarketItemOrder(
        uint256 indexed orderId,
        address owner,
        uint256 marketItemId,
        IERC20Upgradeable paymentToken,
        uint256 bidPrice,
        uint256 expiredTime,
        OrderStatus status
    );

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
        require(admin.isOwnedMetaCitizen(_msgSender()), "Require own MetaCitizen NFT");
        require(NFTHelper.isTokenExist(_nftAddress, _tokenId), "Token is not existed");
        require(_time > block.timestamp, "Invalid order time");

        // Create Order
        WalletOrder memory walletOrder = WalletOrder({
            owner: _msgSender(),
            to: _to,
            nftAddress: _nftAddress,
            tokenId: _tokenId,
            amount: _amount,
            paymentToken: _paymentToken,
            bidPrice: _bidPrice,
            expiredTime: _time,
            status: OrderStatus.PENDING
        });

        walletOrderIds.increment();
        walletOrders[walletOrderIds.current()] = walletOrder;
        tokenIdToWalletOrderIds[_tokenId].add(walletOrderIds.current());

        _transferToken(_paymentToken, _bidPrice, walletOrder.owner, address(this));

        emit MadeWalletOrder(
            walletOrderIds.current(),
            walletOrder.owner,
            walletOrder.to,
            walletOrder.nftAddress,
            walletOrder.tokenId,
            walletOrder.amount,
            address(walletOrder.paymentToken),
            walletOrder.bidPrice,
            walletOrder.expiredTime,
            uint256(walletOrder.status)
        );
    }

    /**
     *  @notice Accept Wallet Order
     *
     * * Emit {AcceptedWalletOrder}
     */
    function acceptWalletOrder(uint256 _orderId) external payable nonReentrant whenNotPaused {
        WalletOrder storage walletOrder = walletOrders[_orderId];
        require(walletOrder.owner != address(0), "Invalid order");
        require(walletOrder.to == _msgSender(), "Not the seller");
        require(walletOrder.status == OrderStatus.PENDING, "Order is not available");
        require(walletOrder.expiredTime >= block.timestamp, "Order is expired");

        // Update order information
        walletOrder.status = OrderStatus.ACCEPTED;

        // Transfer Token from Buyer to Seller
        _transferToken(walletOrder.paymentToken, walletOrder.bidPrice, address(this), walletOrder.to);

        // Transfer NFT from Seller to Buyer
        NFTHelper.transferNFTCall(
            walletOrder.nftAddress,
            walletOrder.tokenId,
            walletOrder.amount,
            walletOrder.to,
            walletOrder.owner
        );

        emit AcceptedWalletOrder(
            _orderId,
            walletOrder.owner,
            walletOrder.to,
            walletOrder.nftAddress,
            walletOrder.tokenId,
            walletOrder.amount,
            address(walletOrder.paymentToken),
            walletOrder.bidPrice,
            walletOrder.expiredTime,
            uint256(walletOrder.status)
        );
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
        uint256 _time
    ) external payable nonReentrant whenNotPaused validPaymentToken(_paymentToken) notZero(_bidPrice) {
        require(admin.isOwnedMetaCitizen(_msgSender()), "Require own MetaCitizen NFT");
        require(_time > block.timestamp, "Invalid order time");

        // Check Market Item
        MarketItem memory marketItem = marketplace.getMarketItemIdToMarketItem(_marketItemId);
        require(marketItem.status == MarketItemStatus.LISTING, "Market Item is not available");
        require(marketItem.endTime < block.timestamp, "Not expired yet");

        // Create Order
        MarketItemOrder memory marketItemOrder = MarketItemOrder({
            owner: _msgSender(),
            marketItemId: _marketItemId,
            paymentToken: _paymentToken,
            bidPrice: _bidPrice,
            expiredTime: _time,
            status: OrderStatus.PENDING
        });

        marketItemOrderIds.increment();
        marketItemOrders[marketItemOrderIds.current()] = marketItemOrder;
        marketItemIdToMarketItemOrderIds[marketItem.tokenId].add(marketItemOrderIds.current());

        _transferToken(_paymentToken, _bidPrice, marketItemOrder.owner, address(this));

        emit MadeMaketItemOrder(
            marketItemOrderIds.current(),
            marketItem.nftContractAddress,
            marketItem.tokenId,
            marketItem.amount,
            marketItem.price,
            uint(marketItem.nftType),
            marketItem.seller,
            marketItem.buyer,
            uint(marketItem.status),
            marketItem.startTime,
            marketItem.endTime,
            address(marketItem.paymentToken),
            marketItem.isPrivate,
            marketItemOrder.owner,
            marketItemOrder.marketItemId,
            address(marketItemOrder.paymentToken),
            marketItemOrder.bidPrice,
            marketItemOrder.expiredTime,
            uint256(marketItemOrder.status)
        );
    }

    /**
     *  @notice Accept MarketItem Order
     *
     *  Emit {AcceptedMarketItemOffer}
     */
    function acceptMarketItemOrder(uint256 _orderId) external payable nonReentrant whenNotPaused {
        // Get Order
        MarketItemOrder storage marketItemOrder = marketItemOrders[_orderId];
        require(marketItemOrder.owner != address(0), "Invalid order");
        require(marketItemOrder.status == OrderStatus.PENDING, "Order is not available");
        require(marketItemOrder.expiredTime >= block.timestamp, "Order is expired");

        // Get Market Item
        MarketItem memory marketItem = marketplace.getMarketItemIdToMarketItem(marketItemOrder.marketItemId);
        require(marketItem.status == MarketItemStatus.LISTING, "Market Item is not available");

        // Update Order
        marketItemOrder.status = OrderStatus.ACCEPTED;

        // Update Market Item
        marketItem.status = MarketItemStatus.SOLD;
        marketItem.buyer = marketItemOrder.owner;
        marketplace.setMarketItemIdToMarketItem(marketItemOrder.marketItemId, marketItem);

        // Pay listing fee
        uint256 netSaleValue = marketItem.price - marketplace.getListingFee(marketItem.price);

        // Pay 2.5% royalties from the amount actually received
        netSaleValue = _deduceRoyalties(
            marketItem.nftContractAddress,
            marketItem.tokenId,
            netSaleValue,
            marketItem.paymentToken
        );

        // Transfer Token from Buyer to Seller
        _transferToken(marketItemOrder.paymentToken, netSaleValue, address(this), marketItem.seller);

        // Transfer NFT from Seller to Buyer
        marketplace.extTransferNFTCall(
            marketItem.nftContractAddress,
            marketItem.tokenId,
            marketItem.amount,
            marketItem.seller,
            marketItem.buyer
        );

        emit AcceptedMarketItemOffer(
            _orderId,
            marketItem.nftContractAddress,
            marketItem.tokenId,
            marketItem.amount,
            marketItem.price,
            uint(marketItem.nftType),
            marketItem.seller,
            marketItem.buyer,
            uint(marketItem.status),
            marketItem.startTime,
            marketItem.endTime,
            address(marketItem.paymentToken),
            marketItem.isPrivate,
            marketItemOrder.owner,
            marketItemOrder.marketItemId,
            address(marketItemOrder.paymentToken),
            marketItemOrder.bidPrice,
            marketItemOrder.expiredTime,
            uint256(marketItemOrder.status)
        );
    }

    /**
     *  @notice Cancel Wallet Order
     *
     *  Emit {CanceledWalletOrder}
     */
    function cancelWalletOrder(uint256 _orderId) external whenNotPaused {
        WalletOrder storage walletOrder = walletOrders[_orderId];
        require(walletOrder.owner != address(0), "Invalid order");
        require(walletOrder.owner == _msgSender(), "Not the buyer");
        require(walletOrder.status == OrderStatus.PENDING, "Order is not available");

        // Update order information
        walletOrder.status = OrderStatus.CANCELED;

        // Payback token to owner
        _transferToken(walletOrder.paymentToken, walletOrder.bidPrice, address(this), walletOrder.owner);

        emit CanceledWalletOrder(
            _orderId,
            walletOrder.owner,
            walletOrder.to,
            walletOrder.nftAddress,
            walletOrder.tokenId,
            walletOrder.amount,
            address(walletOrder.paymentToken),
            walletOrder.bidPrice,
            walletOrder.expiredTime,
            uint256(walletOrder.status)
        );
    }

    /**
     *  @notice Cancel Wallet Order
     *
     *  Emit {CanceledMarketItemOrder}
     */
    function cancelMarketItemOrder(uint256 _orderId) external whenNotPaused {
        // Get Order
        MarketItemOrder storage marketItemOrder = marketItemOrders[_orderId];
        require(marketItemOrder.owner != address(0), "Invalid order");
        require(marketItemOrder.status == OrderStatus.PENDING, "Order is not available");

        // Update Order
        marketItemOrder.status = OrderStatus.CANCELED;

        // Payback token to owner
        _transferToken(marketItemOrder.paymentToken, marketItemOrder.bidPrice, address(this), marketItemOrder.owner);

        emit CanceledMarketItemOrder(
            _orderId,
            marketItemOrder.owner,
            marketItemOrder.marketItemId,
            marketItemOrder.paymentToken,
            marketItemOrder.bidPrice,
            marketItemOrder.expiredTime,
            marketItemOrder.status
        );
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
    ) external nonReentrant whenNotPaused notZero(price) notZero(amount) {
        MarketItem memory marketItem = marketplace.getMarketItemIdToMarketItem(marketItemId);
        require(marketItem.status == MarketItemStatus.LISTING, "Market Item is not available");
        require(marketItem.seller == _msgSender(), "You are not the seller");
        require(marketItem.endTime < block.timestamp, "Not expired yet");

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
            uint(marketItem.status),
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

        // transfer nft to contract for selling
        marketplace.extTransferNFTCall(_nftAddress, _tokenId, _amount, _msgSender(), address(marketplace));

        // TODO Emit event
        // emit Sold(marketItemId, marketItem)
    }

    /**
     *  @notice Canncel any nft which selling
     *
     *  @dev    All caller can call this function.
     *
     *  Emit {CanceledSell}
     */
    function cancelSell(uint256 marketItemId) external nonReentrant whenNotPaused {
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
            uint(marketItem.status),
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
    function buy(uint256 marketItemId, bytes32[] calldata proof) external payable nonReentrant whenNotPaused {
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

        // Pay listing fee
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
            uint(marketItem.status),
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
                _transferToken(paymentToken, royaltiesAmount, address(this), royaltiesReceiver);
            }
            // Broadcast royalties payment
            emit RoyaltiesPaid(tokenId, royaltiesAmount);
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
}
