// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

import "@openzeppelin/contracts-upgradeable/utils/ContextUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";

import "../interfaces/ITokenMintERC721.sol";
import "../interfaces/ITokenMintERC1155.sol";
import "../interfaces/INFTMTVSTicket.sol";
import "../interfaces/IMarketplaceManager.sol";
import "../interfaces/IAdmin.sol";

/**
 *  @title  Dev Metaversus Contract
 *
 *  @author Metaversus Team
 *
 *  @notice This smart contract create the token metaversus manager for Operation. These contract using to control
 *          all action which user call and interact for purchasing in marketplace operation.
 */
contract MetaversusManager is ContextUpgradeable, ReentrancyGuardUpgradeable {
    using SafeERC20Upgradeable for IERC20Upgradeable;

    enum TypeNft {
        ERC721,
        ERC1155
    }

    /**
     *  @notice paymentToken IAdmin is interface of Admin contract
     */
    IAdmin public admin;

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
     *  @notice treasury store the address of the TreasuryManager contract
     */
    address public treasury;

    event BoughtTicket(address indexed to);
    event BoughtTicketEvent(address indexed to, string indexed eventid);
    event SetTreasury(address indexed oldTreasury, address indexed newTreasury);
    event SetMarketplace(IMarketplaceManager indexed oldTreasury, IMarketplaceManager indexed newTreasury);
    event Created(uint256 indexed typeMint, address indexed to, uint256 indexed amount);
    event SetPause(bool isPause);

    modifier onlyAdmin() {
        require(admin.isAdmin(_msgSender()), "Caller is not an owner or admin");
        _;
    }

    modifier whenNotPaused() {
        require(!admin.isPaused(), "Pausable: paused");
        _;
    }

    modifier validWallet(address _account) {
        require(_account != address(0) && !AddressUpgradeable.isContract(_account), "Invalid wallets");
        _;
    }

    modifier notZeroAddress(address _account) {
        require(_account != address(0), "Invalid address");
        _;
    }

    modifier notZeroAmount(uint256 _amount) {
        require(_amount > 0, "Invalid amount");
        _;
    }

    /**
     *  @notice Initialize new logic contract.
     */
    function initialize(
        address _owner,
        ITokenMintERC721 nft721Addr,
        ITokenMintERC1155 nft1155Addr,
        IERC20Upgradeable _paymentToken,
        address _treasury,
        IMarketplaceManager _marketplaceAddr,
        IAdmin _admin
    )
        public
        initializer
        validWallet(_owner)
        notZeroAddress(address(nft721Addr))
        notZeroAddress(address(nft1155Addr))
        notZeroAddress(address(_paymentToken))
        notZeroAddress(address(_treasury))
        notZeroAddress(address(_marketplaceAddr))
    {
        __Context_init();
        __ReentrancyGuard_init();

        treasury = _treasury;
        marketplace = _marketplaceAddr;
        paymentToken = _paymentToken;
        tokenMintERC721 = nft721Addr;
        tokenMintERC1155 = nft1155Addr;
        admin = _admin;
    }

    /**
     *  @notice Set treasury to change TreasuryManager address.
     *
     *  @dev    Only owner or admin can call this function.
     */
    function setTreasury(address _account) external onlyAdmin validWallet(_account) {
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
        address payment
    ) external nonReentrant whenNotPaused validWallet(payment) {
        if (typeNft == TypeNft.ERC721) {
            tokenMintERC721.mint(address(marketplace), uri);
            uint256 currentId = tokenMintERC721.getTokenCounter();
            marketplace.callAfterMint(
                address(tokenMintERC721),
                currentId,
                amount,
                price,
                _msgSender(),
                startTime,
                endTime,
                payment
            );
        } else if (typeNft == TypeNft.ERC1155) {
            tokenMintERC1155.mint(address(marketplace), amount, uri);
            uint256 currentId = tokenMintERC1155.getTokenCounter();
            marketplace.callAfterMint(
                address(tokenMintERC1155),
                currentId,
                amount,
                price,
                _msgSender(),
                startTime,
                endTime,
                payment
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
}
