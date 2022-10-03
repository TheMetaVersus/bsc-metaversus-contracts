// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

import "@openzeppelin/contracts-upgradeable/utils/introspection/IERC165Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";

interface IAdmin is IERC165Upgradeable {
    function isAdmin(address _account) external view returns (bool);

    function owner() external view returns (address);

    function setPermitedNFT(address _nftAddress, bool _allow) external;

    function setPermitedPaymentToken(IERC20Upgradeable _paymentToken, bool _allow) external;

    function getPermitedNFT(uint256 _index) external view returns (address);

    function getPermitedPaymentToken(uint256 _index) external view returns (IERC20Upgradeable);

    function isPermitedNFT(address _nftAddress) external view returns (bool);

    function isPermitedPaymentToken(IERC20Upgradeable token) external view returns (bool);

    function numPermitedNFTs() external view returns (uint256);

    function numPermitedPaymentTokens() external view returns (uint256);
}
