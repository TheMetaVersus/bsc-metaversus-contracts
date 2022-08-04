// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

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
     *  @notice _tokenCounter uint256 (counter). This is the counter for store
     *          current token ID value in storage.
     */
    CountersUpgradeable.Counter private _tokenCounter;

    /**
     *  @notice paymentToken IERC20Upgradeable is interface of payment token
     */
    IERC20Upgradeable public paymentToken;

    /**
     *  @notice price is price of each NFT sold
     */
    uint256 public price;

    /**
     *  @notice treasury store the address of the TreasuryManager contract
     */
    address public treasury;

    /**
     *  @notice uris mapping from token ID to token uri
     */
    mapping(uint256 => string) public uris;

    event SetPrice(uint256 oldPrice, uint256 price);
    event SetTreasury(address indexed oldTreasury, address indexed newTreasury);
    event Minted(uint256 indexed tokenId, address indexed to);

    /**
     *  @notice Initialize new logic contract.
     */
    function initialize(
        address _owner,
        string memory __uri,
        address _paymentToken,
        address _treasury,
        uint96 _feeNumerator,
        uint256 _price
    )
        public
        initializer
        notZeroAddress(_owner)
        notZeroAddress(_paymentToken)
        notZeroAddress(_treasury)
        notZeroAmount(_feeNumerator)
        notZeroAmount(_price)
    {
        ERC1155Upgradeable.__ERC1155_init(__uri);
        Adminable.__Adminable_init();
        paymentToken = IERC20Upgradeable(_paymentToken);
        transferOwnership(_owner);
        treasury = _treasury;
        price = _price;
        _setDefaultRoyalty(_treasury, _feeNumerator);
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
    function setURI(string memory newuri, uint256 tokenId) external onlyOwnerOrAdmin {
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
    function setTreasury(address account) external onlyOwnerOrAdmin notZeroAddress(account) {
        address oldTreasury = treasury;
        treasury = account;
        emit SetTreasury(oldTreasury, treasury);
    }

    /**
     *  @notice Set price of NFT
     *
     *  @dev    Only owner or admin can call this function.
     */
    function setPrice(uint256 newPrice) external onlyOwnerOrAdmin notZeroAmount(newPrice) {
        uint256 oldPrice = price;
        price = newPrice;
        emit SetPrice(oldPrice, price);
    }

    /**
     *  @notice Mint NFT not pay token
     *
     *  @dev    Only owner or admin can call this function.
     */
    function mint(
        address seller,
        address receiver,
        uint256 amount,
        string memory newuri
    )
        external
        onlyOwnerOrAdmin
        notZeroAddress(seller)
        notZeroAddress(receiver)
        notZeroAmount(amount)
    {
        _tokenCounter.increment();
        uint256 tokenId = _tokenCounter.current();

        uris[tokenId] = newuri;

        _mint(receiver, tokenId, amount, "");

        emit Minted(tokenId, receiver);
    }

    /**
     *  @notice Get token counter
     *
     *  @dev    All caller can call this function.
     */
    function getTokenCounter() external view returns (uint256) {
        return _tokenCounter.current();
    }
}
