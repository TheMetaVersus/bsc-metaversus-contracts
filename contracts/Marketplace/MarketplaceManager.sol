// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

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
import "@openzeppelin/contracts-upgradeable/utils/math/SafeMathUpgradeable.sol";
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
    using SafeMathUpgradeable for uint256;
    using AddressUpgradeable for address;
    CountersUpgradeable.Counter private _marketItemIds;
    CountersUpgradeable.Counter private _soldCounter;
    CountersUpgradeable.Counter private _cancelCounter;

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
        address seller;
        address buyer;
        uint256 price;
        uint256 endTime;
        MarketItemStatus status;
        uint256 nftType;
    }

    /**
     *  @notice paymentToken IERC20Upgradeable is interface of payment token
     */
    IERC20Upgradeable public paymentToken;

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
     *  @notice marketItemOfOwner is mapping owner address to Market ID
     */
    mapping(address => EnumerableSetUpgradeable.UintSet) private marketItemOfOwner;

    event MarketItemCreated(
        uint256 indexed marketItemId,
        address indexed nftContract,
        uint256 indexed tokenId,
        uint256 amount,
        address seller,
        address owner,
        uint256 price,
        uint256 endTime
    );
    event SetTreasury(address indexed oldTreasury, address indexed newTreasury);
    event RoyaltiesPaid(uint256 indexed tokenId, uint256 indexed value);
    event SoldAvailableItem(uint256 indexed marketItemId, uint256 indexed price);
    event CanceledSelling(uint256 indexed marketItemId);
    event Bought(uint256 indexed marketItemId, MarketItem data, uint256 indexed netSaleValue);

    modifier validateId(uint256 id) {
        require(id <= _marketItemIds.current() && id > 0, "ERROR: market ID is not exist !");
        _;
    }

    /**
     *  @notice Pause action
     */
    function pause() public onlyOwner {
        _pause();
    }

    /**
     *  @notice Unpause action
     */
    function unpause() public onlyOwner {
        _unpause();
    }

    /**
     *  @notice Initialize new logic contract.
     */
    function initialize(
        address _owner,
        address _paymentToken,
        address _treasury
    ) public initializer {
        Adminable.__Adminable_init();
        PausableUpgradeable.__Pausable_init();
        paymentToken = IERC20Upgradeable(_paymentToken);
        transferOwnership(_owner);
        treasury = _treasury;
        listingFee = 25e2; // 2.5%
        pause();
    }

    /**
     *  @notice Get all params
     */
    function getAllParams()
        external
        view
        returns (
            address,
            address,
            uint256,
            uint256
        )
    {
        return (treasury, address(paymentToken), listingFee, DENOMINATOR);
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
     *  @notice get Listing fee
     *
     *  @dev    All caller can call this function.
     */
    function getListingFee(uint256 amount) public view returns (uint256) {
        return amount.mul(listingFee).div(DENOMINATOR);
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
     *  @notice Check standard without error when not support function supportsInterface
     */
    function is721(address _contract) private returns (bool) {
        (bool success, ) = _contract.call(
            abi.encodeWithSignature("supportsInterface(bytes4)", _INTERFACE_ID_ERC721)
        );

        return success && IERC721Upgradeable(_contract).supportsInterface(_INTERFACE_ID_ERC721);
    }

    /**
     *  @notice Check standard without error when not support function supportsInterface
     */
    function is1155(address _contract) private returns (bool) {
        (bool success, ) = _contract.call(
            abi.encodeWithSignature("supportsInterface(bytes4)", _INTERFACE_ID_ERC1155)
        );

        return success && IERC1155Upgradeable(_contract).supportsInterface(_INTERFACE_ID_ERC1155);
    }

    /**
     *  @notice Check ruyalty without error when not support function supportsInterface
     */
    function isRoyalty(address _contract) private returns (bool) {
        (bool success, ) = _contract.call(
            abi.encodeWithSignature("supportsInterface(bytes4)", _INTERFACE_ID_ERC2981)
        );

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
     *  @notice Transfers royalties to the rightsowner if applicable
     */
    function _deduceRoyalties(
        address nftContractAddress,
        uint256 tokenId,
        uint256 grossSaleValue
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
                paymentToken.safeTransfer(royaltiesReceiver, royaltiesAmount);
            }
            // Broadcast royalties payment
            emit RoyaltiesPaid(tokenId, royaltiesAmount);
            return netSaleValue;
        }
        return grossSaleValue;
    }

    /**
     *  @notice Sell any nft avaiable in marketplace after metaversus manager mint
     *
     *  @dev    All caller can call this function.
     */
    function sellAvaiableInMarketplace(
        uint256 marketItemId,
        uint256 price,
        uint256 time
    ) external nonReentrant validateId(marketItemId) notZeroAmount(price) whenNotPaused {
        MarketItem storage item = marketItemIdToMarketItem[marketItemId];
        require(item.endTime < block.timestamp, "ERROR: market item is not free !");
        require(item.seller == _msgSender(), "ERROR: sender is not owner this NFT");

        item.price = price;
        item.status = MarketItemStatus.LISTING;
        item.endTime = time;
        emit SoldAvailableItem(marketItemId, price);
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
        uint256 _grossSaleValue,
        address _seller,
        uint256 _time
    ) private {
        NftStandard nftType = _checkNftStandard(_nftAddress);
        require(nftType != NftStandard.NONE, "ERROR: NFT address is compatible !");

        _marketItemIds.increment();
        uint256 marketItemId = _marketItemIds.current();

        uint256 price;
        uint256 time;
        uint256 amount = 1;
        if (nftType == NftStandard.ERC1155) {
            amount = _amount;
        }
        if (_time > block.timestamp && _grossSaleValue > 0) {
            price = _grossSaleValue;
            time = _time;
        }
        marketItemIdToMarketItem[marketItemId] = MarketItem(
            marketItemId,
            _nftAddress,
            _tokenId,
            amount,
            _seller,
            address(0),
            price,
            time,
            MarketItemStatus.LISTING,
            uint256(nftType)
        );

        marketItemOfOwner[_seller].add(marketItemId);

        emit MarketItemCreated(
            marketItemId,
            _nftAddress,
            _tokenId,
            amount,
            _seller,
            address(0),
            price,
            time
        );
    }

    function callAfterMint(
        address _nftAddress,
        uint256 _tokenId,
        uint256 _amount,
        uint256 _grossSaleValue,
        address _seller,
        uint256 _time
    )
        external
        onlyOwnerOrAdmin
        notZeroAddress(_nftAddress)
        notZeroAddress(_seller)
        notZeroAmount(_amount)
    {
        require(_msgSender().isContract(), "ERROR: not allowed !");
        // create market item to store data
        _createMarketInfo(_nftAddress, _tokenId, _amount, _grossSaleValue, _seller, _time);
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
        uint256 grossSaleValue,
        uint256 endTime
    )
        external
        nonReentrant
        notZeroAddress(nftContractAddress)
        notZeroAmount(amount)
        notZeroAmount(grossSaleValue)
        notZeroAmount(endTime)
        whenNotPaused
    {
        require(endTime > block.timestamp, "ERROR: Only sell");
        // create market item to store data selling
        _createMarketInfo(
            nftContractAddress,
            tokenId,
            amount,
            grossSaleValue,
            _msgSender(),
            endTime
        );
        // transfer nft to contract for selling
        _transferNFTCall(nftContractAddress, tokenId, amount, _msgSender(), address(this));
    }

    /**
     *  @notice Canncel any nft which selling
     *
     *  @dev    All caller can call this function.
     */
    function cancelSell(uint256 marketItemId)
        external
        nonReentrant
        validateId(marketItemId)
        whenNotPaused
    {
        MarketItem storage item = marketItemIdToMarketItem[marketItemId];
        require(item.status == MarketItemStatus.LISTING, "ERROR: NFT not available !");
        require(item.seller == _msgSender(), "ERROR: you are not the seller !");
        // update market item
        item.status = MarketItemStatus.CANCELED;
        marketItemOfOwner[_msgSender()].remove(marketItemId);
        _cancelCounter.increment();
        // transfer nft back seller
        _transferNFTCall(
            item.nftContractAddress,
            item.tokenId,
            item.amount,
            address(this),
            _msgSender()
        );

        emit CanceledSelling(marketItemId);
    }

    /**
     *  @notice Buy any nft which selling
     *
     *  @dev    All caller can call this function.
     */
    function buy(uint256 marketItemId)
        external
        nonReentrant
        validateId(marketItemId)
        whenNotPaused
    {
        MarketItem storage data = marketItemIdToMarketItem[marketItemId];
        require(
            data.status == MarketItemStatus.LISTING && data.endTime > block.timestamp,
            "ERROR: NFT is not selling"
        );

        // update new buyer for martket item
        data.buyer = _msgSender();
        data.status = MarketItemStatus.SOLD;
        marketItemOfOwner[_msgSender()].remove(marketItemId);
        // request token
        paymentToken.safeTransferFrom(_msgSender(), address(this), data.price);
        // pay listing fee
        uint256 netSaleValue = data.price - getListingFee(data.price);
        // pay 2.5% royalties from the amount actually received
        netSaleValue = _deduceRoyalties(data.nftContractAddress, data.tokenId, netSaleValue);

        _soldCounter.increment();
        // pay 97.5% of the amount actually received to seller
        paymentToken.safeTransfer(data.seller, netSaleValue);
        // transfer nft to buyer
        _transferNFTCall(
            data.nftContractAddress,
            data.tokenId,
            data.amount,
            address(this),
            _msgSender()
        );

        emit Bought(marketItemId, data, netSaleValue);
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
     *  @notice check and get Royalties information
     *
     *  @dev    All caller can call this function.
     */
    function getRoyaltyInfo(
        address _nftAddr,
        uint256 _tokenId,
        uint256 _salePrice
    ) public view returns (address, uint256) {
        (address royaltiesReceiver, uint256 royaltiesAmount) = IERC2981Upgradeable(_nftAddr)
            .royaltyInfo(_tokenId, _salePrice);
        return (royaltiesReceiver, royaltiesAmount);
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
     * @dev Get Latest history by the token id
     */
    function getHistoryByTokenId(
        address nftAddress,
        uint256 tokenId,
        uint256 limit
    ) external view returns (MarketItem[] memory) {
        uint256 itemsCount = _marketItemIds.current();
        uint256 currentIndex = 0;
        MarketItem[] memory items = new MarketItem[](limit);
        for (uint256 i = itemsCount; i > 0; i--) {
            MarketItem memory item = marketItemIdToMarketItem[i];
            if (item.tokenId != tokenId || item.nftContractAddress != nftAddress) continue;
            items[currentIndex] = item;
            currentIndex += 1;
            if (currentIndex == limit) break;
        }
        return items;
    }

    /**
     *  @notice Fetch all nft in marketplace contract
     *
     *  @dev    All caller can call this function.
     */
    function fetchAvailableMarketItems() external view returns (MarketItem[] memory) {
        uint256 itemsCount = _marketItemIds.current() -
            _cancelCounter.current() -
            _soldCounter.current();

        MarketItem[] memory marketItems = new MarketItem[](itemsCount);
        uint256 currentIndex = 0;
        for (uint256 i = 0; i < itemsCount; i++) {
            MarketItem memory item = marketItemIdToMarketItem[i + 1];
            if (item.status == MarketItemStatus.CANCELED || item.status == MarketItemStatus.SOLD)
                continue;
            marketItems[currentIndex] = item;
            currentIndex += 1;
            if (currentIndex == itemsCount) break;
        }

        return marketItems;
    }

    /**
     *  @notice Fetch information Market Item by Market ID
     *
     *  @dev    All caller can call this function.
     */
    function fetchMarketItemsByMarketID(uint256 marketId)
        external
        view
        returns (MarketItem memory)
    {
        return marketItemIdToMarketItem[marketId];
    }

    /**
     *  @notice Fetch all Market Items by owner address
     *
     *  @dev    All caller can call this function.
     */
    function fetchMarketItemsByAddress(address account)
        external
        view
        returns (MarketItem[] memory)
    {
        MarketItem[] memory data = new MarketItem[](marketItemOfOwner[account].length());
        for (uint256 i = 0; i < marketItemOfOwner[account].length(); i++) {
            data[i] = marketItemIdToMarketItem[marketItemOfOwner[account].at(i)];
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
