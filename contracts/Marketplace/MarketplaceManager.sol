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
    CountersUpgradeable.Counter private _orderCounter;

    bytes4 private constant _INTERFACE_ID_ERC2981 = type(IERC2981Upgradeable).interfaceId;
    bytes4 private constant _INTERFACE_ID_ERC721 = type(IERC721Upgradeable).interfaceId;
    bytes4 private constant _INTERFACE_ID_ERC1155 = type(IERC1155Upgradeable).interfaceId;
    uint256 public constant DENOMINATOR = 1e5;

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
     *  @notice orderIdToOrderInfo is mapping order ID to order info
     */
    mapping(uint256 => Order) public orderIdToOrderInfo;

    /**
     *  @notice _marketItemOfOwner is mapping owner address to Market ID
     */
    mapping(address => EnumerableSetUpgradeable.UintSet) private _marketItemOfOwner;

    /**
     *  @notice _orderOfOwner is mapping owner address to order ID
     */
    mapping(address => EnumerableSetUpgradeable.UintSet) private _orderOfOwner;

    /**
     *  @notice _orderIdFromAssetOfOwner is mapping owner's asset address to order ID
     */
    mapping(address => EnumerableSetUpgradeable.UintSet) private _orderIdFromAssetOfOwner;

    /**
     *  @notice _rootHashesToMarketItems is mapping owner's asset address to order ID
     */
    mapping(bytes32 => EnumerableSetUpgradeable.UintSet) private _rootHashesToMarketItemIds;

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
        address paymentToken
    );
    event MarketItemUpdated(
        uint256 indexed marketItemId,
        uint256 price,
        uint256 startTime,
        uint256 endTime,
        address paymentToken,
        bytes rootHash
    );
    event SetTreasury(address indexed oldTreasury, address indexed newTreasury);
    event RoyaltiesPaid(uint256 indexed tokenId, uint256 indexed value);
    event SetPermitedNFT(address nftAddress, bool allow);
    event MadeOffer(uint256 indexed orderId);

    modifier validateId(uint256 id) {
        require(id <= _marketItemIds.current() && id > 0, "ERROR: market ID is not exist !");
        _;
    }

    /**
     *  @notice Initialize new logic contract.
     */
    function initialize(address _treasury, IAdmin _admin) public initializer {
        __Validatable_init(_admin);
        __ReentrancyGuard_init();

        treasury = _treasury;
        listingFee = 25e2; // 2.5%
    }

    receive() external payable {}

    /**
     *  @notice Set permit NFT
     */
    function setPermitedNFT(address _nftAddress, bool allow) external onlyAdmin {
        if (allow) {
            _permitedNFTs.add(_nftAddress);
        } else if (isPermitedNFT(_nftAddress)) {
            _permitedNFTs.remove(_nftAddress);
        }

        emit SetPermitedNFT(_nftAddress, allow);
    }

    function setNewRootHash(bytes calldata oldRoot, bytes calldata newRoot) external onlyAdmin {
        for (uint256 i = 0; i < _rootHashesToMarketItemIds[bytes32(oldRoot)].length(); i++) {
            _rootHashesToMarketItemIds[bytes32(newRoot)].add(_rootHashesToMarketItemIds[bytes32(oldRoot)].at(i));
        }
        delete _rootHashesToMarketItemIds[bytes32(oldRoot)];
    }

    /**
     *  @notice Set permit payment token
     */
    function setPermitedPaymentToken(address _paymentToken, bool allow) external onlyAdmin {
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
    function setTreasury(address _account) external onlyAdmin {
        address oldTreasury = treasury;
        treasury = _account;
        emit SetTreasury(oldTreasury, treasury);
    }

    /**
     * @dev makeOffer external function for handle store and update data
     */
    function externalMakeOffer(
        address paymentToken,
        uint256 bidPrice,
        uint256 time,
        uint256 amount,
        uint256 marketItemId,
        WalletAsset memory walletAsset
    ) external payable {
        _orderCounter.increment();
        uint256 orderId = _orderCounter.current();

        Order memory newBid = Order(
            orderId,
            _msgSender(),
            paymentToken,
            bidPrice,
            marketItemId,
            walletAsset,
            amount,
            time
        );

        orderIdToOrderInfo[orderId] = newBid;

        _orderOfOwner[_msgSender()].add(orderId);
        address caller = marketItemId == 0 ? walletAsset.owner : marketItemIdToMarketItem[marketItemId].seller;
        _orderIdFromAssetOfOwner[caller].add(orderId);

        // send offer money
        extTransferCall(paymentToken, bidPrice, _msgSender(), address(this));
        emit MadeOffer(orderId);
    }

    /**
     *  @notice Transfer nft call
     */
    function extTransferNFTCall(
        address nftContractAddress,
        uint256 tokenId,
        uint256 amount,
        address from,
        address to
    ) external {
        NftStandard nftType = checkNftStandard(nftContractAddress);
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
    function extTransferCall(
        address paymentToken,
        uint256 amount,
        address from,
        address to
    ) public payable onlyOrder {
        if (paymentToken == address(0)) {
            if (to == address(this)) {
                require(msg.value == amount, "Failed to send into contract");
            } else {
                (bool sent, ) = to.call{ value: amount }("");
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
    function checkNftStandard(address _contract) public returns (NftStandard) {
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
    function deduceRoyalties(
        address nftContractAddress,
        uint256 tokenId,
        uint256 grossSaleValue,
        address paymentToken
    ) external payable returns (uint256 netSaleAmount) {
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
                extTransferCall(paymentToken, royaltiesAmount, address(this), royaltiesReceiver);
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
    function extCreateMarketInfo(
        address _nftAddress,
        uint256 _tokenId,
        uint256 _amount,
        uint256 _price,
        address _seller,
        uint256 _startTime,
        uint256 _endTime,
        address _paymentToken,
        bytes calldata rootHash
    ) external {
        require(_msgSender().isContract(), "ERROR: only allow contract call !");
        require(isPermitedNFT(_nftAddress), "ERROR: NFT not allow to sell on marketplace !");
        NftStandard nftType = checkNftStandard(_nftAddress);
        require(nftType != NftStandard.NONE, "ERROR: NFT address is compatible !");

        _marketItemIds.increment();
        uint256 marketItemId = _marketItemIds.current();

        marketItemIdToMarketItem[marketItemId] = MarketItem(
            marketItemId,
            _nftAddress,
            _tokenId,
            nftType == NftStandard.ERC1155 ? _amount : 1,
            _endTime >= _startTime && _startTime >= block.timestamp ? _price : 0,
            uint256(nftType),
            _seller,
            address(0),
            MarketItemStatus.LISTING,
            _startTime >= block.timestamp ? _startTime : 0,
            _endTime >= _startTime ? _endTime : 0,
            _permitedPaymentToken.contains(_paymentToken) ? _paymentToken : address(0)
        );

        _marketItemOfOwner[_seller].add(marketItemId);
        _rootHashesToMarketItemIds[bytes32(rootHash)].add(marketItemId);
        emit MarketItemCreated(
            marketItemId,
            _nftAddress,
            _tokenId,
            nftType == NftStandard.ERC1155 ? _amount : 1,
            _seller,
            _endTime >= _startTime && _startTime >= block.timestamp ? _price : 0,
            uint256(nftType),
            _startTime >= block.timestamp ? _startTime : 0,
            _endTime >= _startTime ? _endTime : 0,
            _paymentToken
        );
    }

    /**
     *  @notice Update market info with data
     *
     *  @dev    All caller can call this function.
     */
    function extUpdateMarketInfo(
        uint256 marketItemId,
        uint256 _price,
        uint256 _startTime,
        uint256 _endTime,
        address _paymentToken,
        bytes calldata rootHash
    ) external validateId(marketItemId) notZeroAmount(_price) {
        require(_msgSender().isContract(), "ERROR: only allow contract call !");
        require(_endTime > _startTime, "Invalid time");
        require(_permitedPaymentToken.contains(_paymentToken) || _paymentToken == address(0), "Invalid payment token");

        MarketItem memory marketItem = marketItemIdToMarketItem[marketItemId];

        marketItem.price = _price;
        marketItem.startTime = _startTime;
        marketItem.endTime = _endTime;
        marketItem.paymentToken = _permitedPaymentToken.contains(_paymentToken) ? _paymentToken : address(0);

        _rootHashesToMarketItemIds[bytes32(rootHash)].add(marketItemId);

        emit MarketItemUpdated(marketItemId, _price, _startTime, _endTime, _paymentToken, rootHash);
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

    function getCurrentOrder() external view returns (uint256) {
        return _orderCounter.current();
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
    function getOfferOrderOfBidder(address bidder) public view returns (Order[] memory) {
        Order[] memory data = new Order[](_orderOfOwner[bidder].length());
        for (uint256 i = 0; i < _orderOfOwner[bidder].length(); i++) {
            data[i] = orderIdToOrderInfo[_orderOfOwner[bidder].at(i)];
        }
        return data;
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

    /**
     *  @notice get order info from order ID
     */
    function getOrderIdToOrderInfo(uint256 orderId) external view returns (Order memory) {
        return orderIdToOrderInfo[orderId];
    }

    /**
     *  @notice set order ID
     */
    function setOrderIdToOrderInfo(uint256 orderId, Order memory value) external {
        orderIdToOrderInfo[orderId] = value;
    }

    /**
     *  @notice remove order info at order ID
     */
    function removeOrderIdToOrderInfo(uint256 orderId) external {
        delete orderIdToOrderInfo[orderId];
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
    function setMarketItemIdToMarketItem(uint256 marketItemId, MarketItem memory value) external {
        marketItemIdToMarketItem[marketItemId] = value;
    }

    /**
     *  @notice remove order id from owner asset
     */
    function removeOrderIdFromAssetOfOwner(address owner, uint256 orderId) external {
        _orderIdFromAssetOfOwner[owner].remove(orderId);
    }

    /**
     *  @notice remove order id from owner
     */
    function removeOrderOfOwner(address owner, uint256 orderId) external {
        _orderOfOwner[owner].remove(orderId);
    }

    /**
     *  @notice get order info from owner asset
     */
    function getOrderIdFromAssetOfOwner(address owner, uint256 index) external view returns (uint256) {
        return _orderIdFromAssetOfOwner[owner].at(index);
    }

    /**
     *  @notice get length of order info from owner asset
     */
    function getLengthOrderIdFromAssetOfOwner(address owner) external view returns (uint256) {
        return _orderIdFromAssetOfOwner[owner].length();
    }

    /**
     *  @notice get order info at order ID
     */
    function getOrderOfOwner(address owner, uint256 index) external view returns (uint256) {
        return _orderOfOwner[owner].at(index);
    }

    /**
     *  @notice get length of order info from owner
     */
    function getLengthOrderOfOwner(address owner) external view returns (uint256) {
        return _orderOfOwner[owner].length();
    }

    /**
     *  @notice remove market item info from owner
     */
    function removeMarketItemOfOwner(address owner, uint256 marketItemId) external {
        _marketItemOfOwner[owner].remove(marketItemId);
    }

    /**
     * @dev Returns true if an address (leaf)
     * @param _marketItemId market item Id
     * @param _proof Proof to verify address
     * @param _leaf Address to verify
     */
    function verify(
        uint256 _marketItemId,
        bytes32[] memory _proof,
        bytes32 _leaf
    ) external view returns (bool) {
        require(_marketItemId > 0, "Invalid market item ID");
        bytes32 root = MerkleProofUpgradeable.processProof(_proof, _leaf);
        return _rootHashesToMarketItemIds[root].contains(_marketItemId);
    }
}
