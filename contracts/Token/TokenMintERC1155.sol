// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC1155/ERC1155Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/common/ERC2981Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/CountersUpgradeable.sol";
import "../Adminable.sol";

/**
 *  @title  Dev Non-fungible token
 *
 *  @author Metaversus Team
 *
 *  @notice This smart contract create the token ERC1155 for Operation. These tokens initially are minted
 *          by the all user and using for purchase in marketplace operation.
 *          The contract here by is implemented to initial some NFT with royalties.
 */
contract TokenMintERC1155 is
    Initializable,
    Adminable,
    ReentrancyGuardUpgradeable,
    ERC1155Upgradeable,
    ERC2981Upgradeable
{
    using SafeERC20Upgradeable for IERC20Upgradeable;
    using CountersUpgradeable for CountersUpgradeable.Counter;

    /**
     *  @notice FIXED_PRICE is price of each NFT sold
     */
    uint256 public constant FIXED_PRICE = 100000;

    /**
     *  @notice tokenCounter uint256 (counter). This is the counter for store
     *          current token ID value in storage.
     */
    CountersUpgradeable.Counter public tokenCounter;

    /**
     *  @notice paymentToken IERC20Upgradeable is interface of payment token
     */
    IERC20Upgradeable public paymentToken;

    /**
     *  @notice treasury store the address of the TreasuryManager contract
     */
    address public treasury;

    /**
     *  @notice uris mapping from token ID to token uri
     */
    mapping(uint256 => string) public uris;

    /**
     *  @notice defaultRoyaltyInfo is array royalties info
     */
    RoyaltyInfo public defaultRoyaltyInfo;

    event SetTreasury(address indexed oldTreasury, address indexed newTreasury);
    event Bought(uint256 indexed tokenId, address indexed to, uint256 indexed timestamp);
    event Minted(uint256 indexed tokenId, address indexed to, uint256 indexed timestamp);

    /**
     *  @notice Initialize new logic contract.
     */
    function initialize(
        address _owner,
        string memory __uri,
        address _paymentToken,
        address _treasury,
        uint96 _feeNumerator
    ) public initializer {
        ERC1155Upgradeable.__ERC1155_init(__uri);
        OwnableUpgradeable.__Ownable_init();
        paymentToken = IERC20Upgradeable(_paymentToken);
        transferOwnership(_owner);
        treasury = _treasury;
        _setDefaultRoyalty(_treasury, _feeNumerator);
        defaultRoyaltyInfo = RoyaltyInfo(_treasury, _feeNumerator);
    }

    /**
     *  @notice Return token URI.
     */
    function uri(uint256 tokenId) public view override returns (string memory) {
        return uris[tokenId];
    }

    /**
     *  @notice Set new uri for each token ID
     */
    function setURI(string memory newuri, uint256 tokenId) public onlyOwnerOrAdmin {
        uris[tokenId] = newuri;
    }

    /**
     * @dev See {IERC165-supportsInterface} override for ERC2981Upgradeable, ERC1155Upgradeable
     */
    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC1155Upgradeable, ERC2981Upgradeable)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }

    /**
     *  @notice set treasury to change TreasuryManager address.
     *
     *  @dev    Only owner or admin can call this function.
     */
    function setTreasury(address account) public onlyOwnerOrAdmin {
        address oldTreasury = treasury;
        treasury = account;
        emit SetTreasury(oldTreasury, treasury);
    }

    /**
     *  @notice Buy NFT directly
     *
     *  @dev    All users can call this function.
     */
    function buy(uint256 amount, string memory newuri) public nonReentrant {
        uint256 tokenId = tokenCounter.current();
        uris[tokenId] = newuri;

        paymentToken.safeTransferFrom(_msgSender(), treasury, FIXED_PRICE);

        _mint(_msgSender(), tokenId, amount, "");
        tokenCounter.increment();

        emit Bought(tokenId, _msgSender(), block.timestamp);
    }

    /**
     *  @notice Mint NFT not pay token
     *
     *  @dev    Only owner or admin can call this function.
     */
    function mint(address receiver, uint256 amount) public onlyOwnerOrAdmin {
        uint256 tokenId = tokenCounter.current();

        _mint(receiver, tokenId, amount, "");
        tokenCounter.increment();

        emit Minted(tokenId, receiver, block.timestamp);
    }
}
