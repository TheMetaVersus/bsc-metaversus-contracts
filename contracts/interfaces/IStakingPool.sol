// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

import "@openzeppelin/contracts-upgradeable/utils/introspection/IERC165Upgradeable.sol";

import "./IAdmin.sol";

interface IStakingPool is IERC165Upgradeable {
    function initialize(
        address _stakeToken,
        address _rewardToken,
        address _mkpManagerAddrress,
        uint256 _rewardRate,
        uint256 _poolDuration,
        address _pancakeRouter,
        address _busdToken,
        address _aggregatorProxyBUSD_USD,
        IAdmin _admin
    ) external;
}
