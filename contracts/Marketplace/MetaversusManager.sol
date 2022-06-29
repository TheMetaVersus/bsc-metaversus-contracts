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
    enum SelectTypeMint {
        ERC721,
        ERC1155
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
     *  @notice fee is price of each NFT sold
     */
    uint256 public fee;

    /**
     *  @notice treasury store the address of the TreasuryManager contract
     */
    address public treasury;

    event BoughtTicket(address indexed to);
    event SetFee(uint256 indexed oldFee, uint256 indexed newFee);
    event SetTreasury(address indexed oldTreasury, address indexed newTreasury);
    event Created(SelectTypeMint indexed typeMint, address indexed to, uint256 indexed amount);

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
        uint256 _fee
    ) public initializer {
        OwnableUpgradeable.__Ownable_init();
        PausableUpgradeable.__Pausable_init();
        transferOwnership(_owner);
        treasury = _treasury;
        paymentToken = IERC20Upgradeable(_paymentToken);
        tokenMintERC721 = ITokenMintERC721(nft721Addr);
        tokenMintERC1155 = ITokenMintERC1155(nft1155Addr);
        nftTicket = INFTMTVSTicket(_nftTicket);
        fee = _fee;
    }

    /**
     *  @notice Set treasury to change TreasuryManager address.
     *
     *  @dev    Only owner or admin can call this function.
     */
    function setTreasury(address account) external onlyOwnerOrAdmin {
        address oldTreasury = treasury;
        treasury = account;
        emit SetTreasury(oldTreasury, treasury);
    }

    /**
     *  @notice Set fee
     *
     *  @dev    Only owner or admin can call this function.
     */
    function setFee(uint256 newFee) external onlyOwnerOrAdmin {
        uint256 oldFee = fee;
        fee = newFee;
        emit SetFee(oldFee, newFee);
    }

    /**
     *  @notice Create NFT
     *
     *  @dev    All caller can call this function.
     */
    function createNFT(SelectTypeMint typeNft, uint256 amount) external nonReentrant whenNotPaused {
        paymentToken.safeTransferFrom(_msgSender(), treasury, fee);
        if (typeNft == SelectTypeMint.ERC721) {
            tokenMintERC721.mint(_msgSender());
        } else if (typeNft == SelectTypeMint.ERC1155) {
            tokenMintERC1155.mint(_msgSender(), amount);
        }

        emit Created(typeNft, _msgSender(), amount);
    }

    /**
     *  @notice Buy NFT Ticket
     *
     *  @dev    All caller can call this function.
     */
    function buyTicket() external nonReentrant whenNotPaused {
        paymentToken.safeTransferFrom(_msgSender(), treasury, fee);
        nftTicket.mint(_msgSender());

        emit BoughtTicket(_msgSender());
    }
}
