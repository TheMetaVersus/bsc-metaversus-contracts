// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC721/IERC721Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC1155/IERC1155Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/CountersUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/interfaces/IERC2981Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/structs/EnumerableSetUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC721/utils/ERC721HolderUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC1155/utils/ERC1155HolderUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/cryptography/MerkleProofUpgradeable.sol";

import "../lib/NFTHelper.sol";
import "../interfaces/IMarketplaceManager.sol";
import "../Validatable.sol";
import "../Struct.sol";

/**
 *  @title  Dev Marketplace Manager Contract
 *
 *  @author Metaversus Team
 *
 *  @notice This smart contract is the marketplace for exhange multiple non-fungiable token with standard ERC721 and ERC1155
 *          all action which user could sell, unsell, buy them.
 */
contract MarketPlaceManager is
    Validatable,
    ReentrancyGuardUpgradeable,
    ERC721HolderUpgradeable,
    ERC1155HolderUpgradeable,
    IMarketplaceManager
{
    using SafeERC20Upgradeable for IERC20Upgradeable;
    using CountersUpgradeable for CountersUpgradeable.Counter;
    using EnumerableSetUpgradeable for EnumerableSetUpgradeable.UintSet;
    using EnumerableSetUpgradeable for EnumerableSetUpgradeable.AddressSet;
    using AddressUpgradeable for address;

    CountersUpgradeable.Counter private _marketItemIds;

    uint256 public constant DENOMINATOR = 1e5;

    /**
     *  @notice metaversus manager store the address of the MetaversusManager contract
     */
    IMetaversusManager public metaversusManager;

    /**
     *  @notice listingFee is fee user must pay for contract when create
     */
    uint256 public listingFee;

    /**
     *  @notice orderManager is address of Order contract
     */
    IOrder public orderManager;

    /**
     *  @notice collectionFactory is interface of collection Factory
     */
    ICollectionFactory public collectionFactory;

    /**
     *  @notice isBuyer is mapping owner address to account was buyer in marketplace
     */
    mapping(address => bool) public isBuyer;

    /**
     *  @notice nftAddressToRootHash is mapping nft address to root hash
     */
    mapping(address => bytes32) public nftAddressToRootHash;

    /**
     *  @notice Mapping from MarketItemID to Market Item
     *  @dev MarketItemID -> MarketItem
     */
    mapping(uint256 => MarketItem) public marketItemIdToMarketItem;

    event MarketItemCreated(
        uint256 indexed marketItemId,
        address nftContract,
        uint256 tokenId,
        uint256 amount,
        address indexed seller,
        uint256 price,
        uint256 nftType,
        uint256 startTime,
        uint256 endTime,
        IERC20Upgradeable paymentToken,
        bytes rootHash,
        bool isPrivate
    );
    event MarketItemUpdated(
        uint256 indexed marketItemId,
        uint256 price,
        uint256 startTime,
        uint256 endTime,
        IERC20Upgradeable paymentToken,
        bytes rootHash,
        bool isPrivate
    );
    event SetOrder(IOrder indexed oldOrder, IOrder indexed newOrder);
    event SetMetaversusManager(
        IMetaversusManager indexed oldMetaversusManager,
        IMetaversusManager indexed newMetaversusManager
    );
    event SetNewRootHash(address nftAddress, bytes newRoot);
    event SetCollectionFactory(ICollectionFactory indexed oldValue, ICollectionFactory indexed newValue);

    modifier validId(uint256 _id) {
        require(_id <= _marketItemIds.current() && _id > 0, "ERROR: market ID is not exist !");
        _;
    }

    /**
     *  @notice Initialize new logic contract.
     */
    function initialize(IAdmin _admin) public initializer {
        __Validatable_init(_admin);
        __ReentrancyGuard_init();

        listingFee = 25e2; // 2.5%
    }

    modifier onlyOrder() {
        require(_msgSender() == address(orderManager), "Caller is not an order manager");
        _;
    }

    modifier onlyMetaversusOrOrder() {
        require(
            _msgSender() == address(metaversusManager) || _msgSender() == address(orderManager),
            "Caller is not a metaversus manager or order manager"
        );
        _;
    }

    receive() external payable {}

    /**
     *  @notice set marketplaceManager to change MarketplaceManager address.
     *
     *  @dev    Only owner or admin can call this function.
     */
    function setMetaversusManager(IMetaversusManager _address) external onlyAdmin validMetaversusManager(_address) {
        IMetaversusManager oldMetaversusManager = _address;
        metaversusManager = _address;
        emit SetMetaversusManager(oldMetaversusManager, _address);
    }

    /**
     *  @notice set order to change Order address.
     *
     *  @dev    Only owner or admin can call this function.
     */
    function setOrderManager(IOrder _account) external onlyAdmin validOrder(_account) {
        IOrder oldOrder = orderManager;
        orderManager = _account;
        emit SetOrder(oldOrder, orderManager);
    }

    /**
     *  @notice Transfer nft call
     */
    function extTransferNFTCall(
        address _nftContractAddress,
        uint256 _tokenId,
        uint256 _amount,
        address _from,
        address _to
    ) external onlyOrder {
        NFTHelper.transferNFTCall(_nftContractAddress, _tokenId, _amount, _from, _to);
    }

    /**
     *  @notice Set Marketplace to change MarketplaceManager address.
     *
     *  @dev    Only owner or admin can call this function.
     */
    function setCollectionFactory(ICollectionFactory _newCollectionFactory)
        external
        onlyAdmin
        validCollectionFactory(_newCollectionFactory)
    {
        ICollectionFactory oldCollectionFactory = collectionFactory;
        collectionFactory = _newCollectionFactory;
        emit SetCollectionFactory(oldCollectionFactory, collectionFactory);
    }

    /**
     *  @notice Create market info with data
     *
     *  @dev    All caller can call this function.
     */
    function extCreateMarketInfo(
        address _nftAddress,
        uint256 _tokenId,
        uint256 _amount,
        uint256 _price,
        address _seller,
        uint256 _startTime,
        uint256 _endTime,
        IERC20Upgradeable _paymentToken,
        bytes calldata _rootHash
    ) external onlyMetaversusOrOrder {
        require(admin.isPermittedPaymentToken(_paymentToken), "Payment token is not supported");
        NFTHelper.Type nftType = NFTHelper.getType(_nftAddress);
        require(block.timestamp <= _startTime && _startTime < _endTime, "Invalid time");

        _marketItemIds.increment();

        marketItemIdToMarketItem[_marketItemIds.current()] = MarketItem(
            _nftAddress,
            _tokenId,
            _amount,
            _price,
            nftType,
            _seller,
            address(0),
            MarketItemStatus.LISTING,
            _startTime,
            _endTime,
            _paymentToken
        );

        nftAddressToRootHash[_nftAddress] = bytes32(_rootHash);

        emit MarketItemCreated(
            _marketItemIds.current(),
            _nftAddress,
            _tokenId,
            _amount,
            _seller,
            _price,
            uint256(nftType),
            _startTime,
            _endTime,
            _paymentToken,
            _rootHash,
            isPrivate(_marketItemIds.current())
        );
    }

    function setNewRootHash(address nftAddress, bytes calldata newRoot) external nonReentrant {
        require(collectionFactory.checkCollectionOfUser(_msgSender(), nftAddress), "User is not create collection");

        nftAddressToRootHash[nftAddress] = bytes32(newRoot);

        emit SetNewRootHash(nftAddress, newRoot);
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
        return isBuyer[account];
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
     *  @notice Return permit token payment
     */
    function isPermittedPaymentToken(IERC20Upgradeable token) public view returns (bool) {
        return admin.isPermittedPaymentToken(token);
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
    function checkStandard(address _contract) public view returns (NFTHelper.Type) {
        return NFTHelper.getType(_contract);
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
        override(ERC1155ReceiverUpgradeable, IERC165Upgradeable)
        returns (bool)
    {
        return interfaceId == type(IMarketplaceManager).interfaceId || super.supportsInterface(interfaceId);
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

    function isRoyalty(address _contract) external view returns (bool) {
        return NFTHelper.isRoyalty(_contract);
    }

    /**
     *  @notice get market item info from market item ID
     */
    function getMarketItemIdToMarketItem(uint256 marketItemId) external view returns (MarketItem memory) {
        return marketItemIdToMarketItem[marketItemId];
    }

    /**
     *  @notice set market item info at market item ID
     */
    function setMarketItemIdToMarketItem(uint256 marketItemId, MarketItem memory value)
        external
        onlyOrder
        validId(marketItemId)
    {
        marketItemIdToMarketItem[marketItemId] = value;
    }

    /**
     *  @notice mark user was buyer
     */
    function setIsBuyer(address newBuyer) external onlyOrder notZeroAddress(newBuyer) {
        if (!isBuyer[newBuyer]) {
            isBuyer[newBuyer] = true;
        }
    }

    /**
     * @dev Returns true if an address (leaf)
     * @param _marketItemId market item Id
     * @param _proof Proof to verify address
     * @param _account Address to verify
     */
    function verify(
        uint256 _marketItemId,
        bytes32[] memory _proof,
        address _account
    ) external view returns (bool) {
        require(_marketItemId > 0, "Invalid market item ID");
        bytes32 leaf = keccak256(abi.encodePacked(_account));
        bytes32 root = nftAddressToRootHash[marketItemIdToMarketItem[_marketItemId].nftContractAddress];
        return MerkleProofUpgradeable.verify(_proof, bytes32(root), leaf);
    }

    /**
     *  @notice check private market item
     */
    function isPrivate(uint256 _marketItemId) public view returns (bool) {
        return nftAddressToRootHash[marketItemIdToMarketItem[_marketItemId].nftContractAddress] > 0;
    }
}
