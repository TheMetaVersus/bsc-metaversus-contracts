// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

interface IPriceConsumerV3 {
    function getLatestPrice() external view returns (int);

    function getHistoricalPrice(uint80 roundId) external view returns (int256);
}
