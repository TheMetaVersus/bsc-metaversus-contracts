// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/structs/EnumerableSetUpgradeable.sol";
import "../Adminable.sol";

/**
 *  @title  Dev Treasury Contract
 *
 *  @author Metaversus Team
 *
 *  @notice This smart contract create thetreasury for Operation. This contract initially store
 *          all assets and using for purchase in marketplace operation.
 */
contract Treasury is Initializable, Adminable, ReentrancyGuardUpgradeable {
    using SafeERC20Upgradeable for IERC20Upgradeable;
    using EnumerableSetUpgradeable for EnumerableSetUpgradeable.AddressSet;
    /**
     *  @notice _permitedTokens mapping from token address to isPermited status
     */
    EnumerableSetUpgradeable.AddressSet private _permitedTokens;

    event Distributed(
        address indexed paymentToken,
        address indexed destination,
        uint256 indexed amount
    );
    event SetPaymentToken(address indexed paymentToken, bool indexed allow);

    /**
     *  @notice Initialize new logic contract.
     */
    function initialize(address _owner) public initializer notZeroAddress(_owner) {
        Adminable.__Adminable_init();
        transferOwnership(_owner);
    }

    /**
     *  @notice Return permit token status
     */
    function isPermitedToken(address _paymentToken) public view returns (bool) {
        return _permitedTokens.contains(_paymentToken);
    }

    /**
     *  @notice Distribute reward depend on tokenomic.
     */
    function setPermitedPaymentToken(address _paymentToken, bool allow)
        external
        onlyOwnerOrAdmin
        notZeroAddress(_paymentToken)
    {
        if (allow) {
            _permitedTokens.add(_paymentToken);
        } else if (isPermitedToken(_paymentToken)) {
            _permitedTokens.remove(_paymentToken);
        }

        emit SetPaymentToken(_paymentToken, allow);
    }

    /**
     *  @notice Distribute reward depend on tokenomic.
     */
    function distribute(
        address _paymentToken,
        address _destination,
        uint256 _amount
    )
        external
        onlyOwnerOrAdmin
        notZeroAddress(_paymentToken)
        notZeroAddress(_destination)
        notZeroAmount(_amount)
        nonReentrant
    {
        require(isPermitedToken(_paymentToken), "ERROR: token is not permit !");
        IERC20Upgradeable(_paymentToken).safeTransfer(_destination, _amount);

        emit Distributed(_paymentToken, _destination, _amount);
    }
}
