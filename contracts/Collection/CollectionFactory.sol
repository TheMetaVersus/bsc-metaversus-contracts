// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

import "@openzeppelin/contracts-upgradeable/utils/CountersUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/ClonesUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/introspection/ERC165Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/structs/EnumerableSetUpgradeable.sol";

import "../interfaces/ICollection.sol";
import "../interfaces/ICollectionFactory.sol";
import "../Validatable.sol";

contract CollectionFactory is ICollectionFactory, Validatable, ERC165Upgradeable {
    using CountersUpgradeable for CountersUpgradeable.Counter;
    using EnumerableSetUpgradeable for EnumerableSetUpgradeable.AddressSet;

    uint256 public maxCollectionPerUser;
    uint256 public maxtotalSuply;
    ICollection public templateERC721;
    ICollection public templateERC1155;

    CountersUpgradeable.Counter private _collectionCounter;

    struct CollectionInfo {
        TypeNft typeNft;
        bytes32 salt;
        address collectionAddress;
        address owner;
    }

    enum TypeNft {
        ERC721,
        ERC1155
    }

    mapping(uint256 => CollectionInfo) public collectionIdToCollectionInfos;
    mapping(address => EnumerableSetUpgradeable.AddressSet) private _ownerToCollectionAddress;

    event CollectionDeployed(address collection, address deployer);
    event SetMaxCollectionPerUser(uint256 indexed oldValue, uint256 indexed newValue);
    event SetMaxtotalSuply(uint256 indexed oldValue, uint256 indexed newValue);
    event SetTemplateAddress(address indexed templateERC721, address indexed templateERC1155);

    function initialize(
        ICollection _templateERC721,
        ICollection _templateERC1155,
        IAdmin _admin
    ) public initializer {
        __ERC165_init();
        __Validatable_init(_admin);

        templateERC721 = _templateERC721;
        templateERC1155 = _templateERC1155;
        maxCollectionPerUser = 5;
        maxtotalSuply = 100;
    }

    function create(
        TypeNft _typeNft,
        string memory _name,
        string memory _symbol,
        address _receiverRoyalty,
        uint96 _feeNumerator,
        address _admin
    ) external whenNotPaused {
        require(
            _ownerToCollectionAddress[_msgSender()].length() < maxCollectionPerUser,
            "Exceeding the maxCollectionPerUser"
        );
        _collectionCounter.increment();
        uint256 _currentId = _collectionCounter.current();
        bytes32 salt = bytes32(_currentId);
        address _template = _typeNft == TypeNft.ERC721 ? address(templateERC721) : address(templateERC1155);
        ICollection _collection = ICollection(ClonesUpgradeable.cloneDeterministic(address(_template), salt));
        require(address(_collection) != address(0), "Non Exist Collection, Please check your transfer");

        // store
        CollectionInfo memory newInfo = CollectionInfo(_typeNft, salt, address(_collection), _msgSender());
        collectionIdToCollectionInfos[_currentId] = newInfo;

        // initialize
        _collection.initialize(_name, _symbol, maxtotalSuply, _receiverRoyalty, _feeNumerator, _admin);

        _ownerToCollectionAddress[_msgSender()].add(address(_collection));

        emit CollectionDeployed(address(_collection), _msgSender());
    }

    /**
     *  @notice Set maxCollectionPerUser value to mint
     *  @param  _newValue that set maxCollectionPerUser value
     */
    function setMaxCollectionPerUser(uint256 _newValue) external onlyAdmin {
        require(_newValue > 0, "Invalid maxCollectionPerUser");
        uint256 _oldValue = maxCollectionPerUser;
        maxCollectionPerUser = _newValue;
        emit SetMaxCollectionPerUser(_oldValue, maxCollectionPerUser);
    }

    /**
     *  @notice Set maxtotalSuply value to mint
     *  @param  _newValue that set maxtotalSuply value
     */
    function setMaxtotalSuply(uint256 _newValue) external onlyAdmin {
        require(_newValue > 0, "Invalid maxtotalSuply");
        uint256 _oldValue = maxtotalSuply;
        maxtotalSuply = _newValue;
        emit SetMaxtotalSuply(_oldValue, maxtotalSuply);
    }

    function setTemplateAddress(address _templateERC721, address _templateERC1155) external onlyAdmin {
        require(_templateERC721 != address(0) && _templateERC1155 != address(0), "Invalid address input");
        templateERC721 = ICollection(_templateERC721);
        templateERC1155 = ICollection(_templateERC1155);

        emit SetTemplateAddress(_templateERC721, _templateERC1155);
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
        return interfaceId == type(ICollectionFactory).interfaceId || super.supportsInterface(interfaceId);
    }

    function checkCollectionOfUser(address _user, address _nft) external view returns (bool) {
        return _ownerToCollectionAddress[_user].contains(_nft);
    }

    function getCollectionInfo(uint256 _id) external view returns (CollectionInfo memory) {
        return collectionIdToCollectionInfos[_id];
    }

    function getCollectionByUser(address _user) external view returns (address[] memory) {
        return _ownerToCollectionAddress[_user].values();
    }

    function getCollectionLength() public view returns (uint256) {
        return _collectionCounter.current();
    }
}
