// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";

contract TransferableToken {
    using SafeERC20Upgradeable for IERC20Upgradeable;

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
        address _to,
        uint256 _gasLimit
    ) public payable {
        if (isNativeToken(_paymentToken)) {
            if (msg.value > 0) require(msg.value == _amount, "Failed to send into contract");
            else transferNativeToken(_to, _amount, _gasLimit);
        } else {
            if (_to == address(this)) {
                IERC20Upgradeable(_paymentToken).safeTransferFrom(_from, _to, _amount);
            } else {
                IERC20Upgradeable(_paymentToken).transfer(_to, _amount);
            }
        }
    }
}
