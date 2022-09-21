// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC721/IERC721Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC1155/IERC1155Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/CountersUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/interfaces/IERC2981Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/structs/EnumerableSetUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC721/utils/ERC721HolderUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC1155/utils/ERC1155HolderUpgradeable.sol";
import "../Adminable.sol";

/**
 *  @title  Dev Marketplace Manager Contract
 *
 *  @author Metaversus Team
 *
 *  @notice This smart contract is the marketplace for exhange multiple non-fungiable token with standard ERC721 and ERC1155
 *          all action which user could sell, unsell, buy them.
 */
contract MarketPlaceManager is
    Initializable,
    ReentrancyGuardUpgradeable,
    OwnableUpgradeable,
    Adminable,
    PausableUpgradeable,
    ERC721HolderUpgradeable,
    ERC1155HolderUpgradeable
{
    using SafeERC20Upgradeable for IERC20Upgradeable;
    using CountersUpgradeable for CountersUpgradeable.Counter;
    using EnumerableSetUpgradeable for EnumerableSetUpgradeable.UintSet;
    using EnumerableSetUpgradeable for EnumerableSetUpgradeable.AddressSet;
    using AddressUpgradeable for address;
    CountersUpgradeable.Counter private _marketItemIds;
    CountersUpgradeable.Counter private _auctionCounter;

    bytes4 private constant _INTERFACE_ID_ERC2981 = type(IERC2981Upgradeable).interfaceId;
    bytes4 private constant _INTERFACE_ID_ERC721 = type(IERC721Upgradeable).interfaceId;
    bytes4 private constant _INTERFACE_ID_ERC1155 = type(IERC1155Upgradeable).interfaceId;
    uint256 public constant DENOMINATOR = 1e5;

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
    }

    struct WalletAsset {
        uint256 walletAssetId;
        address owner;
        address nftAddress;
        uint256 tokenId;
        string objectId;
    }

    struct BidAuction {
        uint256 auctionId;
        address bidder;
        address paymentToken;
        uint256 bidPrice;
        uint256 marketItemId;
        WalletAsset walletAsset;
        uint256 amount;
        uint256 expiredBidAuction;
    }

    /**
     *  @notice _permitedNFTs mapping from token address to isPermited status
     */
    EnumerableSetUpgradeable.AddressSet private _permitedNFTs;

    /**
     *  @notice _permitedPaymentToken mapping from token address to payment
     */
    EnumerableSetUpgradeable.AddressSet private _permitedPaymentToken;

    /**
     *  @notice treasury store the address of the TreasuryManager contract
     */
    address public treasury;

    /**
     *  @notice listingFee is fee user must pay for contract when create
     */
    uint256 public listingFee;

    /**
     *  @notice marketItemIdToMarketItem is mapping market ID to Market Item
     */
    mapping(uint256 => MarketItem) public marketItemIdToMarketItem;

    /**
     *  @notice assetIdToWalletAssetInfo is mapping asset ID to asset info
     */
    mapping(uint256 => WalletAsset) public assetIdToWalletAssetInfo;

    /**
     *  @notice auctionIdToBidAuctionInfo is mapping auction ID to auction info
     */
    mapping(uint256 => BidAuction) public auctionIdToBidAuctionInfo;

    /**
     *  @notice _marketItemOfOwner is mapping owner address to Market ID
     */
    mapping(address => EnumerableSetUpgradeable.UintSet) private _marketItemOfOwner;

    /**
     *  @notice _bidAuctionOfOwner is mapping owner address to auction ID
     */
    mapping(address => EnumerableSetUpgradeable.UintSet) private _bidAuctionOfOwner;

    /**
     *  @notice _auctionIdFromAssetOfOwner is mapping owner's asset address to auction ID
     */
    mapping(address => EnumerableSetUpgradeable.UintSet) private _auctionIdFromAssetOfOwner;

    event MarketItemCreated(
        uint256 indexed marketItemId,
        address nftContract,
        uint256 tokenId,
        uint256 amount,
        address indexed seller,
        uint256 price,
        uint256 nftType,
        uint256 startTime,
        uint256 endTime
    );
    event SetTreasury(address indexed oldTreasury, address indexed newTreasury);
    event RoyaltiesPaid(uint256 indexed tokenId, uint256 indexed value);
    event SoldAvailableItem(
        uint256 indexed marketItemId,
        address nftContract,
        uint256 tokenId,
        uint256 amount,
        address indexed seller,
        uint256 price,
        uint256 nftType,
        uint256 startTime,
        uint256 endTime
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
        uint256 endTime
    );
    event Bought(
        uint256 indexed marketItemId,
        address nftContract,
        uint256 tokenId,
        uint256 amount,
        address indexed buyer,
        uint256 price,
        uint256 nftType,
        uint256 startTime,
        uint256 endTime
    );
    event SetPause(bool isPause);
    event SetPermitedNFT(address nftAddress, bool allow);
    event MadeOffer(uint256 indexed auctionId);
    event Claimed(uint256 indexed auctionId);
    event AcceptedOffer(uint256 indexed auctionId);
    event UpdatedOffer(uint256 indexed auctionId);

    modifier validateId(uint256 id) {
        require(id <= _marketItemIds.current() && id > 0, "ERROR: market ID is not exist !");
        _;
    }

    /**
     *  @notice Initialize new logic contract.
     */
    function initialize(address _owner, address _treasury)
        public
        initializer
        notZeroAddress(_owner)
        notZeroAddress(_treasury)
    {
        Adminable.__Adminable_init();
        PausableUpgradeable.__Pausable_init();
        transferOwnership(_owner);
        treasury = _treasury;
        listingFee = 25e2; // 2.5%
        _pause();
    }

    receive() external payable {}

    /**
     *  @notice Set permit NFT
     */
    function setPermitedNFT(address _nftAddress, bool allow) external onlyOwnerOrAdmin notZeroAddress(_nftAddress) {
        if (allow) {
            _permitedNFTs.add(_nftAddress);
        } else if (isPermitedNFT(_nftAddress)) {
            _permitedNFTs.remove(_nftAddress);
        }

        emit SetPermitedNFT(_nftAddress, allow);
    }

    /**
     *  @notice Set permit payment token
     */
    function setPermitedPaymentToken(address _paymentToken, bool allow) external onlyOwnerOrAdmin {
        if (allow) {
            _permitedPaymentToken.add(_paymentToken);
        } else if (isPermitedPaymentToken(_paymentToken)) {
            _permitedPaymentToken.remove(_paymentToken);
        }

        emit SetPermitedNFT(_paymentToken, allow);
    }

    /**
     *  @notice set treasury to change TreasuryManager address.
     *
     *  @dev    Only owner or admin can call this function.
     */
    function setTreasury(address account) external onlyOwnerOrAdmin notZeroAddress(account) {
        address oldTreasury = treasury;
        treasury = account;
        emit SetTreasury(oldTreasury, treasury);
    }

    /**
     *  @notice Sell any nft avaiable in marketplace after metaversus manager mint
     *
     *  @dev    All caller can call this function.
     */
    function sellAvaiableInMarketplace(
        uint256 marketItemId,
        uint256 price,
        uint256 startTime,
        uint256 endTime,
        address paymentToken
    ) external nonReentrant validateId(marketItemId) notZeroAmount(price) whenNotPaused {
        MarketItem storage item = marketItemIdToMarketItem[marketItemId];
        require(item.endTime < block.timestamp, "ERROR: market item is not free !");
        require(item.seller == _msgSender(), "ERROR: sender is not owner this NFT");

        item.price = price;
        item.status = MarketItemStatus.LISTING;
        item.startTime = startTime;
        item.endTime = endTime;
        item.paymentToken = paymentToken;
        // self transfer fer get event logs
        _transferNFTCall(item.nftContractAddress, item.tokenId, item.amount, address(this), address(this));

        emit SoldAvailableItem(
            marketItemId,
            item.nftContractAddress,
            item.tokenId,
            item.amount,
            item.seller,
            item.price,
            item.nftType,
            item.startTime,
            item.endTime
        );
    }

    function callAfterMint(
        address nftAddress,
        uint256 tokenId,
        uint256 amount,
        uint256 price,
        address seller,
        uint256 startTime,
        uint256 endTime,
        address paymentToken
    ) external onlyOwnerOrAdmin notZeroAddress(nftAddress) notZeroAddress(seller) notZeroAmount(amount) {
        require(_msgSender().isContract(), "ERROR: only allow contract call !");
        // create market item to store data
        _createMarketInfo(nftAddress, tokenId, amount, price, seller, startTime, endTime, paymentToken);
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
        address paymentToken
    )
        external
        nonReentrant
        notZeroAddress(nftContractAddress)
        notZeroAmount(amount)
        notZeroAmount(price)
        notZeroAmount(startTime)
        notZeroAmount(endTime)
        whenNotPaused
    {
        require(endTime > block.timestamp, "ERROR: Only sell");
        // create market item to store data selling
        _createMarketInfo(nftContractAddress, tokenId, amount, price, _msgSender(), startTime, endTime, paymentToken);
        // check and update offer
        NftStandard nftType = _checkNftStandard(nftContractAddress);
        // 1. check sell all
        if (
            nftType == NftStandard.ERC721 ||
            (nftType == NftStandard.ERC1155 &&
                IERC1155Upgradeable(nftContractAddress).balanceOf(_msgSender(), tokenId) == amount)
        ) {
            for (uint256 i = 0; i < _auctionIdFromAssetOfOwner[_msgSender()].length(); i++) {
                // 1. find Offer[] need to update
                BidAuction storage validAuction = auctionIdToBidAuctionInfo[
                    _auctionIdFromAssetOfOwner[_msgSender()].at(i)
                ];
                if (
                    validAuction.walletAsset.owner == _msgSender() &&
                    validAuction.walletAsset.nftAddress == nftContractAddress &&
                    validAuction.walletAsset.tokenId == tokenId
                ) {
                    // 3. update Offer[]
                    validAuction.marketItemId = _marketItemIds.current();
                }
            }
        }

        // transfer nft to contract for selling
        _transferNFTCall(nftContractAddress, tokenId, amount, _msgSender(), address(this));
    }

    /**
     *  @notice Canncel any nft which selling
     *
     *  @dev    All caller can call this function.
     */
    function cancelSell(uint256 marketItemId) external nonReentrant validateId(marketItemId) whenNotPaused {
        MarketItem storage item = marketItemIdToMarketItem[marketItemId];
        require(item.status == MarketItemStatus.LISTING, "ERROR: NFT not available !");
        require(item.seller == _msgSender(), "ERROR: you are not the seller !");
        // update market item
        item.status = MarketItemStatus.CANCELED;
        _marketItemOfOwner[_msgSender()].remove(marketItemId);

        // check and update offer
        for (uint256 i = 0; i < _auctionIdFromAssetOfOwner[item.seller].length(); i++) {
            // 1. find Offer[] need to update
            BidAuction storage validAuction = auctionIdToBidAuctionInfo[_auctionIdFromAssetOfOwner[item.seller].at(i)];
            if (
                validAuction.walletAsset.owner == _msgSender() &&
                validAuction.walletAsset.nftAddress == item.nftContractAddress &&
                validAuction.walletAsset.tokenId == item.tokenId
            ) {
                // 2. update Offer[]
                validAuction.marketItemId = 0;
                validAuction.walletAsset.walletAssetId = validAuction.auctionId;
                validAuction.walletAsset.owner = _msgSender();
                validAuction.walletAsset.nftAddress = item.nftContractAddress;
                validAuction.walletAsset.tokenId = item.tokenId;
                validAuction.amount = item.amount;
            }
        }

        // transfer nft back seller
        _transferNFTCall(item.nftContractAddress, item.tokenId, item.amount, address(this), _msgSender());
        emit CanceledSelling(
            marketItemId,
            item.nftContractAddress,
            item.tokenId,
            item.amount,
            item.seller,
            item.price,
            item.nftType,
            item.startTime,
            item.endTime
        );
    }

    /**
     *  @notice Buy any nft which selling
     *
     *  @dev    All caller can call this function.
     */
    function buy(uint256 marketItemId) external payable nonReentrant validateId(marketItemId) whenNotPaused {
        MarketItem storage data = marketItemIdToMarketItem[marketItemId];
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
        _marketItemOfOwner[_msgSender()].remove(marketItemId);
        // request token
        _transferCall(data.paymentToken, data.price, _msgSender(), address(this));

        // pay listing fee
        uint256 netSaleValue = data.price - getListingFee(data.price);

        // pay 2.5% royalties from the amount actually received
        netSaleValue = _deduceRoyalties(data.nftContractAddress, data.tokenId, netSaleValue, data.paymentToken);

        // pay 97.5% of the amount actually received to seller
        _transferCall(data.paymentToken, netSaleValue, address(this), data.seller);

        // transfer nft to buyer
        _transferNFTCall(data.nftContractAddress, data.tokenId, data.amount, address(this), _msgSender());

        emit Bought(
            marketItemId,
            data.nftContractAddress,
            data.tokenId,
            data.amount,
            _msgSender(),
            data.price,
            data.nftType,
            data.startTime,
            data.endTime
        );
    }

    /**
     * @dev make Offer with any NFT in wallet
     */
    function makeOfferWalletAsset(
        string memory objectId,
        address paymentToken,
        uint256 bidPrice,
        address owner,
        address nftAddress,
        uint256 tokenId,
        uint256 amount,
        uint256 time
    ) external payable nonReentrant {
        require(_permitedPaymentToken.contains(paymentToken), "ERROR: payment token is not supported !");
        // check is Exist Offer
        for (uint256 i = 0; i < _bidAuctionOfOwner[_msgSender()].length(); i++) {
            BidAuction storage auction = auctionIdToBidAuctionInfo[_bidAuctionOfOwner[_msgSender()].at(i)];
            if (
                auction.walletAsset.nftAddress == nftAddress &&
                auction.walletAsset.tokenId == tokenId &&
                auction.walletAsset.owner == owner &&
                keccak256(abi.encodePacked((auction.walletAsset.objectId))) == keccak256(abi.encodePacked((objectId)))
            ) {
                if (bidPrice > auction.bidPrice) {
                    _transferCall(auction.paymentToken, bidPrice - auction.bidPrice, _msgSender(), address(this));
                } else {
                    _transferCall(auction.paymentToken, auction.bidPrice - bidPrice, address(this), _msgSender());
                }
                auction.paymentToken = paymentToken;
                auction.bidPrice = bidPrice;
                auction.expiredBidAuction = time;
                emit UpdatedOffer(auction.auctionId);
                return;
            }
        }
        // Create Order
        _auctionCounter.increment();
        uint256 auctionId = _auctionCounter.current();

        WalletAsset memory newWalletAsset = WalletAsset(auctionId, owner, nftAddress, tokenId, objectId);
        assetIdToWalletAssetInfo[auctionId] = newWalletAsset;

        _internalMakeOffer(paymentToken, bidPrice, time, amount, 0, newWalletAsset);
    }

    /**
     *  @notice make Offer Order any NFT in marketplace
     */
    function makeOffer(
        uint256 marketItemId,
        address paymentToken,
        uint256 bidPrice,
        uint256 time
    ) external payable nonReentrant validateId(marketItemId) {
        require(_permitedPaymentToken.contains(paymentToken), "ERROR: payment token is not supported !");
        // check is Exist Offer
        for (uint256 i = 0; i < _bidAuctionOfOwner[_msgSender()].length(); i++) {
            BidAuction storage auction = auctionIdToBidAuctionInfo[_bidAuctionOfOwner[_msgSender()].at(i)];
            if (auction.marketItemId == marketItemId) {
                if (bidPrice > auction.bidPrice) {
                    _transferCall(auction.paymentToken, bidPrice - auction.bidPrice, _msgSender(), address(this));
                } else {
                    _transferCall(auction.paymentToken, auction.bidPrice - bidPrice, address(this), _msgSender());
                }
                auction.paymentToken = paymentToken;
                auction.bidPrice = bidPrice;
                auction.expiredBidAuction = time;
                emit UpdatedOffer(auction.auctionId);
                return;
            }
        }
        // Create Order
        _auctionCounter.increment();

        WalletAsset memory newWalletAsset;
        _internalMakeOffer(paymentToken, bidPrice, time, 0, marketItemId, newWalletAsset);
    }

    /**
     *  @notice accept Offer
     */
    function acceptOffer(uint256 auctionId) external payable nonReentrant {
        BidAuction storage auctionInfo = auctionIdToBidAuctionInfo[auctionId];
        MarketItem storage marketItem = marketItemIdToMarketItem[auctionInfo.marketItemId];

        require(auctionInfo.expiredBidAuction >= block.timestamp, "ERROR: Overtime !");
        if (auctionInfo.marketItemId == 0) {
            require(_msgSender() == auctionInfo.walletAsset.owner, "ERROR: Invalid owner of asset !");
        } else {
            require(
                _msgSender() == marketItem.seller && marketItem.status == MarketItemStatus.LISTING,
                "ERROR: Invalid seller of asset !"
            );
        }

        // send nft to buyer
        if (auctionInfo.marketItemId == 0) {
            // Update status of market item
            marketItem.status = MarketItemStatus.SOLD;
            marketItem.buyer = auctionInfo.bidder;
            _transferNFTCall(
                auctionInfo.walletAsset.nftAddress,
                auctionInfo.walletAsset.tokenId,
                auctionInfo.amount,
                _msgSender(),
                auctionInfo.bidder
            );
        } else {
            _transferNFTCall(
                marketItem.nftContractAddress,
                marketItem.tokenId,
                marketItem.amount,
                address(this),
                auctionInfo.bidder
            );
        }

        // deduce royalty
        uint256 netSaleValue = (auctionInfo.marketItemId == 0)
            ? _deduceRoyalties(
                auctionInfo.walletAsset.nftAddress,
                auctionInfo.walletAsset.tokenId,
                auctionInfo.bidPrice,
                auctionInfo.paymentToken
            )
            : _deduceRoyalties(
                marketItem.nftContractAddress,
                marketItem.tokenId,
                auctionInfo.bidPrice,
                auctionInfo.paymentToken
            );

        // receive token payment
        _transferCall(
            auctionInfo.paymentToken,
            netSaleValue,
            address(this),
            auctionInfo.marketItemId == 0 ? auctionInfo.walletAsset.owner : marketItem.seller
        );

        // remove data form storage
        _bidAuctionOfOwner[auctionInfo.bidder].remove(auctionInfo.auctionId);
        _auctionIdFromAssetOfOwner[
            auctionInfo.marketItemId == 0
                ? auctionInfo.walletAsset.owner
                : marketItemIdToMarketItem[auctionInfo.marketItemId].seller
        ].remove(auctionInfo.auctionId);
        delete auctionIdToBidAuctionInfo[auctionInfo.auctionId];

        emit AcceptedOffer(auctionInfo.auctionId);
    }

    /**
     *  @notice Refund amount token for Bid
     */
    function refundBidAmount(uint256 auctionId) external {
        BidAuction storage auctionInfo = auctionIdToBidAuctionInfo[auctionId];
        require(auctionInfo.bidder == _msgSender(), "ERROR: Invalid bidder !");
        // refund all amount
        _transferCall(auctionInfo.paymentToken, auctionInfo.bidPrice, address(this), _msgSender());
        // remove record
        _bidAuctionOfOwner[auctionInfo.bidder].remove(auctionInfo.auctionId);
        _auctionIdFromAssetOfOwner[
            auctionInfo.marketItemId == 0
                ? auctionInfo.walletAsset.owner
                : marketItemIdToMarketItem[auctionInfo.marketItemId].seller
        ].remove(auctionInfo.auctionId);
        delete auctionIdToBidAuctionInfo[auctionInfo.auctionId];
        emit Claimed(auctionId);
    }

    /**
     *  @notice Set pause action
     */
    function setPause(bool isPause) external onlyOwnerOrAdmin {
        if (isPause) {
            _pause();
        } else _unpause();

        emit SetPause(isPause);
    }

    /**
     * @dev makeOffer internal function for handle store and update data
     */
    function _internalMakeOffer(
        address paymentToken,
        uint256 bidPrice,
        uint256 time,
        uint256 amount,
        uint256 marketItemId,
        WalletAsset memory walletAsset
    ) internal {
        uint256 auctionId = _auctionCounter.current();

        BidAuction memory newBid = BidAuction(
            auctionId,
            _msgSender(),
            paymentToken,
            bidPrice,
            marketItemId,
            walletAsset,
            amount,
            time
        );
        auctionIdToBidAuctionInfo[auctionId] = newBid;

        _bidAuctionOfOwner[_msgSender()].add(auctionId);
        _auctionIdFromAssetOfOwner[
            marketItemId == 0 ? walletAsset.owner : marketItemIdToMarketItem[marketItemId].seller
        ].add(auctionId);

        // send offer money
        _transferCall(paymentToken, bidPrice, _msgSender(), address(this));
        emit MadeOffer(auctionId);
    }

    /**
     *  @notice Transfer nft call
     */
    function _transferNFTCall(
        address nftContractAddress,
        uint256 tokenId,
        uint256 amount,
        address from,
        address to
    ) internal {
        NftStandard nftType = _checkNftStandard(nftContractAddress);
        require(nftType != NftStandard.NONE, "ERROR: NFT address is compatible !");

        if (nftType == NftStandard.ERC721) {
            IERC721Upgradeable(nftContractAddress).safeTransferFrom(from, to, tokenId);
        } else {
            IERC1155Upgradeable(nftContractAddress).safeTransferFrom(from, to, tokenId, amount, "");
        }
    }

    /**
     *  @notice Transfer call
     */
    function _transferCall(
        address paymentToken,
        uint256 amount,
        address from,
        address to
    ) internal {
        if (paymentToken == address(0)) {
            if (to == address(this)) {
                require(msg.value == amount, "Failed to send into contract");
            } else {
                (bool sent, ) = payable(to).call{ value: amount }("");
                require(sent, "Failed to send native");
            }
        } else {
            if (to == address(this)) {
                IERC20Upgradeable(paymentToken).safeTransferFrom(from, to, amount);
            } else {
                IERC20Upgradeable(paymentToken).transfer(to, amount);
            }
        }
    }

    /**
     *  @notice Check standard without error when not support function supportsInterface
     */
    function is721(address _contract) private returns (bool) {
        (bool success, ) = _contract.call(abi.encodeWithSignature("supportsInterface(bytes4)", _INTERFACE_ID_ERC721));

        return success && IERC721Upgradeable(_contract).supportsInterface(_INTERFACE_ID_ERC721);
    }

    /**
     *  @notice Check standard without error when not support function supportsInterface
     */
    function is1155(address _contract) private returns (bool) {
        (bool success, ) = _contract.call(abi.encodeWithSignature("supportsInterface(bytes4)", _INTERFACE_ID_ERC1155));

        return success && IERC1155Upgradeable(_contract).supportsInterface(_INTERFACE_ID_ERC1155);
    }

    /**
     *  @notice Check ruyalty without error when not support function supportsInterface
     */
    function isRoyalty(address _contract) private returns (bool) {
        (bool success, ) = _contract.call(abi.encodeWithSignature("supportsInterface(bytes4)", _INTERFACE_ID_ERC2981));

        return success && IERC2981Upgradeable(_contract).supportsInterface(_INTERFACE_ID_ERC2981);
    }

    /**
     *  @notice Check standard of nft contract address
     */
    function _checkNftStandard(address _contract) private returns (NftStandard) {
        if (is721(_contract)) {
            return NftStandard.ERC721;
        }
        if (is1155(_contract)) {
            return NftStandard.ERC1155;
        }

        return NftStandard.NONE;
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
        address paymentToken
    ) private returns (uint256 netSaleAmount) {
        // Get amount of royalties to pays and recipient
        if (isRoyalty(nftContractAddress)) {
            (address royaltiesReceiver, uint256 royaltiesAmount) = getRoyaltyInfo(
                nftContractAddress,
                tokenId,
                grossSaleValue
            );

            // Deduce royalties from sale value
            uint256 netSaleValue = grossSaleValue - royaltiesAmount;
            // Transfer royalties to rightholder if not zero
            if (royaltiesAmount > 0) {
                _transferCall(paymentToken, royaltiesAmount, address(this), royaltiesReceiver);
            }
            // Broadcast royalties payment
            emit RoyaltiesPaid(tokenId, royaltiesAmount);
            return netSaleValue;
        }
        return grossSaleValue;
    }

    /**
     *  @notice Create market info with data
     *
     *  @dev    All caller can call this function.
     */
    function _createMarketInfo(
        address _nftAddress,
        uint256 _tokenId,
        uint256 _amount,
        uint256 _price,
        address _seller,
        uint256 _startTime,
        uint256 _endTime,
        address _paymentToken
    ) private {
        require(isPermitedNFT(_nftAddress), "ERROR: NFT not allow to sell on marketplace !");
        NftStandard nftType = _checkNftStandard(_nftAddress);
        require(nftType != NftStandard.NONE, "ERROR: NFT address is compatible !");

        _marketItemIds.increment();
        uint256 marketItemId = _marketItemIds.current();

        uint256 price;
        uint256 startTime;
        uint256 endTime;

        if (_startTime >= block.timestamp && _endTime > _startTime && _price > 0) {
            price = _price;
            endTime = _endTime;
            startTime = _startTime;
        }
        marketItemIdToMarketItem[marketItemId] = MarketItem(
            marketItemId,
            _nftAddress,
            _tokenId,
            nftType == NftStandard.ERC1155 ? _amount : 1,
            price,
            uint256(nftType),
            _seller,
            address(0),
            MarketItemStatus.LISTING,
            startTime,
            endTime,
            _permitedPaymentToken.contains(_paymentToken) ? _paymentToken : address(0)
        );

        _marketItemOfOwner[_seller].add(marketItemId);

        emit MarketItemCreated(
            marketItemId,
            _nftAddress,
            _tokenId,
            nftType == NftStandard.ERC1155 ? _amount : 1,
            _seller,
            price,
            uint256(nftType),
            startTime,
            endTime
        );
    }

    /**
     *  @notice Get all params
     */
    function getAllParams()
        external
        view
        returns (
            address,
            uint256,
            uint256
        )
    {
        return (treasury, listingFee, DENOMINATOR);
    }

    /**
     * @dev Get Latest Market Item by the token id
     */
    function getLatestMarketItemByTokenId(address nftAddress, uint256 tokenId)
        external
        view
        returns (MarketItem memory, bool)
    {
        uint256 itemsCount = _marketItemIds.current();

        for (uint256 i = itemsCount; i > 0; i--) {
            MarketItem memory item = marketItemIdToMarketItem[i];
            if (item.tokenId != tokenId || item.nftContractAddress != nftAddress) continue;
            return (item, true);
        }
        // return empty value
        return (marketItemIdToMarketItem[0], false);
    }

    /**
     *  @notice Fetch information Market Item by Market ID
     *
     *  @dev    All caller can call this function.
     */
    function fetchMarketItemsByMarketID(uint256 marketId) external view returns (MarketItem memory) {
        return marketItemIdToMarketItem[marketId];
    }

    /**
     *  @notice Fetch all Market Items by owner address
     *
     *  @dev    All caller can call this function.
     */
    function fetchMarketItemsByAddress(address account) external view returns (MarketItem[] memory) {
        MarketItem[] memory data = new MarketItem[](_marketItemOfOwner[account].length());
        for (uint256 i = 0; i < _marketItemOfOwner[account].length(); i++) {
            data[i] = marketItemIdToMarketItem[_marketItemOfOwner[account].at(i)];
        }
        return data;
    }

    /**
     *  @notice Fetch all nft in marketplace contract
     *
     *  @dev    All caller can call this function.
     */
    function fetchAvailableMarketItems() external view returns (MarketItem[] memory) {
        uint256 itemsCount = _marketItemIds.current();

        MarketItem[] memory marketItems = new MarketItem[](itemsCount);
        uint256 currentIndex = 0;
        for (uint256 i = 0; i < itemsCount; i++) {
            MarketItem memory item = marketItemIdToMarketItem[i + 1];
            marketItems[currentIndex] = item;
            currentIndex += 1;
        }

        return marketItems;
    }

    /**
     *  @notice Fetch all permited nft
     */
    function fetchAllPermitedNFTs() external view returns (address[] memory) {
        address[] memory nfts = new address[](_permitedNFTs.length());
        for (uint256 i = 0; i < _permitedNFTs.length(); i++) {
            nfts[i] = _permitedNFTs.at(i);
        }

        return nfts;
    }

    /**
     *  @notice Get current market item id
     *
     *  @dev    All caller can call this function.
     */
    function getCurrentMarketItem() external view returns (uint256) {
        return _marketItemIds.current();
    }

    /**
     *  @notice Check account bought or not to check in staking pool
     */
    function wasBuyer(address account) external view returns (bool) {
        for (uint256 i = 0; i < _marketItemIds.current(); i++) {
            MarketItem memory item = marketItemIdToMarketItem[i + 1];
            if (account == item.buyer) return true;
        }
        return false;
    }

    /**
     *  @notice check and get Royalties information
     *
     *  @dev    All caller can call this function.
     */
    function getRoyaltyInfo(
        address _nftAddr,
        uint256 _tokenId,
        uint256 _salePrice
    ) public view returns (address, uint256) {
        (address royaltiesReceiver, uint256 royaltiesAmount) = IERC2981Upgradeable(_nftAddr).royaltyInfo(
            _tokenId,
            _salePrice
        );
        return (royaltiesReceiver, royaltiesAmount);
    }

    /**
     *  @notice Return permit token status
     */
    function isPermitedNFT(address _nftAddress) public view returns (bool) {
        return _permitedNFTs.contains(_nftAddress);
    }

    /**
     *  @notice Return permit token payment
     */
    function isPermitedPaymentToken(address token) public view returns (bool) {
        return _permitedPaymentToken.contains(token);
    }

    /**
     *  @notice get Listing fee
     *
     *  @dev    All caller can call this function.
     */
    function getListingFee(uint256 amount) public view returns (uint256) {
        return (amount * listingFee) / DENOMINATOR;
    }

    /**
     *  @notice Check standard
     */
    function checkStandard(address _contract) public view returns (uint256) {
        if (IERC721Upgradeable(_contract).supportsInterface(_INTERFACE_ID_ERC721)) {
            return uint256(NftStandard.ERC721);
        }
        if (IERC1155Upgradeable(_contract).supportsInterface(_INTERFACE_ID_ERC1155)) {
            return uint256(NftStandard.ERC1155);
        }
        return uint256(NftStandard.NONE);
    }

    /**
     *  @notice get data of offer order of bidder
     */
    function getOfferOrderOfBidder(address bidder) public view returns (BidAuction[] memory) {
        BidAuction[] memory data = new BidAuction[](_bidAuctionOfOwner[bidder].length());
        for (uint256 i = 0; i < _bidAuctionOfOwner[bidder].length(); i++) {
            data[i] = auctionIdToBidAuctionInfo[_bidAuctionOfOwner[bidder].at(i)];
        }
        return data;
    }

    /**
     * @dev See {IERC721Receiver-onERC721Received}.
     *
     * Always returns `IERC721Receiver.onERC721Received.selector`.
     */
    function onERC721Received(
        address,
        address,
        uint256,
        bytes memory
    ) public pure override returns (bytes4) {
        return this.onERC721Received.selector;
    }

    /**
     * @dev See {IERC1155Receiver-onERC1155Received}.
     *
     * Always returns `IERC1155Receiver.onERC1155Received.selector`.
     */
    function onERC1155Received(
        address,
        address,
        uint256,
        uint256,
        bytes memory
    ) public pure override returns (bytes4) {
        return this.onERC1155Received.selector;
    }
}
