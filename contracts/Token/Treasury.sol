// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "../Adminable.sol";
/**
 *  @title  Dev Treasury Contract
 *
 *  @author Metaversus Team
 *
 *  @notice This smart contract create thetreasury for Operation. Theis contract initially are store
 *          all assets and using for purchase in marketplace operation. 
 */
contract Treasury is Initializable, Adminable, ReentrancyGuardUpgradeable {
    using SafeERC20Upgradeable for IERC20Upgradeable;

    /**
     *  @notice permitedTokens mapping from token address to isPermited status
     */
    mapping(address => bool) public permitedTokens;

    event Distributed(address indexed paymentToken, address indexed destination, uint256 indexed amount);
    event SetPaymentToken(address indexed paymentToken, bool indexed allow);

    /**
     *  @notice Initialize new logic contract.
     */
    function initialize(address _owner) public initializer {   
        OwnableUpgradeable.__Ownable_init();  
        transferOwnership(_owner);
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