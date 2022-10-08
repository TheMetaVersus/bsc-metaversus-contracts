// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";

import "./Validatable.sol";

contract TransferableToken is Validatable {
    using SafeERC20Upgradeable for IERC20Upgradeable;

    /**
     *  @notice Gas limit when transfer token
     */
    uint256 public tokenTransferGasLimit;

    event SetTokenTransferGasLimit(uint256 oldValue, uint256 newValue);

    /*------------------Initializer------------------*/

    function __TransferableToken_init(IAdmin _admin) internal onlyInitializing validAdmin(_admin) {
        __Validatable_init(_admin);

        tokenTransferGasLimit = 2300;
    }

    /*------------------External Funtions------------------*/

    /**
     *  @notice Check payment token or native token
     */
    function setTokenTransferGasLimit(uint256 _newValue) external onlyAdmin {
        uint256 oldTokenTransferGasLimit = tokenTransferGasLimit;
        tokenTransferGasLimit = _newValue;

        emit SetTokenTransferGasLimit(oldTokenTransferGasLimit, tokenTransferGasLimit);
    }

    /**
     *  @notice Check payment token or native token
     */
    function isNativeToken(IERC20Upgradeable _paymentToken) public pure returns (bool) {
        return address(_paymentToken) == address(0);
    }

    /**
     *  @notice Transfer native token
     */
    function transferNativeToken(
        address _to,
        uint256 _value, // solhint-disable-line no-unused-vars
        uint256 _gasLimit // solhint-disable-line no-unused-vars
    ) internal {
        // solhint-disable-next-line indent
        (bool success, ) = _to.call{ value: _value, gas: _gasLimit }(new bytes(0));
        require(success, "SafeTransferNative: transfer failed");
    }

    /**
     *  @notice Transfer token
     */
    function _transferToken(
        IERC20Upgradeable _paymentToken,
        uint256 _amount,
        address _from,
        address _to
    ) public payable {
        if (_to == address(this)) {
            if (isNativeToken(_paymentToken)) {
                require(msg.value == _amount, "Failed to send into contrac");
            } else {
                IERC20Upgradeable(_paymentToken).safeTransferFrom(_from, _to, _amount);
            }
        } else {
            if (isNativeToken(_paymentToken)) {
                (bool success, ) = _to.call{ value: _amount, gas: tokenTransferGasLimit }(new bytes(0));
                require(success, "SafeTransferNative: transfer failed");
            } else {
                IERC20Upgradeable(_paymentToken).safeTransfer(_to, _amount);
            }
        }
    }
}
