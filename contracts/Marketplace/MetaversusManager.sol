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

    enum FeeType {
        FEE_CREATE,
        FEE_STAKING_NFT,
        FEE_EVENT_NFT
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
     *  @notice fees is fee of each FeeType function mapping uint256(FeeType) to value
     */
    mapping(uint256 => uint256) public fees;

    /**
     *  @notice treasury store the address of the TreasuryManager contract
     */
    address public treasury;

    /**
     *  @notice marketplace store the address of the marketplaceManager contract
     */
    IMarketplaceManager public marketplace;

    event BoughtTicket(address indexed to);
    event BoughtTicketEvent(address indexed to, uint256 indexed eventid);
    event SetFee(uint256 indexed newFee, uint256 indexed feeType);
    event SetTreasury(address indexed oldTreasury, address indexed newTreasury);
    event SetMarketplace(address indexed oldTreasury, address indexed newTreasury);
    event Created(string indexed typeMint, address indexed to, uint256 indexed amount);

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
        uint256 _feeStakingNFT,
        uint256 _feeEventNFT
    ) public initializer {
        OwnableUpgradeable.__Ownable_init();
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
        fees[uint256(FeeType.FEE_EVENT_NFT)] = _feeEventNFT;
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
     * @dev This seems to be the best way to compare strings in Solidity
     */
    function compareStrings(string memory a, string memory b) private pure returns (bool) {
        return (keccak256(abi.encodePacked((a))) == keccak256(abi.encodePacked((b))));
    }

    /**
     *  @notice Create NFT
     *
     *  @dev    All caller can call this function.
     */
    function createNFT(bytes memory params)
        external
        nonReentrant
        // notZeroAmount(amount)
        whenNotPaused
    {
        (string memory typeNft, uint256 amount) = abi.decode(params, (string, uint256));
        require(amount > 0, "ERROR: Amount must greater than 0");
        paymentToken.safeTransferFrom(_msgSender(), treasury, fees[uint256(FeeType.FEE_CREATE)]);

        if (compareStrings(typeNft, "ERC721")) {
            tokenMintERC721.mint(address(marketplace));
            marketplace.updateCreateNFT(address(tokenMintERC721), 0, 1, _msgSender());
        } else if (compareStrings(typeNft, "ERC1155")) {
            tokenMintERC1155.mint(address(marketplace), amount);
            marketplace.updateCreateNFT(address(tokenMintERC1155), 1, amount, _msgSender());
        }

        emit Created(typeNft, _msgSender(), amount);
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
    function buyTicketEvent(uint256 eventId) external nonReentrant whenNotPaused {
        paymentToken.safeTransferFrom(_msgSender(), treasury, fees[uint256(FeeType.FEE_EVENT_NFT)]);

        emit BoughtTicketEvent(_msgSender(), eventId);
    }
}
