// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

interface IStakingPool {
    function initialize(
        address owner,
        address stakeToken,
        address rewardToken,
        address mkpManagerAddrress,
        uint256 rewardRate,
        uint256 poolDuration,
        address pancakeRouter,
        address busdToken,
        address aggregatorProxyBUSD_USD
    ) external;

    function transferOwnership(address newOwner) external;
}
