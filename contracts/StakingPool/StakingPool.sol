// SPDX-License-Identifier: MIT

pragma solidity ^0.8.4;

import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/math/SafeMathUpgradeable.sol";


contract StakingPool is
    Initializable,
    ReentrancyGuardUpgradeable,
    OwnableUpgradeable
{
    using SafeERC20Upgradeable for IERC20Upgradeable;
    using SafeMathUpgradeable for uint256;

    // struct UserHistory {
    //     string action;
    //     uint256 timestamp;
    //     uint256 amount;
    // }

    // struct Lazy {
    //     uint256 unlockedTime;
    //     bool isRequested;
    // }

    // struct UserInfo {
    //     uint256 totalAmount;
    //     uint256 pendingRewards;
    //     uint256 indexLength;
    //     uint256 lastClaim;
    //     Lazy lazyUnstake;
    //     Lazy lazyClaim;
    //     UserHistory[] userHistory;
    // }

    // /**
    //  *  @notice _stakedAmount uint256 is amount of staked token.
    //  */
    // uint256 private _stakedAmount;

    // /**
    //  *  @notice _rewardRate uint256 is rate of token.
    //  */
    // uint256 private _rewardRate;

    // /**
    //  *  @notice _poolDuration uint256 is duration of staking pool to end-time.
    //  */
    // uint256 private _poolDuration;

    // /**
    //  *  @notice typeIdPool uint256 is type ID for stake in pool.
    //  */
    // uint256 public typeIdPool;

    // /**
    //  *  @notice pendingUnstake uint256 is time after request unstake for waiting.
    //  */
    // uint256 public pendingUnstake;

    // /**
    //  *  @notice stakingEndTime uint256 is time after first time stake
    //  *          in order to only stake in this time.
    //  */
    // uint256 public stakingEndTime;

    // /**
    //  *  @notice _startTime is timestamp start staking in pool.
    //  */
    // uint256 private _startTime;

    // /**
    //  *  @notice _startTime is timestamp start staking in pool.
    //  */
    // uint256 public limitStaking;


    // /**
    //  *  @notice _stakeToken IERC20 is interface of staked token.
    //  */
    // IERC20Upgradeable private _stakeToken;

    // /**
    //  *  @notice _rewardToken IERC20 is interfacce of reward token.
    //  */
    // IERC20Upgradeable private _rewardToken;

    // /**
    //  *  @notice Mapping an address to a information of corresponding user address.
    //  */
    // mapping(address => UserInfo) public users;

    // event Staked(
    //     address indexed user,
    //     uint256 indexed amount,
    //     uint256 indexed time
    // );
    // event UnStaked(
    //     address indexed user,
    //     uint256 indexed amount,
    //     uint256 indexed time
    // );
    // event Claimed(
    //     address indexed user,
    //     uint256 indexed amount,
    //     uint256 indexed time
    // );
    // event EmergencyWithdrawed(
    //     address indexed owner,
    //     address indexed token,
    //     uint256 indexed time
    // );
    // event SetRewardRate(uint256 indexed rate, uint256 indexed time);
    // event SetUnstakeTime(uint256 indexed pendingTime, uint256 indexed time);
    // event SetStakeTime(uint256 indexed endTime, uint256 indexed time);
    // event SetDuration(uint256 indexed poolDuration, uint256 indexed time);
    // event SetStartTime(uint256 indexed poolDuration, uint256 indexed time);
    // event RequestUnstake(address indexed sender, uint256 indexed timestamp);
    // event RequestClaim(address indexed sender, uint256 indexed timestamp);

    // /**
    //  *  @notice Initialize new logic contract.
    //  */
    // function initialize(
    //     address owner_,
    //     IERC20Upgradeable stakeToken,
    //     IERC20Upgradeable rewardToken,
    //     uint256 rewardRate_,
    //     uint256 poolDuration_,
    //     uint256 typeIdPool_,
    //     uint256 limitStaking_
    // ) public initializer {
    //     OwnableUpgradeable.__Ownable_init();
    //     transferOwnership(owner_);
    //     _stakeToken = stakeToken;
    //     _rewardToken = rewardToken;
    //     _rewardRate = rewardRate_;
    //     _poolDuration = poolDuration_;
    //     typeIdPool = typeIdPool_;
    //     limitStaking = limitStaking_;
    //     pendingUnstake = 1 days;
    //     stakingEndTime = 12 weeks;
    // }

    // /**
    //  *  @notice Get staked token.
    //  */
    // function getStakeToken() public view returns (address) {
    //     return address(_stakeToken);
    // }

    // /**
    //  *  @notice Get staked amount of staking pool from all user.
    //  */
    // function getStakedAmount() public view returns (uint256) {
    //     return _stakedAmount;
    // }

    // /**
    //  *  @notice Get pool duration.
    //  */
    // function getPoolDuration() public view returns (uint256) {
    //     return _poolDuration;
    // }

    // /**
    //  *  @notice Get reward rate of staking pool.
    //  */
    // function getRewardRate() public view returns (uint256) {
    //     return _rewardRate;
    // }

    // /**
    //  *  @notice Get start time of staking pool.
    //  */
    // function getStartTime() public view returns (uint256) {
    //     return _startTime;
    // }

    // /**
    //  *  @notice Set start time of staking pool.
    //  *
    //  *  @dev    Only owner can call this function.
    //  */
    // function setStartTime(uint256 startTime) public onlyOwner {
    //     _startTime = startTime;
    //     emit SetStartTime(startTime, block.timestamp);
    // }

    // /**
    //  *  @notice Set reward rate of staking pool.
    //  *
    //  *  @dev    Only owner can call this function.
    //  */
    // function setRewardRate(uint256 rewardRate) public onlyOwner {
    //     _rewardRate = rewardRate;
    //     emit SetRewardRate(rewardRate, block.timestamp);
    // }

    // /**
    //  *  @notice Set pending time for unstake from staking pool.
    //  *
    //  *  @dev    Only owner can call this function.
    //  */
    // function setPendingUnstake(uint256 pendingTime) public onlyOwner {
    //     pendingUnstake = pendingTime;
    //     emit SetUnstakeTime(pendingTime, block.timestamp);
    // }

    // /**
    //  *  @notice Set staking end time of staking pool.
    //  *
    //  *  @dev    Only owner can call this function.
    //  */
    // function setStakingEndTime(uint256 endTime) public onlyOwner {
    //     stakingEndTime = endTime;
    //     emit SetStakeTime(endTime, block.timestamp);
    // }

    // /**
    //  *  @notice Set pool duration.
    //  *
    //  *  @dev    Only owner can call this function.
    //  */
    // function setPoolDuration(uint256 poolDuration) public onlyOwner {
    //     _poolDuration = poolDuration;
    //     emit SetDuration(poolDuration, block.timestamp);
    // }

    // /**
    //  *  @notice Get amount of deposited token of corresponding user address.
    //  */
    // function getUserAmount(address user) public view returns (uint256) {
    //     return users[user].totalAmount;
    // }

    // /**
    //  *  @notice Stake amount of token to staking pool.
    //  *
    //  *  @dev    Only user has NFT can call this function.
    //  */
    // function stake(uint256 _amount) public nonReentrant {
    //     if (_startTime == 0) {
    //         _startTime = block.timestamp;
    //     }

    //     require(
    //         _startTime.add(stakingEndTime) > block.timestamp,
    //         "Only deposit at first 3 months"
    //     );
    //     UserInfo storage user = users[_msgSender()];
    //     if (user.totalAmount > 0) {
    //         uint256 pending = calReward(_msgSender());
    //         if (pending > 0) {
    //             user.pendingRewards = user.pendingRewards + pending;
    //         }
    //     }
    //     user.lastClaim = block.timestamp;
    //     if (_amount > 0) {
    //         // Request transfer from user to contract
    //         user.totalAmount = user.totalAmount.add(_amount);
    //         _stakedAmount = _stakedAmount.add(_amount);
    //         _stakeToken.safeTransferFrom(_msgSender(), address(this), _amount);
    //         user.indexLength = user.indexLength.add(1);
    //         user.userHistory.push(
    //             UserHistory("Staked", user.totalAmount, block.timestamp)
    //         );
    //     }

    //     emit Staked(_msgSender(), _amount, block.timestamp);
    // }

    // /**
    //  *  @notice Check a mount of pending reward in pool of corresponding user address.
    //  */
    // function pendingRewards(address _user) public view returns (uint256) {
    //     UserInfo memory user = users[_user];
    //     if (_startTime <= block.timestamp) {
    //         uint256 amount = calReward(_user);
    //         amount = amount + user.pendingRewards;
    //         return amount;
    //     }
    //     return 0;
    // }

    // /**
    //  *  @notice Request withdraw before unstake activity
    //  */
    // function requestUnstake() public nonReentrant returns (uint256) {
    //     require(
    //         _startTime.add(_poolDuration) < block.timestamp && _startTime != 0,
    //         "Not allow unstake at this time"
    //     );
    //     UserInfo storage user = users[_msgSender()];
    //     require(!user.lazyUnstake.isRequested, "Requested !");
    //     user.lazyUnstake.isRequested = true;
    //     user.lazyUnstake.unlockedTime = block.timestamp + pendingUnstake;
    //     emit RequestUnstake(_msgSender(), block.timestamp);
    //     return user.lazyUnstake.unlockedTime;
    // }

    // /**
    //  *  @notice Request claim before unstake activity
    //  */
    // function requestClaim() public nonReentrant returns (uint256) {
    //     require(_startTime > 0, "Pool is not start !");
    //     UserInfo storage user = users[_msgSender()];
    //     require(!user.lazyClaim.isRequested, "Requested !");

    //     user.lazyClaim.isRequested = true;
    //     user.lazyClaim.unlockedTime = block.timestamp + pendingUnstake;
    //     emit RequestClaim(_msgSender(), block.timestamp);
    //     return user.lazyClaim.unlockedTime;
    // }

    // /**
    //  *  @notice Claim all reward in pool.
    //  */
    // function claim() public nonReentrant {
    //     UserInfo storage user = users[_msgSender()];
    //     require(
    //         user.lazyClaim.isRequested &&
    //             user.lazyClaim.unlockedTime <= block.timestamp,
    //         "Please request and can claim after 24 hours"
    //     );
    //     require(user.totalAmount > 0, "Reward value equal to zero");
    //     user.lazyClaim.isRequested = false;
    //     if (user.totalAmount > 0) {
    //         if (_startTime <= block.timestamp) {
    //             uint256 pending = pendingRewards(_msgSender());
    //             if (pending > 0) {
    //                 user.pendingRewards = 0;
    //                 _rewardToken.safeTransfer(_msgSender(), pending);
    //             }
    //             emit Claimed(_msgSender(), pending, block.timestamp);
    //         }
    //     }
    //     user.lastClaim = block.timestamp;
    //     user.indexLength = user.indexLength.add(1);
    //     user.userHistory.push(
    //         UserHistory("Claimed", user.totalAmount, block.timestamp)
    //     );
    // }

    // /**
    //  *  @notice Unstake amount of rewards caller request.
    //  */
    // function unstake(uint256 _amount) public nonReentrant {
    //     UserInfo storage user = users[_msgSender()];
    //     require(
    //         _startTime.add(_poolDuration) <= block.timestamp,
    //         "Staking: StakingPool for NFT has not expired yet.."
    //     );
    //     require(
    //         user.lazyUnstake.isRequested &&
    //             user.lazyUnstake.unlockedTime <= block.timestamp,
    //         "Please request and can withdraw after 24 hours"
    //     );
    //     user.lazyUnstake.isRequested = false;

    //     // Auto claim
    //     if (user.totalAmount > 0) {
    //         if (_startTime <= block.timestamp) {
    //             uint256 pending = pendingRewards(_msgSender());
    //             if (pending > 0) {
    //                 user.pendingRewards = 0;
    //                 _rewardToken.safeTransfer(_msgSender(), pending);
    //             }
    //         }
    //     }

    //     user.lastClaim = block.timestamp;
    //     if (_amount > 0) {
    //         require(
    //             user.totalAmount >= _amount,
    //             "Staking: Cannot unstake more than staked amount."
    //         );

    //         user.totalAmount = user.totalAmount.sub(_amount);
    //         _stakedAmount = _stakedAmount.sub(_amount);
    //         _stakeToken.safeTransfer(_msgSender(), _amount);
    //         user.indexLength = user.indexLength.add(1);
    //         user.userHistory.push(
    //             UserHistory("Unstaked", user.totalAmount, block.timestamp)
    //         );
    //     }

    //     emit UnStaked(_msgSender(), _amount, block.timestamp);
    // }

    // /**
    //  *  @notice Admin can withdraw excess cash back.
    //  *
    //  *  @dev    Only admin can call this function.
    //  */
    // function emergencyWithdraw() public onlyOwner nonReentrant {
    //     if (_rewardToken == _stakeToken) {
    //         _rewardToken.safeTransfer(
    //             owner(),
    //             _rewardToken.balanceOf(address(this)).sub(_stakedAmount)
    //         );
    //     } else {
    //         _rewardToken.safeTransfer(
    //             owner(),
    //             _rewardToken.balanceOf(address(this))
    //         );
    //     }

    //     emit EmergencyWithdrawed(
    //         _msgSender(),
    //         address(_rewardToken),
    //         block.timestamp
    //     );
    // }

    // /**
    //  *  @notice Return minimun value betwween two params.
    //  */
    // function min(uint256 a, uint256 b) internal pure returns (uint256) {
    //     if (a < b) return a;
    //     else return b;
    // }

    // /**
    //  *  @notice Return a pending amount of reward token.
    //  */
    // function calReward(address _user) public view returns (uint256) {
    //     UserInfo memory user = users[_user];
    //     uint256 minTime = min(block.timestamp, _startTime.add(_poolDuration));
    //     if (minTime < user.lastClaim) {
    //         return 0;
    //     }
    //     uint256 amount = user
    //         .totalAmount
    //         .mul(minTime.sub(user.lastClaim))
    //         .mul(_rewardRate)
    //         .div(1e18);
    //     return amount;
    // }
}
