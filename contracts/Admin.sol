// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";

import "./interfaces/IAdmin.sol";
import "./interfaces/ITokenMintERC721.sol";
import "./interfaces/ITokenMintERC1155.sol";
import "./interfaces/IMarketplaceManager.sol";
import "./interfaces/IStakingPool.sol";

/**
 *  @title  Dev Admin Contract
 *
 *  @author Metaversus Team
 *
 *  @notice This smart contract is contract to control access and role to call function
 */
contract Admin is OwnableUpgradeable, PausableUpgradeable, IAdmin {
    /**
     *  @notice _admins mapping from token ID to isAdmin status
     */
    mapping(address => bool) public admins;

    ITokenMintERC721 tokenMintERC721;
    ITokenMintERC1155 tokenMintERC1155;
    IMarketplaceManager marketplaceManager;
    IStakingPool stakingPool;

    event SetAdmin(address indexed user, bool allow);
    event SetPause(bool indexed isPause);

    modifier validWallet(address _account) {
        require(_account != address(0) && !AddressUpgradeable.isContract(_account), "Invalid wallets");
        _;
    }

    /**
     *  @notice Initialize new logic contract.
     */
    function initialize(address _owner) public initializer validWallet(_owner) {
        __Ownable_init();
        __Pausable_init();

        transferOwnership(_owner);
        _pause();
    }

    /**
     *  @notice Replace the admin role by another address.
     *  @dev    Only owner can call this function.
     */
    function setAdmin(address user, bool allow) external onlyOwner validWallet(user) {
        admins[user] = allow;
        emit SetAdmin(user, allow);
    }

    /**
     *  @notice Replace the admin role by another address.
     *  @dev    Only owner can call this function.
     */
    function setTokenMintERC721(ITokenMintERC721 _tokenMintERC721) external onlyOwner {
        tokenMintERC721 = _tokenMintERC721;
    }

    /**
     *  @notice Replace the admin role by another address.
     *  @dev    Only owner can call this function.
     */
    function setTokenMintERC1155(ITokenMintERC1155 _tokenMintERC1155) external onlyOwner {
        tokenMintERC1155 = _tokenMintERC1155;
    }

    /**
     *  @notice Replace the admin role by another address.
     *  @dev    Only owner can call this function.
     */
    function setMarketplaceManager(IMarketplaceManager _marketplaceManager) external onlyOwner {
        marketplaceManager = _marketplaceManager;
    }

    /**
     *  @notice Replace the admin role by another address.
     *  @dev    Only owner can call this function.
     */
    function setStakingPool(IStakingPool _stakingPool) external onlyOwner {
        stakingPool = _stakingPool;
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
     * @notice Get owner of this contract
     * @dev Using in related contracts
     */
    function owner() public view override(IAdmin, OwnableUpgradeable) returns (address) {
        return super.owner();
    }

    /**
     *  @notice Check account whether it is the admin role.
     */
    function isAdmin(address _account) external view virtual returns (bool) {
        return admins[_account] || _account == owner();
    }

    /**
     *  @notice Check contract is paused.
     */
    function isPaused() external view virtual returns (bool) {
        return super.paused();
    }

    /**
     *  @notice Check account whether it is the admin role.
     */
    function isTokenMintERC721(address _tokenMintERC721) external view virtual returns (bool) {
        return _tokenMintERC721 == tokenMintERC721;
    }

    /**
     *  @notice Check account whether it is the admin role.
     */
    function isTokenMintERC1155(address _tokenMintERC1155) external view virtual returns (bool) {
        return _tokenMintERC1155 == tokenMintERC1155;
    }

    /**
     *  @notice Check account whether it is the admin role.
     */
    function isMarketplaceManager(address _marketplaceManager) external view virtual returns (bool) {
        return _marketplaceManager == marketplaceManager;
    }

    /**
     *  @notice Check account whether it is the admin role.
     */
    function isStakingPool(address _stakingPool) external view virtual returns (bool) {
        return _stakingPool == stakingPool;
    }
}
