// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "@openzeppelin/contracts-upgradeable/utils/CountersUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/ClonesUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/structs/EnumerableSetUpgradeable.sol";
import "../interfaces/IStakingPool.sol";
import "../Adminable.sol";

contract PoolFactory is Initializable, Adminable {
    using CountersUpgradeable for CountersUpgradeable.Counter;
    using EnumerableSetUpgradeable for EnumerableSetUpgradeable.UintSet;

    address public template;
    CountersUpgradeable.Counter private _poolCounter;
    EnumerableSetUpgradeable.AddressSet private _pools;

    struct PoolInfo {
        bytes32 salt;
        address poolAddress;
        address owner;
    }
    mapping(uint256 => PoolInfo) public poolIdToPoolInfos;
    mapping(address => EnumerableSetUpgradeable.UintSet) private _ownerToPoolIds;

    event PoolDeployed(address pool, address deployer);

    function initialize(address _template) public initializer {
        Adminable.__Adminable_init();
        template = _template;
    }

    function create(
        address owner,
        address stakeToken,
        address rewardToken,
        address mkpManagerAddrress,
        uint256 rewardRate,
        uint256 poolDuration,
        address pancakeRouter,
        address usdToken

    ) external onlyOwnerOrAdmin {
        _poolCounter.increment();
        uint256 currentId = _poolCounter.current();
        bytes32 salt = bytes32(currentId);
        IStakingPool pool = IStakingPool(ClonesUpgradeable.cloneDeterministic(template, salt));
        require(address(pool) != address(0), "ERROR: Non Exist Pool, Please check your transfer");

        // store
        PoolInfo memory newInfo = PoolInfo(salt, address(pool), owner);
        poolIdToPoolInfos[currentId] = newInfo;

        // initialize
        pool.initialize(owner, stakeToken, rewardToken, mkpManagerAddrress, rewardRate, poolDuration, pancakeRouter, usdToken);

        emit PoolDeployed(address(pool), _msgSender());
    }

    function getPool(uint256 id) public view returns (address) {
        bytes32 salt = bytes32(id);
        return ClonesUpgradeable.predictDeterministicAddress(template, salt);
    }

    function getPoolInfo(uint256 id) public view returns (PoolInfo memory) {
        return poolIdToPoolInfos[id];
    }

    function getAllPool() public view returns (PoolInfo[] memory) {
        PoolInfo[] memory allPools = new PoolInfo[](_poolCounter.current());
        for (uint256 i = 0; i < _poolCounter.current(); i++) {
            allPools[i] = poolIdToPoolInfos[i + 1];
        }
        return allPools;
    }
}
