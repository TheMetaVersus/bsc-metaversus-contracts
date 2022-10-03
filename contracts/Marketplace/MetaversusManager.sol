// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

import "@openzeppelin/contracts-upgradeable/utils/introspection/ERC165Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";

import "../lib/NFTHelper.sol";
import "../Validatable.sol";
import "../interfaces/INFTMTVSTicket.sol";
import "../interfaces/IMetaversusManager.sol";

/**
 *  @title  Dev Metaversus Contract
 *
 *  @author Metaversus Team
 *
 *  @notice This smart contract create the token metaversus manager for Operation. These contract using to control
 *          all action which user call and interact for purchasing in marketplace operation.
 */
contract MetaversusManager is Validatable, ReentrancyGuardUpgradeable, ERC165Upgradeable, IMetaversusManager {
    using SafeERC20Upgradeable for IERC20Upgradeable;
    bytes4 private constant _INTERFACE_ID_ERC721 = type(IERC721Upgradeable).interfaceId;
    bytes4 private constant _INTERFACE_ID_ERC1155 = type(IERC1155Upgradeable).interfaceId;

    /**
     *  @notice paymentToken IERC20Upgradeable is interface of payment token
     */
    IERC20Upgradeable public paymentToken;

    /**
     *  @notice tokenMintERC721 is interface of tokenMint ERC721
     */
    ITokenMintERC721 public tokenMintERC721;

    /**
     *  @notice tokenMintERC1155 is interface of tokenMint ERC1155
     */
    ITokenMintERC1155 public tokenMintERC1155;

    /**
     *  @notice marketplace store the address of the marketplaceManager contract
     */
    IMarketplaceManager public marketplace;

    /**
     *  @notice collectionFactory is interface of collection Factory
     */
    ICollectionFactory public collectionFactory;

    /**
     *  @notice treasury store the address of the TreasuryManager contract
     */
    ITreasury public treasury;

    event BoughtTicket(address indexed to);
    event BoughtTicketEvent(address indexed to, string indexed eventid);
    event SetTreasury(ITreasury indexed oldTreasury, ITreasury indexed newTreasury);
    event SetMarketplace(IMarketplaceManager indexed oldMarketplace, IMarketplaceManager indexed newMarketplace);
    event SetCollectionFactory(ICollectionFactory indexed oldValue, ICollectionFactory indexed newValue);
    event Created(NFTHelper.Type indexed typeMint, address indexed to, uint256 indexed amount);

    /**
     *  @notice Initialize new logic contract.
     */
    function initialize(
        ITokenMintERC721 nft721Addr,
        ITokenMintERC1155 nft1155Addr,
        IERC20Upgradeable _paymentToken,
        ITreasury _treasury,
        IMarketplaceManager _marketplaceAddr,
        ICollectionFactory _collectionFactoryAddr,
        IAdmin _admin
    )
        public
        initializer
        validTokenMintERC721(nft721Addr)
        validTokenMintERC1155(nft1155Addr)
        notZeroAddress(address(_paymentToken))
        validTreasury(_treasury)
        validMarketplaceManager(_marketplaceAddr)
        validCollectionFactory(_collectionFactoryAddr)
    {
        __Validatable_init(_admin);
        __ReentrancyGuard_init();
        __ERC165_init();

        treasury = _treasury;
        marketplace = _marketplaceAddr;
        paymentToken = _paymentToken;
        tokenMintERC721 = nft721Addr;
        tokenMintERC1155 = nft1155Addr;
        collectionFactory = _collectionFactoryAddr;
    }

    /**
     *  @notice Set treasury to change TreasuryManager address.
     *
     *  @dev    Only owner or admin can call this function.
     */
    function setTreasury(ITreasury _account) external onlyAdmin validTreasury(_account) {
        ITreasury oldTreasury = treasury;
        treasury = _account;
        emit SetTreasury(oldTreasury, treasury);
    }

    /**
     *  @notice Set Marketplace to change MarketplaceManager address.
     *
     *  @dev    Only owner or admin can call this function.
     */
    function setMarketplace(IMarketplaceManager _newMarketplace)
        external
        onlyAdmin
        validMarketplaceManager(_newMarketplace)
    {
        IMarketplaceManager oldMarketplace = marketplace;
        marketplace = _newMarketplace;
        emit SetMarketplace(oldMarketplace, marketplace);
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
     *  @notice Create NFT
     *
     *  @dev    All caller can call this function.
     */
    function createNFT(
        NFTHelper.Type typeNft,
        uint256 amount,
        string memory uri,
        uint256 price,
        uint256 startTime,
        uint256 endTime,
        IERC20Upgradeable payment,
        bytes calldata rootHash
    ) external whenNotPaused nonReentrant notZero(amount) notZero(price) {
        if (typeNft == NFTHelper.Type.ERC721) {
            tokenMintERC721.mint(address(marketplace), uri);
            uint256 currentId = tokenMintERC721.getTokenCounter();
            marketplace.extCreateMarketInfo(
                address(tokenMintERC721),
                currentId,
                amount,
                price,
                _msgSender(),
                startTime,
                endTime,
                payment,
                rootHash
            );
        } else if (typeNft == NFTHelper.Type.ERC1155) {
            tokenMintERC1155.mint(address(marketplace), amount, uri);
            uint256 currentId = tokenMintERC1155.getTokenCounter();
            marketplace.extCreateMarketInfo(
                address(tokenMintERC1155),
                currentId,
                amount,
                price,
                _msgSender(),
                startTime,
                endTime,
                payment,
                rootHash
            );
        }

        emit Created(typeNft, _msgSender(), amount);
    }

    /**
     *  @notice Buy NFT Ticket for join events
     *
     *  @dev    All caller can call this function.
     */
    function buyTicketEvent(string memory eventId, uint256 amount) external nonReentrant notZero(amount) whenNotPaused {
        paymentToken.safeTransferFrom(_msgSender(), address(treasury), amount);

        emit BoughtTicketEvent(_msgSender(), eventId);
    }

    /**
     *  @notice Create NFT Limit
     *
     *  @dev    All caller can call this function.
     */
    function createNFTLimit(
        address nftAddress,
        uint256 amount,
        string memory uri,
        uint256 price,
        uint256 startTime,
        uint256 endTime,
        IERC20Upgradeable payment,
        bytes calldata rootHash
    ) external nonReentrant notZero(amount) notZero(price) whenNotPaused {
        require(collectionFactory.checkCollectionOfUser(_msgSender(), nftAddress), "User is not create collection");

        NFTHelper.Type typeNft = NFTHelper.getType(nftAddress);
        require(typeNft != NFTHelper.Type.NONE, "ERROR: Invalid NFT address");

        if (typeNft == NFTHelper.Type.ERC721) {
            ITokenMintERC721(nftAddress).mint(address(marketplace), uri);
            uint256 currentId = ITokenMintERC721(nftAddress).getTokenCounter();
            marketplace.extCreateMarketInfo(
                nftAddress,
                currentId,
                amount,
                price,
                _msgSender(),
                startTime,
                endTime,
                payment,
                rootHash
            );
        } else if (typeNft == NFTHelper.Type.ERC1155) {
            ITokenMintERC1155(nftAddress).mint(address(marketplace), amount, uri);
            uint256 currentId = ITokenMintERC1155(nftAddress).getTokenCounter();
            marketplace.extCreateMarketInfo(
                nftAddress,
                currentId,
                amount,
                price,
                _msgSender(),
                startTime,
                endTime,
                payment,
                rootHash
            );
        }

        emit Created(typeNft, _msgSender(), amount);
    }

    /**
     *  @notice Import collection into marketplace
     */
    function importCollection(
        address nftAddress,
        uint256[] calldata ids,
        uint256[] calldata amounts,
        uint256[] calldata prices,
        bytes calldata rootHash,
        IERC20Upgradeable payment,
        uint256 startTime,
        uint256 endTime
    ) public nonReentrant {
        require(ids.length == amounts.length && amounts.length == prices.length, "ERROR: Invalid length of input");
        require(NFTHelper.getType(nftAddress) != NFTHelper.Type.NONE, "ERROR: Invalid NFT address");

        for (uint256 i = 0; i < ids.length; i++) {
            NFTHelper.transferNFTCall(nftAddress, ids[i], amounts[i], _msgSender(), address(marketplace));
            marketplace.extCreateMarketInfo(
                nftAddress,
                ids[i],
                amounts[i],
                prices[i],
                _msgSender(),
                startTime,
                endTime,
                payment,
                rootHash
            );
        }
    }

    /**
     *  @notice Get all params
     */
    function getAllParams()
        external
        view
        returns (
            ITreasury,
            IMarketplaceManager,
            ITokenMintERC1155,
            ITokenMintERC721,
            IERC20Upgradeable
        )
    {
        return (treasury, marketplace, tokenMintERC1155, tokenMintERC721, paymentToken);
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
        return interfaceId == type(IMetaversusManager).interfaceId || super.supportsInterface(interfaceId);
    }
}
