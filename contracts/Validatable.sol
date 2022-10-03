// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

import "@openzeppelin/contracts-upgradeable/utils/introspection/ERC165CheckerUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";

import "./interfaces/IAdmin.sol";
import "./interfaces/ITokenMintERC721.sol";
import "./interfaces/ITokenMintERC1155.sol";
import "./interfaces/ITreasury.sol";
import "./interfaces/IMarketplaceManager.sol";
import "./interfaces/ICollectionFactory.sol";

contract Validatable is PausableUpgradeable {
    /**
     *  @notice paymentToken IAdmin is interface of Admin contract
     */
    IAdmin public admin;

    event SetPause(bool indexed isPause);

    modifier onlyOwner() {
        require(admin.owner() == _msgSender(), "Caller is not an owner");
        _;
    }

    modifier onlyAdmin() {
        require(admin.isAdmin(_msgSender()), "Caller is not an owner or admin");
        _;
    }

    modifier onlyOrder() {
        require(admin.isOrder(_msgSender()), "Caller is not an order contract");
        _;
    }

    modifier validWallet(address _account) {
        require(_account != address(0) && !AddressUpgradeable.isContract(_account), "Invalid wallets");
        _;
    }

    modifier notZeroAddress(address _account) {
        require(_account != address(0), "Invalid address");
        _;
    }

    modifier notZero(uint256 _amount) {
        require(_amount > 0, "Invalid amount");
        _;
    }

    /******************Validate Contracts*******************/

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

    function __Validatable_init(IAdmin _admin) internal onlyInitializing validAdmin(_admin) {
        __Context_init();
        __Pausable_init();

        admin = _admin;
        _pause();
    }
}
