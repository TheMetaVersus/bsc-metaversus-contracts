// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";

import "./Validatable.sol";

contract TransferableToken is Validatable {
    using SafeERC20Upgradeable for IERC20Upgradeable;

    /*------------------Initializer------------------*/

    function __TransferableToken_init(IAdmin _admin) internal onlyInitializing validAdmin(_admin) {
        __Validatable_init(_admin);
    }

    /*------------------External Funtions------------------*/

    /**
     *  @notice Check payment token or native token
     */
    function isNativeToken(IERC20Upgradeable _paymentToken) public pure returns (bool) {
        return address(_paymentToken) == address(0);
    }

    /**
     *  @notice Transfer native token
     */
    function transferNativeToken(address _to, uint256 _amount) internal {
        // solhint-disable-next-line indent
        (bool success, ) = _to.call{ value: _amount }("");
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
                transferNativeToken(_to, _amount);
            } else {
                IERC20Upgradeable(_paymentToken).safeTransfer(_to, _amount);
            }
        }
    }
}
