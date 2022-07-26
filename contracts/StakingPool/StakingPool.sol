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
     *  @notice stakedAmount uint256 is amount of staked token.
     */
    uint256 public stakedAmount;

    /**
     *  @notice rewardRate uint256 is rate of token.
     */
    uint256 public rewardRate;

    /**
     *  @notice poolDuration uint256 is duration of staking pool to end-time.
     */
    uint256 public poolDuration;

    /**
     *  @notice pendingUnstake uint256 is time after request unstake for waiting.
     */
    uint256 public pendingUnstake;

    /**
     *  @notice startTime is timestamp start staking in pool.
     */
    uint256 public startTime;

    /**
     *  @notice stakeToken IERC20 is interface of staked token.
     */
    IERC20Upgradeable public stakeToken;

    /**
     *  @notice rewardToken IERC20 is interfacce of reward token.
     */
    IERC20Upgradeable public rewardToken;

    /**
     *  @notice nftAddress IERC721 is interfacce of nft
     */
    IERC721Upgradeable public nftAddress;

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
        address stakeToken_,
        address rewardToken_,
        address nftAddress_,
        uint256 rewardRate_,
        uint256 poolDuration_
    )
        public
        initializer
        notZeroAddress(owner_)
        notZeroAddress(stakeToken_)
        notZeroAddress(rewardToken_)
        notZeroAddress(nftAddress_)
        notZeroAmount(rewardRate_)
        notZeroAmount(poolDuration_)
    {
        Adminable.__Adminable_init();
        transferOwnership(owner_);
        stakeToken = IERC20Upgradeable(stakeToken_);
        rewardToken = IERC20Upgradeable(rewardToken_);
        rewardRate = rewardRate_;
        poolDuration = poolDuration_;
        nftAddress = IERC721Upgradeable(nftAddress_);
        pendingUnstake = 1 days;
        pause();
    }

    /**
     *  @notice Get all params
     */
    function getAllParams()
        external
        view
        returns (
            address,
            address,
            uint256,
            uint256,
            uint256,
            uint256,
            uint256,
            bool
        )
    {
        return (
            address(stakeToken),
            address(nftAddress),
            stakedAmount,
            poolDuration,
            rewardRate,
            startTime,
            pendingUnstake,
            isActivePool()
        );
    }

    /**
     *  @notice Get status of pool
     */
    function isActivePool() public view returns (bool) {
        return (startTime.add(poolDuration) >= block.timestamp) && !paused();
    }

    /**
     *  @notice Set start time of staking pool.
     *
     *  @dev    Only owner can call this function.
     */
    function setStartTime(uint256 _startTime) external onlyOwnerOrAdmin {
        startTime = _startTime;
        emit SetStartTime(startTime);
    }

    /**
     *  @notice Set reward rate of staking pool.
     *
     *  @dev    Only owner can call this function.
     */
    function setRewardRate(uint256 _rewardRate)
        external
        notZeroAmount(rewardRate)
        onlyOwnerOrAdmin
    {
        rewardRate = _rewardRate;
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
    function setPoolDuration(uint256 _poolDuration)
        external
        notZeroAmount(poolDuration)
        onlyOwnerOrAdmin
    {
        poolDuration = _poolDuration;
        emit SetDuration(poolDuration);
    }

    /**
     *  @notice Get amount of deposited token of corresponding user address.
     */
    function getUserAmount(address user) external view returns (uint256) {
        return users[user].totalAmount;
    }

    /**
     *  @notice Get pending claim time of corresponding user address.
     */
    function getPendingClaimTime(address user) external view returns (uint256) {
        return users[user].lazyClaim.unlockedTime;
    }

    /**
     *  @notice Get pending unstake time of corresponding user address.
     */
    function getPendingUnstakeTime(address user) external view returns (uint256) {
        return users[user].lazyUnstake.unlockedTime;
    }

    /**
     *  @notice Stake amount of token to staking pool.
     *
     *  @dev    Only user has NFT can call this function.
     */
    function stake(uint256 _amount) external notZeroAmount(_amount) nonReentrant whenNotPaused {
        require(block.timestamp > startTime, "ERROR: not time for stake !");
        require(
            startTime.add(poolDuration) > block.timestamp,
            "ERROR: staking pool for NFT had been expired !"
        );
        require(
            nftAddress.balanceOf(_msgSender()) > 0,
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
        stakedAmount = stakedAmount.add(_amount);

        // request transfer token
        stakeToken.safeTransferFrom(_msgSender(), address(this), _amount);

        emit Staked(_msgSender(), _amount);
    }

    /**
     *  @notice Check a mount of pending reward in pool of corresponding user address.
     */
    function pendingRewards(address _user) public view returns (uint256) {
        UserInfo memory user = users[_user];
        if (startTime <= block.timestamp) {
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
            startTime.add(poolDuration) < block.timestamp && startTime != 0,
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
        require(startTime > 0, "ERROR: pool is not start !");
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
            startTime.add(poolDuration) >= block.timestamp,
            "ERROR: staking pool had been expired !"
        );
        require(
            user.lazyClaim.isRequested && user.lazyClaim.unlockedTime <= block.timestamp,
            "ERROR: please request and can claim after 24 hours"
        );

        if (user.totalAmount > 0) {
            uint256 pending = pendingRewards(_msgSender());
            if (pending > 0) {
                user.pendingRewards = 0;
                // transfer token
                rewardToken.safeTransfer(_msgSender(), pending);
                emit Claimed(_msgSender(), pending);
            }
        }
        // update status of request
        user.lazyClaim.isRequested = false;
        user.lastClaim = block.timestamp;
    }

    /**
     *  @notice Unstake amount of rewards caller request.
     */
    function unstake(uint256 _amount) external notZeroAmount(_amount) nonReentrant whenNotPaused {
        UserInfo storage user = users[_msgSender()];
        require(
            startTime.add(poolDuration) <= block.timestamp,
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
        stakedAmount = stakedAmount.sub(_amount);
        // claim token
        if (pending > 0) {
            user.pendingRewards = 0;
            rewardToken.safeTransfer(_msgSender(), pending);
        }

        // transfer token
        stakeToken.safeTransfer(_msgSender(), _amount);

        emit UnStaked(_msgSender(), _amount);
    }

    /**
     *  @notice Admin can withdraw excess cash back.
     *
     *  @dev    Only admin can call this function.
     */
    function emergencyWithdraw() external onlyOwner nonReentrant {
        if (rewardToken == stakeToken) {
            rewardToken.safeTransfer(
                owner(),
                rewardToken.balanceOf(address(this)).sub(stakedAmount)
            );
        } else {
            rewardToken.safeTransfer(owner(), rewardToken.balanceOf(address(this)));
        }

        emit EmergencyWithdrawed(_msgSender(), address(rewardToken));
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
        uint256 minTime = min(block.timestamp, startTime.add(poolDuration));
        if (minTime < user.lastClaim) {
            return 0;
        }
        uint256 amount = user.totalAmount.mul(minTime.sub(user.lastClaim)).mul(rewardRate).div(
            1e18
        );
        return amount;
    }
}
