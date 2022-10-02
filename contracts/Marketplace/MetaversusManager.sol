// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

import "@openzeppelin/contracts-upgradeable/utils/introspection/ERC165Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC721/IERC721Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC1155/IERC1155Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";

import "../interfaces/ITokenMintERC721.sol";
import "../interfaces/ITokenMintERC1155.sol";
import "../interfaces/INFTMTVSTicket.sol";
import "../interfaces/IMarketplaceManager.sol";
import "../interfaces/IMetaversusManager.sol";
import "../interfaces/IAdmin.sol";
import "../interfaces/ICollectionFactory.sol";
import "../Validatable.sol";

/**
 *  @title  Dev Metaversus Contract
 *
 *  @author Metaversus Team
 *
 *  @notice This smart contract create the token metaversus manager for Operation. These contract using to control
 *          all action which user call and interact for purchasing in marketplace operation.
 */
contract MetaversusManager is
    PausableUpgradeable,
    Validatable,
    ReentrancyGuardUpgradeable,
    ERC165Upgradeable,
    IMetaversusManager
{
    using SafeERC20Upgradeable for IERC20Upgradeable;
    bytes4 private constant _INTERFACE_ID_ERC721 = type(IERC721Upgradeable).interfaceId;
    bytes4 private constant _INTERFACE_ID_ERC1155 = type(IERC1155Upgradeable).interfaceId;
    enum TypeNft {
        ERC721,
        ERC1155,
        NONE
    }

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
    address public treasury;

    event Toggled(bool isPaused);
    event BoughtTicket(address indexed to);
    event BoughtTicketEvent(address indexed to, string indexed eventid);
    event SetTreasury(address indexed oldTreasury, address indexed newTreasury);
    event SetMarketplace(IMarketplaceManager indexed oldMarketplace, IMarketplaceManager indexed newMarketplace);
    event SetCollectionFactory(ICollectionFactory indexed oldValue, ICollectionFactory indexed newValue);
    event Created(uint256 indexed typeMint, address indexed to, uint256 indexed amount);

    /**
     *  @notice Initialize new logic contract.
     */
    function initialize(
        ITokenMintERC721 nft721Addr,
        ITokenMintERC1155 nft1155Addr,
        IERC20Upgradeable _paymentToken,
        address _treasury,
        IMarketplaceManager _marketplaceAddr,
        ICollectionFactory _collectionFactoryAddr,
        IAdmin _admin
    )
        public
        initializer
        notZeroAddress(address(nft721Addr))
        notZeroAddress(address(nft1155Addr))
        notZeroAddress(address(_paymentToken))
        notZeroAddress(address(_treasury))
        notZeroAddress(address(_marketplaceAddr))
        notZeroAddress(address(_collectionFactoryAddr))
    {
        __Pausable_init();
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
     *  @notice Toggle contract interupt
     *
     *  @dev    Only owner can execute this function
     */
    function toggle() external onlyAdmin {
        if (paused()) {
            _unpause();
        } else {
            _pause();
        }

        emit Toggled(paused());
    }

    /**
     *  @notice Set treasury to change TreasuryManager address.
     *
     *  @dev    Only owner or admin can call this function.
     */
    function setTreasury(address _account) external onlyAdmin notZeroAddress(_account) {
        address oldTreasury = treasury;
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
        notZeroAddress(address(_newMarketplace))
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
        notZeroAddress(address(_newCollectionFactory))
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
        TypeNft typeNft,
        uint256 amount,
        string memory uri,
        uint256 price,
        uint256 startTime,
        uint256 endTime,
        address payment,
        bytes calldata rootHash
    ) external nonReentrant notZeroAmount(amount) whenNotPaused {
        if (typeNft == TypeNft.ERC721) {
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
        } else if (typeNft == TypeNft.ERC1155) {
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

        emit Created(uint256(typeNft), _msgSender(), amount);
    }

    /**
     *  @notice Buy NFT Ticket for join events
     *
     *  @dev    All caller can call this function.
     */
    function buyTicketEvent(string memory eventId, uint256 amount)
        external
        nonReentrant
        notZeroAmount(amount)
        whenNotPaused
    {
        paymentToken.safeTransferFrom(_msgSender(), treasury, amount);

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
        address payment,
        bytes calldata rootHash
    ) external nonReentrant notZeroAmount(amount) whenNotPaused {
        require(collectionFactory.checkCollectionOfUser(_msgSender(), nftAddress), "User is not create collection");

        TypeNft _typeNft = _checkTypeNft(nftAddress);
        require(_typeNft != TypeNft.NONE, "ERROR: Invalid NFT address");

        if (_typeNft == TypeNft.ERC721) {
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
        } else if (_typeNft == TypeNft.ERC1155) {
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

        emit Created(uint256(_typeNft), _msgSender(), amount);
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
            address,
            address,
            address
        )
    {
        return (
            treasury,
            address(marketplace),
            address(tokenMintERC1155),
            address(tokenMintERC721),
            address(paymentToken)
        );
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
        address payment,
        uint256 startTime,
        uint256 endTime
    ) public nonReentrant {
        require(ids.length == amounts.length && amounts.length == prices.length, "ERROR: Invalid length of input");
        require(_checkTypeNft(nftAddress) != TypeNft.NONE, "ERROR: Invalid NFT address");
        for (uint256 i = 0; i < ids.length; i++) {
            _transferNFTCall(nftAddress, ids[i], amounts[i], _msgSender(), address(marketplace));
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
     *  @notice Check standard of nft contract address
     */
    function _checkTypeNft(address _contract) private returns (TypeNft) {
        if (is721(_contract)) {
            return TypeNft.ERC721;
        }
        if (is1155(_contract)) {
            return TypeNft.ERC1155;
        }

        return TypeNft.NONE;
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
        TypeNft nftType = _checkTypeNft(nftContractAddress);
        require(nftType != TypeNft.NONE, "ERROR: NFT address is compatible !");

        if (nftType == TypeNft.ERC721) {
            IERC721Upgradeable(nftContractAddress).safeTransferFrom(from, to, tokenId);
        } else {
            IERC1155Upgradeable(nftContractAddress).safeTransferFrom(from, to, tokenId, amount, "");
        }
    }
}
