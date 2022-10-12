// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";

library TransferHelper {
    using SafeERC20Upgradeable for IERC20Upgradeable;

    /**
     *  @notice Transfer token
     */
    function _transferToken(
        IERC20Upgradeable _paymentToken,
        uint256 _amount,
        address _from,
        address _to
    ) internal {
        if (_to == address(this)) {
            if (address(_paymentToken) == address(0)) {
                require(msg.value == _amount, "Failed to send into contract");
            } else {
                IERC20Upgradeable(_paymentToken).safeTransferFrom(_from, _to, _amount);
            }
        } else {
            if (address(_paymentToken) == address(0)) {
                _transferNativeToken(_to, _amount);
            } else {
                IERC20Upgradeable(_paymentToken).safeTransfer(_to, _amount);
            }
        }
    }

    /**
     *  @notice Transfer native token
     */
    function _transferNativeToken(address _to, uint256 _amount) internal {
        // solhint-disable-next-line indent
        (bool success, ) = _to.call{ value: _amount }("");
        require(success, "SafeTransferNative: transfer failed");
    }

    /**
     *  @notice Check payment token or native token
     */
    function _isNativeToken(IERC20Upgradeable _paymentToken) internal pure returns (bool) {
        return address(_paymentToken) == address(0);
    }
}
