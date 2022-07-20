// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import "../Adminable.sol";
import "../interfaces/ITokenMintERC721.sol";
import "../interfaces/ITokenMintERC1155.sol";
import "../interfaces/INFTMTVSTicket.sol";
import "../interfaces/IMarketplaceManager.sol";

/**
 *  @title  Dev Metaversus Contract
 *
 *  @author Metaversus Team
 *
 *  @notice This smart contract create the token metaversus manager for Operation. These contract using to control
 *          all action which user call and interact for purchasing in marketplace operation.
 */
contract MetaversusManager is
    Initializable,
    ReentrancyGuardUpgradeable,
    Adminable,
    PausableUpgradeable
{
    using SafeERC20Upgradeable for IERC20Upgradeable;

    enum TypeNft {
        ERC721,
        ERC1155
    }
    enum FeeType {
        FEE_CREATE,
        FEE_STAKING_NFT
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
     *  @notice nftTicket is interface of ticket
     */
    INFTMTVSTicket public nftTicket;

    /**
     *  @notice marketplace store the address of the marketplaceManager contract
     */
    IMarketplaceManager public marketplace;

    /**
     *  @notice treasury store the address of the TreasuryManager contract
     */
    address public treasury;

    /**
     *  @notice fees is fee of each FeeType function mapping uint256(FeeType) to value
     */
    mapping(uint256 => uint256) public fees;

    event BoughtTicket(address indexed to);
    event BoughtTicketEvent(address indexed to, uint256 indexed eventid);
    event SetFee(uint256 indexed newFee, uint256 indexed feeType);
    event SetTreasury(address indexed oldTreasury, address indexed newTreasury);
    event SetMarketplace(address indexed oldTreasury, address indexed newTreasury);
    event Created(uint256 indexed typeMint, address indexed to, uint256 indexed amount);

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
        address nft721Addr,
        address nft1155Addr,
        address _nftTicket,
        address _paymentToken,
        address _treasury,
        address _marketplaceAddr,
        uint256 _feeCreate,
        uint256 _feeStakingNFT
    ) public initializer {
        Adminable.__Adminable_init();
        PausableUpgradeable.__Pausable_init();
        transferOwnership(_owner);
        treasury = _treasury;
        marketplace = IMarketplaceManager(_marketplaceAddr);
        paymentToken = IERC20Upgradeable(_paymentToken);
        tokenMintERC721 = ITokenMintERC721(nft721Addr);
        tokenMintERC1155 = ITokenMintERC1155(nft1155Addr);
        nftTicket = INFTMTVSTicket(_nftTicket);
        fees[uint256(FeeType.FEE_CREATE)] = _feeCreate;
        fees[uint256(FeeType.FEE_STAKING_NFT)] = _feeStakingNFT;
        pause();
    }

    /**
     *  @notice Get create fee
     */
    function getCreateFee() external view returns (uint256) {
        return fees[0];
    }

    /**
     *  @notice Get buy ticket fee
     */
    function getTicketFee() external view returns (uint256) {
        return fees[1];
    }

    /**
     *  @notice Get all params
     */
    function getAllConstantParams()
        external
        view
        returns (
            address,
            address,
            address,
            address,
            address,
            address,
            uint256,
            uint256
        )
    {
        return (
            treasury,
            address(marketplace),
            address(nftTicket),
            address(tokenMintERC1155),
            address(tokenMintERC721),
            address(paymentToken),
            fees[0],
            fees[1]
        );
    }

    /**
     *  @notice Set treasury to change TreasuryManager address.
     *
     *  @dev    Only owner or admin can call this function.
     */
    function setTreasury(address account) external onlyOwnerOrAdmin notZeroAddress(account) {
        address oldTreasury = treasury;
        treasury = account;
        emit SetTreasury(oldTreasury, treasury);
    }

    /**
     *  @notice Set Marketplace to change MarketplaceManager address.
     *
     *  @dev    Only owner or admin can call this function.
     */
    function setMarketplace(address newMarketplace)
        external
        onlyOwnerOrAdmin
        notZeroAddress(newMarketplace)
    {
        address oldMarketplace = address(marketplace);
        marketplace = IMarketplaceManager(newMarketplace);
        emit SetMarketplace(oldMarketplace, address(marketplace));
    }

    /**
     *  @notice Set fee
     *
     *  @dev    Only owner or admin can call this function.
     */
    function setFee(uint256 newFee, FeeType feetype)
        external
        onlyOwnerOrAdmin
        notZeroAmount(newFee)
    {
        fees[uint256(feetype)] = newFee;
        emit SetFee(newFee, uint256(feetype));
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
        uint256 time
    ) external nonReentrant notZeroAmount(amount) whenNotPaused {
        paymentToken.safeTransferFrom(_msgSender(), treasury, fees[uint256(FeeType.FEE_CREATE)]);

        if (typeNft == TypeNft.ERC721) {
            tokenMintERC721.mint(_msgSender(), address(marketplace), uri);
            uint256 currentId = tokenMintERC721.getTokenCounter();
            marketplace.callAfterMint(
                address(tokenMintERC721),
                currentId,
                amount,
                price,
                _msgSender(),
                time
            );
        } else if (typeNft == TypeNft.ERC1155) {
            tokenMintERC1155.mint(_msgSender(), address(marketplace), amount, uri);
            uint256 currentId = tokenMintERC1155.getTokenCounter();
            marketplace.callAfterMint(
                address(tokenMintERC1155),
                currentId,
                amount,
                price,
                _msgSender(),
                time
            );
        }

        emit Created(uint256(typeNft), _msgSender(), amount);
    }

    /**
     *  @notice Buy NFT Ticket for staking pool
     *
     *  @dev    All caller can call this function.
     */
    function buyTicket() external nonReentrant whenNotPaused {
        paymentToken.safeTransferFrom(
            _msgSender(),
            treasury,
            fees[uint256(FeeType.FEE_STAKING_NFT)]
        );
        nftTicket.mint(_msgSender());

        emit BoughtTicket(_msgSender());
    }

    /**
     *  @notice Buy NFT Ticket for join events
     *
     *  @dev    All caller can call this function.
     */
    function buyTicketEvent(uint256 eventId, uint256 amount)
        external
        nonReentrant
        notZeroAmount(eventId)
        notZeroAmount(amount)
        whenNotPaused
    {
        paymentToken.safeTransferFrom(_msgSender(), treasury, amount);

        emit BoughtTicketEvent(_msgSender(), eventId);
    }
}
