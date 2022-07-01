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
 *          After that, they could
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
    CountersUpgradeable.Counter private _marketItemIds;

    bytes4 private constant _INTERFACE_ID_ERC2981 = type(IERC2981Upgradeable).interfaceId;
    bytes4 private constant _INTERFACE_ID_ERC721 = type(IERC721Upgradeable).interfaceId;
    bytes4 private constant _INTERFACE_ID_ERC1155 = type(IERC1155Upgradeable).interfaceId;
    uint256 public constant DENOMINATOR = 10000;
    enum NftStandard {
        NONE,
        ERC721,
        ERC1155
    }
    struct MarketItem {
        uint256 marketItemId;
        address nftContractAddress;
        uint256 tokenId;
        uint256 amount;
        uint256 nftType;
        address creator;
        address seller;
        address owner;
        uint256 price;
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
        uint256 nftType,
        address seller,
        address owner,
        uint256 price
    );
    event SetTreasury(address indexed oldTreasury, address indexed newTreasury);
    event RoyaltiesPaid(uint256 indexed tokenId, uint256 indexed value);

    /**
     *  @notice Initialize new logic contract.
     */
    function initialize(
        address _owner,
        address _paymentToken,
        address _treasury
    ) public initializer {
        OwnableUpgradeable.__Ownable_init();
        PausableUpgradeable.__Pausable_init();
        paymentToken = IERC20Upgradeable(_paymentToken);
        transferOwnership(_owner);
        treasury = _treasury;
        listingFee = 250; // 2.5%
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
     *  @notice get Listing fee and demonator
     *
     *  @dev    All caller can call this function.
     */
    function getListingFee() external view returns (uint256, uint256) {
        return (listingFee, DENOMINATOR);
    }

    /**
     *  @notice Check loyalties in nft coontract address
     *
     *  @dev    All caller can call this function.
     */
    function checkRoyalties(address _contract) internal view returns (bool) {
        bool success = IERC2981Upgradeable(_contract).supportsInterface(_INTERFACE_ID_ERC2981);
        return success;
    }

    /**
     *  @notice Check standard of nft contract address
     *
     *  @dev    All caller can call this function.
     */
    function checkNftStandard(address _contract) internal view returns (NftStandard) {
        if (IERC721Upgradeable(_contract).supportsInterface(_INTERFACE_ID_ERC721)) {
            return NftStandard.ERC721;
        }

        if (IERC1155Upgradeable(_contract).supportsInterface(_INTERFACE_ID_ERC1155)) {
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
        (address royaltiesReceiver, uint256 royaltiesAmount) = IERC2981Upgradeable(
            nftContractAddress
        ).royaltyInfo(tokenId, grossSaleValue);
        // Deduce royalties from sale value
        uint256 netSaleValue = grossSaleValue - royaltiesAmount;
        // Transfer royalties to rightholder if not zero
        if (royaltiesAmount > 0) {
            paymentToken.safeTransferFrom(address(this), royaltiesReceiver, royaltiesAmount);
        }
        // Broadcast royalties payment
        emit RoyaltiesPaid(tokenId, royaltiesAmount);
        return netSaleValue;
    }

    /**
     *  @notice Sell any nft avaiable in marketplace after metaversus manager mint
     *
     *  @dev    All caller can call this function.
     */
    function sellAvaiableInMarketplace(uint256 marketItemId, uint256 price)
        external
        nonReentrant
        notZeroAmount(price)
        whenNotPaused
        returns (uint256)
    {
        require(
            marketItemIdToMarketItem[marketItemId].owner == _msgSender(),
            "ERROR: sender is not owner this NFT"
        );

        marketItemIdToMarketItem[marketItemId].price = price;
        return marketItemId;
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
        uint256 grossSaleValue
    )
        external
        nonReentrant
        notZeroAddress(nftContractAddress)
        notZeroAmount(amount)
        notZeroAmount(grossSaleValue)
        whenNotPaused
        returns (uint256)
    {
        _marketItemIds.increment();
        uint256 marketItemId = _marketItemIds.current();

        (address royaltiesReceiver, ) = getRoyaltyInfo(nftContractAddress, tokenId, grossSaleValue);

        NftStandard nftType = checkNftStandard(nftContractAddress);
        require(nftType != NftStandard.NONE, "ERROR: NFT address is compatible !");

        marketItemIdToMarketItem[marketItemId] = MarketItem(
            marketItemId,
            nftContractAddress,
            tokenId,
            amount,
            uint256(nftType),
            royaltiesReceiver,
            _msgSender(),
            address(0),
            grossSaleValue
        );
        marketItemOfOwner[_msgSender()].add(marketItemId);

        transferNFTCall(
            nftContractAddress,
            tokenId,
            amount,
            uint256(nftType),
            _msgSender(),
            address(this)
        );
        emit MarketItemCreated(
            marketItemId,
            nftContractAddress,
            tokenId,
            amount,
            uint256(nftType),
            _msgSender(),
            address(0),
            grossSaleValue
        );
        return marketItemId;
    }

    /**
     *  @notice Canncel any nft which selling
     *
     *  @dev    All caller can call this function.
     */
    function cancelSell(address nftContractAddress, uint256 marketItemId)
        external
        nonReentrant
        notZeroAddress(nftContractAddress)
        whenNotPaused
    {
        require(marketItemId <= _marketItemIds.current(), "ERROR: market ID is not exist !");
        require(
            marketItemIdToMarketItem[marketItemId].seller == _msgSender(),
            "ERROR: you are not the seller !"
        );

        MarketItem memory data = marketItemIdToMarketItem[marketItemId];

        marketItemIdToMarketItem[marketItemId].owner = (_msgSender());
        marketItemOfOwner[_msgSender()].remove(marketItemId);

        paymentToken.safeTransferFrom(_msgSender(), address(this), listingFee);

        transferNFTCall(
            nftContractAddress,
            data.tokenId,
            data.amount,
            data.nftType,
            address(this),
            _msgSender()
        );
    }

    /**
     *  @notice Buy any nft which selling
     *
     *  @dev    All caller can call this function.
     */
    function buy(address nftContractAddress, uint256 marketItemId)
        external
        nonReentrant
        notZeroAddress(nftContractAddress)
        whenNotPaused
    {
        MarketItem memory data = marketItemIdToMarketItem[marketItemId];

        marketItemIdToMarketItem[marketItemId].owner = (_msgSender());
        marketItemOfOwner[_msgSender()].remove(marketItemId);

        uint256 netSaleValue = _deduceRoyalties(nftContractAddress, data.tokenId, data.price) -
            data.price.mul(listingFee).div(DENOMINATOR);

        paymentToken.safeTransferFrom(_msgSender(), address(this), data.price);
        paymentToken.safeTransferFrom(address(this), data.seller, netSaleValue);

        transferNFTCall(
            nftContractAddress,
            data.tokenId,
            data.amount,
            data.nftType,
            address(this),
            _msgSender()
        );
    }

    function transferNFTCall(
        address nftContractAddress,
        uint256 tokenId,
        uint256 amount,
        uint256 nftType,
        address from,
        address to
    ) internal {
        if (nftType == uint256(NftStandard.ERC721)) {
            IERC721Upgradeable(nftContractAddress).safeTransferFrom(from, to, tokenId);
        } else {
            IERC1155Upgradeable(nftContractAddress).safeTransferFrom(from, to, tokenId, amount, "");
        }
    }

    function getRoyaltyInfo(
        address _nftAddr,
        uint256 _tokenId,
        uint256 _salePrice
    ) public view returns (address, uint256) {
        if (checkRoyalties(_nftAddr)) {
            (address royaltiesReceiver, uint256 royaltiesAmount) = IERC2981Upgradeable(_nftAddr)
                .royaltyInfo(_tokenId, _salePrice);
            return (royaltiesReceiver, royaltiesAmount);
        }
        return (address(0), 0);
    }

    function updateCreateNFT(
        address _nftAddress,
        uint256 _tokenId,
        uint256 _amount,
        address _owner
    )
        external
        onlyOwnerOrAdmin
        notZeroAddress(_nftAddress)
        notZeroAddress(_owner)
        notZeroAmount(_amount)
    {
        _marketItemIds.increment();
        uint256 marketItemId = _marketItemIds.current();

        (address royaltiesReceiver, ) = getRoyaltyInfo(_nftAddress, _tokenId, 0);
        NftStandard nftType = checkNftStandard(_nftAddress);
        require(nftType != NftStandard.NONE, "ERROR: NFT address is compatible !");

        marketItemIdToMarketItem[marketItemId] = MarketItem(
            marketItemId,
            _nftAddress,
            _tokenId,
            _amount,
            uint256(nftType),
            royaltiesReceiver,
            _owner,
            (address(0)),
            0
        );

        marketItemOfOwner[_msgSender()].add(marketItemId);
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
        unchecked {
            MarketItem memory emptyMarketItem = MarketItem(
                0,
                address(0),
                0,
                0,
                0,
                address(0),
                address(0),
                address(0),
                0
            );

            return (emptyMarketItem, false);
        }
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
}
