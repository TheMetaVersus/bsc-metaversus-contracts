// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

import "@openzeppelin/contracts-upgradeable/utils/introspection/IERC165Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";

interface IAdmin is IERC165Upgradeable {
    function isAdmin(address _account) external view returns (bool);

    function owner() external view returns (address);

    function setPermittedPaymentToken(IERC20Upgradeable _paymentToken, bool _allow) external;

    function getPermitedPaymentToken(uint256 _index) external view returns (IERC20Upgradeable);

    function isPermittedPaymentToken(IERC20Upgradeable token) external view returns (bool);

    function numPermitedPaymentTokens() external view returns (uint256);
}
