// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC721/extensions/ERC721EnumerableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/common/ERC2981Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/CountersUpgradeable.sol";

import "../interfaces/ITokenMintERC721.sol";
import "./ICollection.sol";
import "../Validatable.sol";

/**
 *  @title  Dev Non-fungible token
 *
 *  @author Metaversus Team
 *
 *  @notice This smart contract create the token ERC721 for Operation.
 *          The contract here by is implemented to initial some NFT with royalties.
 */
contract TokenERC721 is
    Validatable,
    ReentrancyGuardUpgradeable,
    ERC721EnumerableUpgradeable,
    ERC2981Upgradeable,
    ITokenMintERC721,
    ICollection
{
    using SafeERC20Upgradeable for IERC20Upgradeable;
    using CountersUpgradeable for CountersUpgradeable.Counter;

    uint256 public maxTotalSupply;
    uint256 public maxBatch;

    /**
     *  @notice _tokenCounter uint256 (counter). This is the counter for store
     *          current token ID value in storage.
     */
    CountersUpgradeable.Counter private _tokenCounter;

    /**
     *  @notice uris mapping from token ID to token uri
     */
    mapping(uint256 => string) public uris;

    event Minted(uint256 indexed tokenId, address indexed to);
    event MintBatch(address indexed to, uint256[] tokenIds, string[] newUri);
    event SetMaxBatch(uint256 indexed oldMaxBatch, uint256 indexed newMaxBatch);

    /**
     *  @notice Initialize new logic contract.
     */
    function initialize(
        string memory _name,
        string memory _symbol,
        uint256 _totalSuply,
        address _receiverRoyalty,
        uint96 _feeNumerator,
        address _admin
    ) public initializer {
        __Validatable_init(IAdmin(_admin));
        __ReentrancyGuard_init();
        __ERC721_init(_name, _symbol);

        maxTotalSupply = _totalSuply;

        if (_receiverRoyalty != address(0)) {
            _setDefaultRoyalty(_receiverRoyalty, _feeNumerator);
        }
    }

    /**
     *  @notice Mint NFT not pay token
     *
     *  @dev    Only owner or admin can call this function.
     */
    function mint(address _receiver, string memory _uri) external onlyAdmin notZeroAddress(_receiver) {
        require(totalSupply() < maxTotalSupply, "Exceeding the totalSupply");
        
        _tokenCounter.increment();
        uint256 _tokenId = _tokenCounter.current();
        uris[_tokenId] = _uri;

        _mint(_receiver, _tokenId);

        emit Minted(_tokenId, _receiver);
    }

    function mintBatch(
        address _receiver,
        string[] memory _uris,
        uint256 _times
    ) external onlyAdmin notZeroAddress(_receiver) {
        require(_times > 0 && _times <= maxBatch, "Must mint fewer in each batch");
        require(_times == _uris.length, "Invalid length baseUri");
        require(totalSupply() + _times <= maxTotalSupply, "Exceeding the totalSupply");

        uint256[] memory _tokenIds = new uint256[](_times);

        for (uint256 i; i < _times; i++) {
            _tokenCounter.increment();
            uint256 _tokenId = _tokenCounter.current();
            uris[_tokenId] = _uris[i];
            _tokenIds[i] = _tokenId;

            _safeMint(_msgSender(), _tokenId);
        }
        emit MintBatch(_receiver, _tokenIds, _uris);
    }

    /**
     *  @notice Set new uri for each token ID
     */
    function setTokenURI(string memory newURI, uint256 tokenId) external onlyAdmin {
        uris[tokenId] = newURI;
    }

    /**
     *  @notice Set maxBatch value to mint
     *  @param  _maxBatch that set maxBatch value
     */
    function setMaxBatch(uint256 _maxBatch) external onlyOwner {
        require(_maxBatch > 0, "Invalid maxBatch");
        uint256 oldMaxBatch = maxBatch;
        maxBatch = _maxBatch;
        emit SetMaxBatch(oldMaxBatch, _maxBatch);
    }

    /**
     *  @notice Get token counter
     *
     *  @dev    All caller can call this function.
     */
    function getTokenCounter() external view returns (uint256) {
        return _tokenCounter.current();
    }

    /**
     *  @notice Get list token ID of owner address.
     */
    function tokensOfOwner(address owner) public view returns (uint256[] memory) {
        uint256 count = balanceOf(owner);
        uint256[] memory ids = new uint256[](count);
        for (uint256 i = 0; i < count; i++) {
            ids[i] = tokenOfOwnerByIndex(owner, i);
        }
        return ids;
    }

    /**
     *  @notice Mapping token ID to base URI in ipfs storage
     *
     *  @dev    All caller can call this function.
     */
    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        require(_exists(tokenId), "ERC721Metadata: URI query for nonexistent token.");
        return uris[tokenId];
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
        override(ERC721EnumerableUpgradeable, ERC2981Upgradeable, IERC165Upgradeable)
        returns (bool)
    {
        return interfaceId == type(ITokenMintERC721).interfaceId || super.supportsInterface(interfaceId);
    }
}
