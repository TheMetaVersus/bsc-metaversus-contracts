// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

import "@openzeppelin/contracts-upgradeable/utils/ContextUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/CountersUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/ClonesUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/structs/EnumerableSetUpgradeable.sol";

import "../interfaces/IStakingPool.sol";
import "../interfaces/IAdmin.sol";

contract PoolFactory is ContextUpgradeable {
    using CountersUpgradeable for CountersUpgradeable.Counter;
    using EnumerableSetUpgradeable for EnumerableSetUpgradeable.UintSet;

    IStakingPool public template;

    /**
     *  @notice paymentToken IAdmin is interface of Admin contract
     */
    IAdmin public admin;

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

    modifier onlyAdmin() {
        require(admin.isAdmin(_msgSender()), "Caller is not an owner or admin");
        _;
    }

    modifier whenNotPaused() {
        require(!admin.isPaused(), "Pausable: paused");
        _;
    }

    modifier validWallet(address _account) {
        require(_account != address(0) && !AddressUpgradeable.isContract(_account), "Invalid wallets");
        _;
    }

    modifier notZeroAddress(address _account) {
        require(_account != address(0), "Invalid address");
        _;
    }

    modifier notZeroAmount(uint256 _amount) {
        require(_amount > 0, "Invalid amount");
        _;
    }

    function initialize(IStakingPool _template, IAdmin _admin) public initializer {
        __Context_init();

        template = _template;
        admin = _admin;
    }

    function create(
        address owner,
        address stakeToken,
        address rewardToken,
        address mkpManagerAddrress,
        uint256 rewardRate,
        uint256 poolDuration,
        address pancakeRouter,
        address busdToken,
        address aggregatorProxyBUSD_USD
    ) external onlyAdmin whenNotPaused {
        _poolCounter.increment();
        uint256 currentId = _poolCounter.current();
        bytes32 salt = bytes32(currentId);
        IStakingPool pool = IStakingPool(ClonesUpgradeable.cloneDeterministic(address(template), salt));
        require(address(pool) != address(0), "ERROR: Non Exist Pool, Please check your transfer");

        // store
        PoolInfo memory newInfo = PoolInfo(salt, address(pool), owner);
        poolIdToPoolInfos[currentId] = newInfo;

        // initialize
        pool.initialize(
            owner,
            stakeToken,
            rewardToken,
            mkpManagerAddrress,
            rewardRate,
            poolDuration,
            pancakeRouter,
            busdToken,
            aggregatorProxyBUSD_USD
        );

        // emit PoolDeployed(address(pool), _msgSender());
    }

    function getPool(uint256 id) public view returns (address) {
        bytes32 salt = bytes32(id);
        return ClonesUpgradeable.predictDeterministicAddress(address(template), salt);
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
