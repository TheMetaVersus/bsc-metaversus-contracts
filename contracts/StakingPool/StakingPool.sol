// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/math/SafeMathUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC721/IERC721Upgradeable.sol";
import "../Adminable.sol";

/**
 *  @title  Dev Staking Pool Contract
 *
 *  @author Metaversus Team
 *
 *  @notice This smart contract is the staking pool for staking, earning more MTVS token with standard ERC20
 *          all action which user could stake, unstake, claim them.
 */
contract StakingPool is Initializable, ReentrancyGuardUpgradeable, Adminable, PausableUpgradeable {
    using SafeERC20Upgradeable for IERC20Upgradeable;
    using SafeMathUpgradeable for uint256;

    struct Lazy {
        uint256 unlockedTime;
        bool isRequested;
    }

    struct UserInfo {
        uint256 totalAmount;
        uint256 pendingRewards;
        uint256 lastClaim;
        Lazy lazyUnstake;
        Lazy lazyClaim;
    }

    /**
     *  @notice _stakedAmount uint256 is amount of staked token.
     */
    uint256 private _stakedAmount;

    /**
     *  @notice _rewardRate uint256 is rate of token.
     */
    uint256 private _rewardRate;

    /**
     *  @notice _poolDuration uint256 is duration of staking pool to end-time.
     */
    uint256 private _poolDuration;

    /**
     *  @notice pendingUnstake uint256 is time after request unstake for waiting.
     */
    uint256 public pendingUnstake;

    /**
     *  @notice _startTime is timestamp start staking in pool.
     */
    uint256 private _startTime;

    /**
     *  @notice _stakeToken IERC20 is interface of staked token.
     */
    IERC20Upgradeable private _stakeToken;

    /**
     *  @notice _rewardToken IERC20 is interfacce of reward token.
     */
    IERC20Upgradeable private _rewardToken;

    /**
     *  @notice _nftAddress IERC721 is interfacce of nft
     */
    IERC721Upgradeable private _nftAddress;

    /**
     *  @notice Mapping an address to a information of corresponding user address.
     */
    mapping(address => UserInfo) public users;

    event Staked(address indexed user, uint256 amount);
    event UnStaked(address indexed user, uint256 amount);
    event Claimed(address indexed user, uint256 amount);
    event EmergencyWithdrawed(address indexed owner, address indexed token);
    event SetRewardRate(uint256 indexed rate);
    event SetUnstakeTime(uint256 indexed pendingTime);
    event SetStakeTime(uint256 indexed endTime);
    event SetDuration(uint256 indexed poolDuration);
    event SetStartTime(uint256 indexed poolDuration);
    event RequestUnstake(address indexed sender);
    event RequestClaim(address indexed sender);

    /**
     *  @notice Pause action
     */
    function pause() public onlyOwner {
        _pause();
    }

    /**
     *  @notice Unpause action
     */
    function unpause() public onlyOwner {
        _unpause();
    }

    /**
     *  @notice Initialize new logic contract.
     */
    function initialize(
        address owner_,
        IERC20Upgradeable stakeToken_,
        IERC20Upgradeable rewardToken_,
        IERC721Upgradeable nftAddress_,
        uint256 rewardRate_,
        uint256 poolDuration_
    ) public initializer {
        Adminable.__Adminable_init();
        transferOwnership(owner_);
        _stakeToken = stakeToken_;
        _rewardToken = rewardToken_;
        _rewardRate = rewardRate_;
        _poolDuration = poolDuration_;
        _nftAddress = nftAddress_;
        pendingUnstake = 1 days;
        pause();
    }

    /**
     *  @notice Get staked token.
     */
    function getStakeToken() external view returns (address) {
        return address(_stakeToken);
    }

    /**
     *  @notice Get nft address.
     */
    function getNftAddress() external view returns (address) {
        return address(_nftAddress);
    }

    /**
     *  @notice Get staked amount of staking pool from all user.
     */
    function getStakedAmount() external view returns (uint256) {
        return _stakedAmount;
    }

    /**
     *  @notice Get pool duration.
     */
    function getPoolDuration() external view returns (uint256) {
        return _poolDuration;
    }

    /**
     *  @notice Get reward rate of staking pool.
     */
    function getRewardRate() external view returns (uint256) {
        return _rewardRate;
    }

    /**
     *  @notice Get start time of staking pool.
     */
    function getStartTime() external view returns (uint256) {
        return _startTime;
    }

    /**
     *  @notice Get status of pool
     */
    function isActivePool() external view returns (bool) {
        return (_startTime.add(_poolDuration) >= block.timestamp) && !paused();
    }

    /**
     *  @notice Set start time of staking pool.
     *
     *  @dev    Only owner can call this function.
     */
    function setStartTime(uint256 startTime) external onlyOwnerOrAdmin {
        _startTime = startTime;
        emit SetStartTime(startTime);
    }

    /**
     *  @notice Set reward rate of staking pool.
     *
     *  @dev    Only owner can call this function.
     */
    function setRewardRate(uint256 rewardRate) external notZeroAmount(rewardRate) onlyOwnerOrAdmin {
        _rewardRate = rewardRate;
        emit SetRewardRate(rewardRate);
    }

    /**
     *  @notice Set pending time for unstake from staking pool.
     *
     *  @dev    Only owner can call this function.
     */
    function setPendingUnstake(uint256 pendingTime)
        external
        notZeroAmount(pendingTime)
        onlyOwnerOrAdmin
    {
        pendingUnstake = pendingTime;
        emit SetUnstakeTime(pendingTime);
    }

    /**
     *  @notice Set pool duration.
     *
     *  @dev    Only owner can call this function.
     */
    function setPoolDuration(uint256 poolDuration)
        external
        notZeroAmount(poolDuration)
        onlyOwnerOrAdmin
    {
        _poolDuration = poolDuration;
        emit SetDuration(poolDuration);
    }

    /**
     *  @notice Get amount of deposited token of corresponding user address.
     */
    function getUserAmount(address user) external view returns (uint256) {
        return users[user].totalAmount;
    }

    /**
     *  @notice Stake amount of token to staking pool.
     *
     *  @dev    Only user has NFT can call this function.
     */
    function stake(uint256 _amount) external notZeroAmount(_amount) nonReentrant whenNotPaused {
        require(
            _startTime.add(_poolDuration) > block.timestamp,
            "ERROR: staking pool for NFT had been expired !"
        );
        require(
            _nftAddress.balanceOf(_msgSender()) > 0,
            "ERROR: require own nft for stake MTVS token"
        );
        // calculate pending rewards of staked amount before
        UserInfo storage user = users[_msgSender()];
        if (user.totalAmount > 0) {
            uint256 pending = calReward(_msgSender());
            if (pending > 0) {
                user.pendingRewards = user.pendingRewards + pending;
            }
        }
        user.lastClaim = block.timestamp;

        // add extra token just deposited
        user.totalAmount = user.totalAmount.add(_amount);
        _stakedAmount = _stakedAmount.add(_amount);

        // request transfer token
        _stakeToken.safeTransferFrom(_msgSender(), address(this), _amount);

        emit Staked(_msgSender(), _amount);
    }

    /**
     *  @notice Check a mount of pending reward in pool of corresponding user address.
     */
    function pendingRewards(address _user) public view returns (uint256) {
        UserInfo memory user = users[_user];
        if (_startTime <= block.timestamp) {
            uint256 amount = calReward(_user);
            amount = amount + user.pendingRewards;
            return amount;
        }
        return 0;
    }

    /**
     *  @notice Request withdraw before unstake activity
     */
    function requestUnstake() external nonReentrant whenNotPaused returns (uint256) {
        require(
            _startTime.add(_poolDuration) < block.timestamp && _startTime != 0,
            "ERROR: not allow unstake at this time"
        );
        UserInfo storage user = users[_msgSender()];
        require(!user.lazyUnstake.isRequested, "ERROR: requested !");
        user.lazyUnstake.isRequested = true;
        user.lazyUnstake.unlockedTime = block.timestamp + pendingUnstake;

        emit RequestUnstake(_msgSender());
        return user.lazyUnstake.unlockedTime;
    }

    /**
     *  @notice Request claim before unstake activity
     */
    function requestClaim() external nonReentrant whenNotPaused returns (uint256) {
        require(_startTime > 0, "ERROR: pool is not start !");
        UserInfo storage user = users[_msgSender()];
        require(!user.lazyClaim.isRequested, "ERROR: requested !");

        user.lazyClaim.isRequested = true;
        user.lazyClaim.unlockedTime = block.timestamp + pendingUnstake;

        emit RequestClaim(_msgSender());
        return user.lazyClaim.unlockedTime;
    }

    /**
     *  @notice Claim all reward in pool.
     */
    function claim() external nonReentrant whenNotPaused {
        UserInfo storage user = users[_msgSender()];
        require(
            _startTime.add(_poolDuration) >= block.timestamp,
            "ERROR: staking pool had been expired !"
        );
        require(
            user.lazyClaim.isRequested && user.lazyClaim.unlockedTime <= block.timestamp,
            "ERROR: please request and can claim after 24 hours"
        );
        // update status of request
        user.lazyClaim.isRequested = false;
        user.lastClaim = block.timestamp;

        if (user.totalAmount > 0) {
            uint256 pending = pendingRewards(_msgSender());
            if (pending > 0) {
                user.pendingRewards = 0;
                // transfer token
                _rewardToken.safeTransfer(_msgSender(), pending);
                emit Claimed(_msgSender(), pending);
            }
        }
    }

    /**
     *  @notice Unstake amount of rewards caller request.
     */
    function unstake(uint256 _amount) external notZeroAmount(_amount) nonReentrant whenNotPaused {
        UserInfo storage user = users[_msgSender()];
        require(
            _startTime.add(_poolDuration) <= block.timestamp,
            "ERROR: staking pool for NFT has not expired yet !"
        );
        require(
            user.lazyUnstake.isRequested && user.lazyUnstake.unlockedTime <= block.timestamp,
            "ERROR: please request and can withdraw after 24 hours"
        );
        require(user.totalAmount >= _amount, "ERROR: cannot unstake more than staked amount");

        // Auto claim
        uint256 pending = pendingRewards(_msgSender());

        // update status of request
        user.lazyUnstake.isRequested = false;
        user.lazyClaim.isRequested = false;
        user.lastClaim = block.timestamp;
        // update data before transfer
        user.totalAmount = user.totalAmount.sub(_amount);
        _stakedAmount = _stakedAmount.sub(_amount);
        // claim token
        if (pending > 0) {
            user.pendingRewards = 0;
            _rewardToken.safeTransfer(_msgSender(), pending);
        }

        // transfer token
        _stakeToken.safeTransfer(_msgSender(), _amount);

        emit UnStaked(_msgSender(), _amount);
    }

    /**
     *  @notice Admin can withdraw excess cash back.
     *
     *  @dev    Only admin can call this function.
     */
    function emergencyWithdraw() external onlyOwner nonReentrant {
        if (_rewardToken == _stakeToken) {
            _rewardToken.safeTransfer(
                owner(),
                _rewardToken.balanceOf(address(this)).sub(_stakedAmount)
            );
        } else {
            _rewardToken.safeTransfer(owner(), _rewardToken.balanceOf(address(this)));
        }

        emit EmergencyWithdrawed(_msgSender(), address(_rewardToken));
    }

    /**
     *  @notice Return minimun value betwween two params.
     */
    function min(uint256 a, uint256 b) internal pure returns (uint256) {
        if (a < b) return a;
        return b;
    }

    /**
     *  @notice Return a pending amount of reward token.
     */
    function calReward(address _user) public view returns (uint256) {
        UserInfo memory user = users[_user];
        uint256 minTime = min(block.timestamp, _startTime.add(_poolDuration));
        if (minTime < user.lastClaim) {
            return 0;
        }
        uint256 amount = user.totalAmount.mul(minTime.sub(user.lastClaim)).mul(_rewardRate).div(
            1e18
        );
        return amount;
    }
}
