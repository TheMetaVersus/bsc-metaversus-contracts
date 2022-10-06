// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/introspection/ERC165Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/structs/EnumerableSetUpgradeable.sol";

import "./lib/NFTHelper.sol";
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
    using EnumerableSetUpgradeable for EnumerableSetUpgradeable.AddressSet;

    /**
     *  @notice mapping from token ID to isAdmin status
     */
    mapping(address => bool) public admins;

    /**
     *  @notice _permitedPaymentToken mapping from token address to payment
     */
    EnumerableSetUpgradeable.AddressSet private _permitedPaymentToken;

    event SetAdmin(address indexed user, bool allow);
    event SetPermittedPaymentToken(IERC20Upgradeable _paymentToken, bool allow);

    /**
     *  @notice Initialize new logic contract.
     */
    function initialize(address _owner) public initializer {
        require(_owner != address(0) && !AddressUpgradeable.isContract(_owner), "Invalid wallet");

        __Ownable_init();
        __ERC165_init();

        transferOwnership(_owner);
    }

    /**
     *  @notice Replace the admin role by another address.
     *  @dev    Only owner can call this function.
     */
    function setAdmin(address user, bool allow) external onlyOwner {
        admins[user] = allow;
        emit SetAdmin(user, allow);
    }

    /**
     *  @notice Set permit payment token
     */
    function setPermittedPaymentToken(IERC20Upgradeable _paymentToken, bool _allow) external {
        require(isAdmin(_msgSender()), "Caller is not an owner or admin");

        if (_allow) {
            _permitedPaymentToken.add(address(_paymentToken));
        } else if (isPermittedPaymentToken(_paymentToken)) {
            _permitedPaymentToken.remove(address(_paymentToken));
        }

        emit SetPermittedPaymentToken(_paymentToken, _allow);
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
    function isAdmin(address _account) public view virtual returns (bool) {
        return admins[_account] || _account == owner();
    }

    /**
     *  @notice Return permit token payment
     */
    function getPermitedPaymentToken(uint256 _index) external view returns (IERC20Upgradeable) {
        return IERC20Upgradeable(_permitedPaymentToken.at(_index));
    }

    /**
     *  @notice Return permit token payment
     */
    function isPermittedPaymentToken(IERC20Upgradeable token) public view returns (bool) {
        return _permitedPaymentToken.contains(address(token));
    }

    /**
     *  @notice Return permit token payment
     */
    function numPermitedPaymentTokens() external view returns (uint256) {
        return _permitedPaymentToken.length();
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
