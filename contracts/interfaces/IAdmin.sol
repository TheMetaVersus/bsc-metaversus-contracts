// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

import "@openzeppelin/contracts-upgradeable/utils/introspection/IERC165Upgradeable.sol";

interface IAdmin is IERC165Upgradeable {
    function isAdmin(address _account) external view returns (bool);

    function isOrder(address _account) external view returns (bool);

    function owner() external view returns (address);
}
