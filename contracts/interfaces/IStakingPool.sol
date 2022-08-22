// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

interface IStakingPool {
    function initialize(
        address owner,
        address stakeToken,
        address rewardToken,
        address mkpManager,
        uint256 rewardRate,
        uint256 poolDuration
    ) external;

    function transferOwnership(address newOwner) external;
}
