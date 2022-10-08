// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

import "@openzeppelin/contracts-upgradeable/utils/introspection/ERC165Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC721/extensions/ERC721EnumerableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/CountersUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/StringsUpgradeable.sol";

import "../interfaces/IMetaCitizen.sol";
import "../Validatable.sol";

/**
 *  @title  MetaVerus Citizen pass
 *
 *  @author Metaversus Team
 *
 *  @notice This smart contract create the token ERC721 for represent membership value.
 *          Anyone can mint token by paying a fee, admin or owner can mint without fee.
 */
contract MetaCitizen is
    Validatable,
    ERC165Upgradeable,
    ERC721EnumerableUpgradeable,
    ReentrancyGuardUpgradeable,
    IMetaCitizen
{
    using SafeERC20Upgradeable for IERC20Upgradeable;
    using CountersUpgradeable for CountersUpgradeable.Counter;
    using StringsUpgradeable for uint256;
    /**
     *  @notice tokenCounter uint256 (counter). This is the counter for store
     *          current token ID value in storage.
     */
    CountersUpgradeable.Counter private _tokenCounter;

    /**
     *  @notice paymentToken IERC20Upgradeable is interface of payment token
     */
    IERC20Upgradeable public paymentToken;

    /**
     *  @notice fee of minting NFT
     */
    uint256 public mintFee;

    /**
     *  @notice treasury address that receive all mint fee
     */
    ITreasury public treasury;

    /**
     *  @notice baseURI is base uri of collection
     */
    string public baseURI;

    event SetPaymentToken(address indexed oldToken, address indexed newToken);
    event SetMintFee(uint256 indexed oldFee, uint256 indexed newFee);
    event SetTreasury(ITreasury indexed oldTreasury, ITreasury indexed newTreasury);
    event Bought(uint256 indexed tokenId, address indexed to);
    event Minted(uint256 indexed tokenId, address indexed to);

    /**
     *  @notice Initialize new logic contract.
     */
    function initialize(
        ITreasury _treasury,
        IERC20Upgradeable _paymentToken,
        uint256 _mintFee,
        IAdmin _admin
    ) public initializer validTreasury(_treasury) notZero(_mintFee) validAdmin(_admin) {
        __Validatable_init(_admin);
        __ReentrancyGuard_init();
        __ERC721_init("MetaversusWorld Citizen", "MWC");

        require(
            address(_paymentToken) != address(0) && admin.isPermittedPaymentToken(_paymentToken),
            "Invalid payment token"
        );

        paymentToken = _paymentToken;
        treasury = _treasury;
        mintFee = _mintFee;
    }

    /**
     *  @notice Set base URI
     *
     *  @dev    Only owner or admin can call this function
     *
     *  @param  _newURI new base URI that need to replace
     */
    function setBaseURI(string memory _newURI) external onlyOwner {
        baseURI = _newURI;
    }

    /**
     *  @notice Set payment token of minting fee
     *
     *  @dev    Only owner or admin can call this function
     *
     *  @param  _newToken new payment token need to replace
     */
    function setPaymentToken(IERC20Upgradeable _newToken) external onlyAdmin {
        require(address(_newToken) != address(0) && admin.isPermittedPaymentToken(_newToken), "Invalid payment token");
        address oldToken = address(paymentToken);
        paymentToken = IERC20Upgradeable(_newToken);
        emit SetPaymentToken(oldToken, address(_newToken));
    }

    /**
     *  @notice Set treasury to change TreasuryManager address.
     *
     *  @dev    Only owner or admin can call this function.
     *
     *  @param  _account new base URI that need to replace
     */
    function setTreasury(ITreasury _account) external onlyAdmin validTreasury(_account) {
        ITreasury oldTreasury = treasury;
        treasury = _account;
        emit SetTreasury(oldTreasury, _account);
    }

    /**
     *  @notice Set minting fee
     *
     *  @dev    Only owner or admin can call this function.
     *
     *  @param  _newFee new minting fee that need to replace
     */
    function setMintFee(uint256 _newFee) external onlyAdmin notZero(_newFee) {
        uint256 oldFee = mintFee;
        mintFee = _newFee;
        emit SetMintFee(oldFee, _newFee);
    }

    /**
     *  @notice Buy NFT by paying a fee
     *
     *  @dev    Anyone can call this function.
     */
    function buy() external nonReentrant {
        require(balanceOf(_msgSender()) == 0, "Already have one");

        _tokenCounter.increment();
        uint256 tokenId = _tokenCounter.current();

        paymentToken.safeTransferFrom(_msgSender(), address(treasury), mintFee);

        _mint(_msgSender(), tokenId);

        emit Bought(tokenId, _msgSender());
    }

    /**
     *  @notice Mint NFT without paying fee
     *
     *  @dev    Only owner or admin can call this function.
     *
     *  @param  _to address that be minted to
     */
    function mint(address _to) external onlyAdmin notZeroAddress(_to) {
        require(balanceOf(_to) == 0, "Already have one");

        _tokenCounter.increment();
        uint256 tokenId = _tokenCounter.current();

        _mint(_to, tokenId);

        emit Minted(tokenId, _to);
    }

    /**
     * @dev See {IERC721Metadata-tokenURI}.
     */
    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        require(_exists(tokenId), "ERC721Metadata: URI query for nonexistent token.");
        return bytes(baseURI).length > 0 ? string(abi.encodePacked(baseURI, ".json")) : ".json";
    }

    /**
     *  @notice Get token counter
     */
    function getTokenCounter() external view returns (uint256) {
        return _tokenCounter.current();
    }

    /**
     * @dev Hook that is called before any token transfer. This includes minting
     * and burning.
     *
     * @param from address representing the previous owner of the given token ID
     * @param to target address that will receive the tokens
     * @param tokenId uint256 ID of the token to be transferred
     *
     * Calling conditions:
     *
     * - When `from` and `to` are both non-zero, ``from``'s `tokenId` will be
     * transferred to `to`.
     * - When `from` is zero, `tokenId` will be minted for `to`.
     * - When `to` is zero, ``from``'s `tokenId` will be burned.
     * - `from` and `to` are never both zero.
     */
    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 tokenId
    ) internal override {
        super._beforeTokenTransfer(from, to, tokenId);

        require((from == address(0) || to == address(0)) && from != to, "Can not be transfered");
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
        override(ERC165Upgradeable, IERC165Upgradeable, ERC721EnumerableUpgradeable)
        returns (bool)
    {
        return interfaceId == type(IMetaCitizen).interfaceId || super.supportsInterface(interfaceId);
    }
}
