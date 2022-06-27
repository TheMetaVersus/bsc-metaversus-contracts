// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";

/**
 *  @title  Dev Treasury Contract
 *
 *  @author Metaversus Team
 *
 *  @notice This smart contract create thetreasury for Operation. Theis contract initially are store
 *          all assets and using for purchase in marketplace operation. 
 */
contract Treasury is Initializable, OwnableUpgradeable, ReentrancyGuardUpgradeable {
    using SafeERC20Upgradeable for IERC20Upgradeable;

    /**
     *  @notice _admins mapping from token ID to isAdmin status
     */
    mapping(address => bool) public _admins;

    /**
     *  @notice permitedTokens mapping from token address to isPermited status
     */
    mapping(address => bool) public permitedTokens;

    event Distributed(address indexed paymentToken, address indexed destination, uint256 indexed amount);
    event SetPaymentToken(address indexed paymentToken, bool indexed allow);
    event SetAdmin(address indexed user, bool indexed allow);
    
    modifier onlyOwnerOrAdmin() {
        require((owner() == _msgSender() || _admins[_msgSender()]), "Ownable: caller is not an owner or admin");
        _;
    }

    /**
     *  @notice Initialize new logic contract.
     */
    function initialize(address _owner) public initializer {     
        OwnableUpgradeable.__Ownable_init();
        transferOwnership(_owner);

    }

    /**
     *  @notice Check account whether it is the admin role.
     *
     *  @dev    All caller can call this function.
     */
    function isAdmin(address account) public view returns(bool) {
        return  _admins[account];
    }

    /**
     *  @notice Replace the admin role by another address.
     *
     *  @dev    Only owner can call this function.
     */
    function setAdmin(address user, bool allow) public onlyOwner {
        _admins[user] = allow;
        emit SetAdmin(user, allow);
    }

    /**
     *  @notice Return permit token status
     */
    function isPermitedToken(address _paymentToken) public view returns(bool) {
        return permitedTokens[_paymentToken];
    }

    /**
     *  @notice Distribute reward depend on tokenomic.
     */
    function setPaymentToken(address _paymentToken, bool allow) public onlyOwnerOrAdmin nonReentrant {
        require(_paymentToken != address(0), "Error: Invalid address !");
        permitedTokens[_paymentToken] = allow;

        emit SetPaymentToken(_paymentToken, allow);
    }

    /**
     *  @notice Distribute reward depend on tokenomic.
     */
    function distribute(address _paymentToken, address destination, uint256 amount) public onlyOwnerOrAdmin nonReentrant {
        require(permitedTokens[_paymentToken], "Error: Token not permit !");
        require(destination != address(0), "Error: Invalid address !");
        require(amount > 0, "Error: Amount equal to zero !");
        IERC20Upgradeable(_paymentToken).safeTransfer(destination, amount);
        
        emit Distributed(_paymentToken, destination, amount);
    }
}