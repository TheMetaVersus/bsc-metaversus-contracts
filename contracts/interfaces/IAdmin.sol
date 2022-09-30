// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

interface IAdmin {
    function isAdmin(address _account) external view returns (bool);

    function isPaused() external view returns (bool);

    function owner() external view returns (address);
}
