// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC721/extensions/ERC721EnumerableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/common/ERC2981Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/CountersUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/StringsUpgradeable.sol";
import "../Adminable.sol";

/**
 *  @title  Dev Non-fungible token
 *
 *  @author Metaversus Team
 *
 *  @notice This smart contract create the token ERC721 for staking Operation. These tokens initially are minted
 *          by the all user and using for staking in staking pool operation.
 *          The contract here by is implemented to initial some NFT with royalties.
 */
contract NFTMTVSTicket is
    Initializable,
    ReentrancyGuardUpgradeable,
    Adminable,
    ERC721EnumerableUpgradeable,
    ERC2981Upgradeable
{
    using SafeERC20Upgradeable for IERC20Upgradeable;
    using CountersUpgradeable for CountersUpgradeable.Counter;
    using StringsUpgradeable for uint256;
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
     *  @notice price is price of each NFT sold
     */
    uint256 public price;

    /**
     *  @notice treasury store the address of the TreasuryManager contract
     */
    address public treasury;

    /**
     *  @notice baseURI is base uri of collection
     */
    string public baseURI;

    event SetPrice(uint256 oldPrice, uint256 price);
    event SetTreasury(address indexed oldTreasury, address indexed newTreasury);
    event Bought(uint256 indexed tokenId, address indexed to, uint256 timestamp);
    event Minted(uint256 indexed tokenId, address indexed to, uint256 timestamp);

    /**
     *  @notice Set base URI
     */
    function setBaseURI(string memory newURI) external onlyOwnerOrAdmin {
        baseURI = newURI;
    }

    /**
     *  @notice Mapping token ID to base URI in ipfs storage
     *
     *  @dev    All caller can call this function.
     */
    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        require(_exists(tokenId), "ERC721Metadata: URI query for nonexistent token.");

        return
            bytes(baseURI).length > 0
                ? string(abi.encodePacked(baseURI, "/", tokenId.toString(), ".json"))
                : ".json";
    }

    /**
     *  @notice Initialize new logic contract.
     */
    function initialize(
        address _owner,
        string memory _name,
        string memory _symbol,
        address _paymentToken,
        address _treasury,
        uint96 _feeNumerator,
        uint256 _price
    ) public initializer {
        ERC721Upgradeable.__ERC721_init(_name, _symbol);
        OwnableUpgradeable.__Ownable_init();
        paymentToken = IERC20Upgradeable(_paymentToken);
        transferOwnership(_owner);
        treasury = _treasury;
        price = _price;
        _setDefaultRoyalty(_treasury, _feeNumerator);
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
     *  @notice Buy NFT directly
     *
     *  @dev    All users can call this function.
     */
    function buy() external nonReentrant {
        tokenCounter.increment();
        uint256 tokenId = tokenCounter.current();

        paymentToken.safeTransferFrom(_msgSender(), treasury, price);

        _mint(_msgSender(), tokenId);

        emit Bought(tokenId, _msgSender(), block.timestamp);
    }

    /**
     *  @notice Mint NFT not pay token
     *
     *  @dev    Only owner or admin can call this function.
     */
    function mint(address receiver) external onlyOwnerOrAdmin notZeroAddress(receiver) {
        tokenCounter.increment();
        uint256 tokenId = tokenCounter.current();

        _mint(receiver, tokenId);

        emit Minted(tokenId, receiver, block.timestamp);
    }

    /**
     * @dev See {IERC165-supportsInterface} override for ERC2981Upgradeable, ERC721EnumerableUpgradeable
     */
    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721EnumerableUpgradeable, ERC2981Upgradeable)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
