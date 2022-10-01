// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/introspection/ERC165Upgradeable.sol";
import "./interfaces/IAdmin.sol";
import "./interfaces/ITokenMintERC721.sol";
import "./interfaces/ITokenMintERC1155.sol";
import "./interfaces/IMarketplaceManager.sol";
import "./interfaces/IStakingPool.sol";
import "./interfaces/IOrder.sol";

/**
 *  @title  Dev Admin Contract
 *
 *  @author Metaversus Team
 *
 *  @notice This smart contract is contract to control access and role to call function
 */
contract Admin is OwnableUpgradeable, ERC165Upgradeable, IAdmin {
    /**
     *  @notice mapping from token ID to isAdmin status
     */
    mapping(address => bool) public admins;

    ITokenMintERC721 public tokenMintERC721;
    ITokenMintERC1155 public tokenMintERC1155;
    IMarketplaceManager public marketplaceManager;
    IStakingPool public stakingPool;
    IOrder public order;

    event SetAdmin(address indexed user, bool allow);

    modifier validWallet(address _account) {
        require(_account != address(0) && !AddressUpgradeable.isContract(_account), "Invalid wallets");
        _;
    }

    /**
     *  @notice Initialize new logic contract.
     */
    function initialize(address _owner) public initializer validWallet(_owner) {
        __Ownable_init();
        __ERC165_init();

        transferOwnership(_owner);
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
     * @notice Get owner of this contract
     * @dev Using in related contracts
     */
    function owner() public view override(IAdmin, OwnableUpgradeable) returns (address) {
        return super.owner();
    }

    /**
     *  @notice Check account whether it is the owner role.
     */
    function isOwner(address _account) external view virtual returns (bool) {
        return _account == owner();
    }

    /**
     *  @notice Check account whether it is the admin role.
     */
    function isAdmin(address _account) external view virtual returns (bool) {
        return admins[_account] || _account == owner();
    }

    /**
     *  @notice Check account whether it is the admin order.
     */
    function isOrder(address _account) external view virtual returns (bool) {
        return address(order) == _account;
    }

    /**
     *  @notice Check account whether it is the admin order.
     */
    function setOrder(address _account) external onlyOwner {
        order = IOrder(_account);
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
        return interfaceId == type(IAdmin).interfaceId || super.supportsInterface(interfaceId);
    }
}
