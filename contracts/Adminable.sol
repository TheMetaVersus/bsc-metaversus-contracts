// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

/**
 *  @title  Dev Adminable Contract
 *
 *  @author Metaversus Team
 *
 *  @notice This smart contract is contract to control access and role to call function
 */
contract Adminable is OwnableUpgradeable {
    /**
     *  @notice _admins mapping from token ID to isAdmin status
     */
    mapping(address => bool) public admins;

    event SetAdmin(address indexed user, bool allow);

    modifier onlyOwnerOrAdmin() {
        require(
            (owner() == _msgSender() || admins[_msgSender()]),
            "Adminable: caller is not an owner or admin"
        );
        _;
    }

    modifier notZeroAddress(address addr) {
        require(addr != address(0), "ERROR: invalid address !");
        _;
    }

    modifier notZeroAmount(uint256 amount) {
        require(amount > 0, "ERROR: amount must be greater than zero !");
        _;
    }

    function __Adminable_init() internal onlyInitializing {
        OwnableUpgradeable.__Ownable_init();
    }

    /**
     *  @notice Replace the admin role by another address.
     *
     *  @dev    Only owner can call this function.
     */
    function setAdmin(address user, bool allow) external onlyOwner {
        admins[user] = allow;
        emit SetAdmin(user, allow);
    }

    /**
     *  @notice Check account whether it is the admin role.
     */
    function isAdmin(address account) external view returns (bool) {
        return admins[account];
    }
}
