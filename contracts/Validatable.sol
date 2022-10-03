// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

import "@openzeppelin/contracts-upgradeable/utils/introspection/ERC165CheckerUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/cryptography/MerkleProofUpgradeable.sol";

import "./interfaces/IAdmin.sol";
import "./interfaces/ITokenMintERC721.sol";
import "./interfaces/ITokenMintERC1155.sol";
import "./interfaces/ITreasury.sol";
import "./interfaces/IMarketplaceManager.sol";
import "./interfaces/ICollectionFactory.sol";
import "./interfaces/IStakingPool.sol";
import "./interfaces/IOrder.sol";

contract Validatable is PausableUpgradeable {
    /**
     *  @notice paymentToken IAdmin is interface of Admin contract
     */
    IAdmin public admin;

    event SetPause(bool indexed isPause);

    /*------------------Check Admins------------------*/

    modifier onlyOwner() {
        require(admin.owner() == _msgSender(), "Caller is not an owner");
        _;
    }

    modifier onlyAdmin() {
        require(admin.isAdmin(_msgSender()), "Caller is not an owner or admin");
        _;
    }

    modifier validWallet(address _account) {
        require(_account != address(0) && !AddressUpgradeable.isContract(_account), "Invalid wallets");
        _;
    }

    /*------------------Common Checking------------------*/

    modifier notZeroAddress(address _account) {
        require(_account != address(0), "Invalid address");
        _;
    }

    modifier notZero(uint256 _amount) {
        require(_amount > 0, "Invalid amount");
        _;
    }

    /*------------------Validate Contracts------------------*/

    modifier validAdmin(IAdmin _account) {
        require(
            ERC165CheckerUpgradeable.supportsInterface(address(_account), type(IAdmin).interfaceId),
            "Invalid Admin contract"
        );
        _;
    }

    modifier validTokenMintERC721(ITokenMintERC721 _account) {
        require(
            ERC165CheckerUpgradeable.supportsInterface(address(_account), type(ITokenMintERC721).interfaceId),
            "Invalid TokenMintERC721 contract"
        );
        _;
    }

    modifier validTokenMintERC1155(ITokenMintERC1155 _account) {
        require(
            ERC165CheckerUpgradeable.supportsInterface(address(_account), type(ITokenMintERC1155).interfaceId),
            "Invalid TokenMintERC1155 contract"
        );
        _;
    }

    modifier validTreasury(ITreasury _account) {
        require(
            ERC165CheckerUpgradeable.supportsInterface(address(_account), type(ITreasury).interfaceId),
            "Invalid Treasury contract"
        );
        _;
    }

    modifier validMarketplaceManager(IMarketplaceManager _account) {
        require(
            ERC165CheckerUpgradeable.supportsInterface(address(_account), type(IMarketplaceManager).interfaceId),
            "Invalid MarketplaceManager contract"
        );
        _;
    }

    modifier validCollectionFactory(ICollectionFactory _account) {
        require(
            ERC165CheckerUpgradeable.supportsInterface(address(_account), type(ICollectionFactory).interfaceId),
            "Invalid CollectionFactory contract"
        );
        _;
    }

    modifier validStakingPool(IStakingPool _account) {
        require(
            ERC165CheckerUpgradeable.supportsInterface(address(_account), type(IStakingPool).interfaceId),
            "Invalid StakingPool contract"
        );
        _;
    }

    modifier validOrder(IOrder _account) {
        require(
            ERC165CheckerUpgradeable.supportsInterface(address(_account), type(IOrder).interfaceId),
            "Invalid Order contract"
        );
        _;
    }

    /*------------------Initializer------------------*/

    function __Validatable_init(IAdmin _admin) internal onlyInitializing validAdmin(_admin) {
        __Context_init();
        __Pausable_init();

        admin = _admin;
        _pause();
    }

    /*------------------Contract Interupts------------------*/

    /**
     *  @notice Set pause action
     */
    function setPause(bool isPause) public onlyOwner {
        if (isPause) _pause();
        else _unpause();

        emit SetPause(isPause);
    }

    /**
     *  @notice Check contract is paused.
     */
    function isPaused() public view returns (bool) {
        return super.paused();
    }

    /**
     *  @notice Check whether merkle tree proof is valid
     *
     *  @param  _proof      Proof data of leaf node
     *  @param  _root       Root data of merkle tree
     *  @param  _account    Address of an account to verify
     */
    function isValidProof(
        bytes32[] memory _proof,
        bytes32 _root,
        address _account
    ) public pure returns (bool) {
        bytes32 leaf = keccak256(abi.encodePacked(_account));
        return MerkleProofUpgradeable.verify(_proof, _root, leaf);
    }
}
