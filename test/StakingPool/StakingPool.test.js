const { expect } = require("chai");
const { upgrades } = require("hardhat");
const { skipTime, acceptable, getCurrentTime } = require("../utils");
const { add, multiply, divide, subtract } = require("js-big-decimal");
// const { constants } = require("@openzeppelin/test-helpers");

describe("Staking Pool:", () => {
    beforeEach(async () => {
        REWARD_RATE = 15854895992; // 50 % APY
        poolDuration = 9 * 30 * 24 * 60 * 60; // 9 months
        OVER_AMOUNT = ethers.utils.parseEther("1000000");
        ONE_ETHER = ethers.utils.parseEther("1");
        ONE_YEAR = 31104000;
        TOTAL_SUPPLY = ethers.utils.parseEther("1000000000000");
        PRICE = 10000;

        const accounts = await ethers.getSigners();
        owner = accounts[0];
        user1 = accounts[1];
        user2 = accounts[2];
        user3 = accounts[3];
        treasury = accounts[4];
        Treasury = await ethers.getContractFactory("Treasury");
        treasury = await upgrades.deployProxy(Treasury, [owner.address]);

        Token = await ethers.getContractFactory("MTVS");
        token = await upgrades.deployProxy(Token, [
            owner.address,
            "Vetaversus Token",
            "MTVS",
            TOTAL_SUPPLY,
            treasury.address,
        ]);

        NFTMTVSTicket = await ethers.getContractFactory("NFTMTVSTicket");
        nftMTVSTicket = await upgrades.deployProxy(NFTMTVSTicket, [
            owner.address,
            "NFT Metaversus Ticket",
            "nftMTVS",
            token.address,
            treasury.address,
            250,
            PRICE,
        ]);

        Staking = await ethers.getContractFactory("StakingPool");
        staking = await upgrades.deployProxy(Staking, [
            owner.address,
            token.address,
            token.address,
            nftMTVSTicket.address,
            REWARD_RATE,
            poolDuration,
        ]);

        await staking.deployed();
        CURRENT = await getCurrentTime();

        await staking.setPause(false);
        await staking.setStartTime(CURRENT);
    });

    describe("Deployment:", async () => {
        it("should return owner address : ", async () => {
            const ownerAddress = await staking.owner();
            expect(ownerAddress).to.equal(owner.address);
        });
    });
    // GET FUNC
    describe("getStakeToken:", async () => {
        it("should return staked token: ", async () => {
            expect(await staking.stakeToken()).to.equal(token.address);
        });
    });
    describe("getStakedAmount:", async () => {
        it("should return total staked amount: ", async () => {
            expect(await staking.stakedAmount()).to.equal(0);
        });
    });
    describe("getPoolDuration:", async () => {
        it("should return pool duration: ", async () => {
            expect(await staking.poolDuration()).to.equal(poolDuration);
        });
    });
    describe("getRewardRate:", async () => {
        it("should return reward rate: ", async () => {
            expect(await staking.rewardRate()).to.equal(REWARD_RATE);
        });
    });

    describe("getUserAmount:", async () => {
        it("should return amount of user: ", async () => {
            await token.mint(user1.address, ONE_ETHER);
            await token.connect(user1).approve(staking.address, ONE_ETHER);
            await nftMTVSTicket.mint(user1.address);

            await staking.connect(user1).stake(ONE_ETHER);
            expect(await staking.getUserAmount(user1.address)).to.equal(ONE_ETHER);
        });
    });
    describe("getStartTime:", async () => {
        it("should return start time of staking pool: ", async () => {
            expect(await staking.startTime()).to.equal(CURRENT.toString());
        });
    });
    describe("isActivePool:", async () => {
        it("should return status of pool: ", async () => {
            const time = await getCurrentTime();
            await staking.setStartTime(time);
            expect(await staking.isActivePool()).to.equal(true);
            await skipTime(time + 9 * 30 * 24 * 60 * 60 + 1);

            expect(await staking.isActivePool()).to.equal(false);
        });
    });

    // SET FUNC
    describe("setRewardRate:", async () => {
        it("should change reward rate: ", async () => {
            const newRate = 1512300005610;
            await staking.setRewardRate(newRate);
            expect(await staking.rewardRate()).to.equal(newRate);
        });
    });
    describe("setPoolDuration:", async () => {
        it("should change pool duration: ", async () => {
            const newPoolDuration = 3 * 30 * 24 * 60 * 60;
            await staking.setPoolDuration(newPoolDuration);
            expect(await staking.poolDuration()).to.equal(newPoolDuration);
        });
    });

    describe("setStartTime:", async () => {
        it("should change start time: ", async () => {
            const time = 1234567;
            await staking.setStartTime(time);
            expect(await staking.startTime()).to.equal(time);
        });
    });

    describe("setPendingTime:", async () => {
        it("should change pending time time: ", async () => {
            const time = 1234567;
            await staking.setPendingTime(time);
            expect(await staking.pendingTime()).to.equal(time);
        });
    });

    // // Others
    describe("stake:", async () => {
        it("should revert when amount equal to zero: ", async () => {
            await expect(staking.connect(user1).stake(0)).to.be.revertedWith(
                "ERROR: amount must be greater than zero !"
            );
        });
        it("should stake success: ", async () => {
            await nftMTVSTicket.mint(user1.address);
            const amount = "125000000000000000000000";
            await token.mint(user1.address, amount);
            await token.connect(user1).approve(staking.address, amount);
            await staking.connect(user1).stake(amount);
            expect(await staking.getUserAmount(user1.address)).to.equal(amount);
            expect(await token.balanceOf(user1.address)).to.equal(0);
        });
    });
    describe("callReward:", async () => {
        it("should return zero reward: ", async () => {
            const calReward = await staking.calReward(user1.address);

            expect(calReward).to.equal(0);
        });
        it.only("should return reward each day: ", async () => {
            await nftMTVSTicket.mint(user1.address);

            await token.mint(user1.address, ONE_ETHER);
            await token.connect(user1).approve(staking.address, ONE_ETHER);
            await staking.connect(user1).stake(ONE_ETHER);

            // await skipTime(86000);
            let calReward = await staking.calReward(user1.address);
            console.log(calReward.toString());
            expect(calReward.toNumber()).to.equal(0);

            await skipTime(86400);
            calReward = await staking.calReward(user1.address);
            console.log(calReward.toString());
            expect(calReward.toNumber()).to.greaterThan(0);

            await skipTime(6000);
            const newcalReward = await staking.calReward(user1.address);
            console.log(newcalReward.toString());
            expect(newcalReward.toNumber()).to.equal(calReward.toNumber());
        });
    });
    describe("pendingRewards:", async () => {
        it("should return zero reward: ", async () => {
            const pendingRewards = await staking.pendingRewards(user1.address);

            expect(pendingRewards).to.equal(0);
        });

        it("should return pending reward: ", async () => {
            await nftMTVSTicket.mint(user1.address);
            const claimTime = 4 * 30 * 24 * 60 * 60;

            await token.mint(user1.address, ONE_ETHER);
            await token.connect(user1).approve(staking.address, ONE_ETHER);
            await staking.connect(user1).stake(ONE_ETHER);
            await skipTime(claimTime);
            const pendingRewards = await staking.pendingRewards(user1.address);

            const epsilon = (1 / 100) * ONE_ETHER;
            expect(
                acceptable(
                    pendingRewards.toString(),
                    divide(multiply(multiply(ONE_ETHER, 0.5), claimTime), ONE_YEAR),
                    epsilon
                )
            ).to.be.true;
        });
    });
    describe("requestUnstake:", async () => {
        it("should revert when not allow at this time for no NFT or on staking time: ", async () => {
            await token.mint(user1.address, ONE_ETHER);
            await token.connect(user1).approve(staking.address, ONE_ETHER);
            await nftMTVSTicket.mint(user1.address);

            const claimTime = 4 * 30 * 24 * 60 * 60;

            await staking.connect(user1).stake(ONE_ETHER);
            await skipTime(claimTime);
            await expect(staking.connect(user1).requestUnstake()).to.be.revertedWith(
                "ERROR: not allow unstake at this time"
            );
        });

        it("should revert when ERROR: requested !: ", async () => {
            await token.mint(user1.address, ONE_ETHER);
            await token.connect(user1).approve(staking.address, ONE_ETHER);
            await nftMTVSTicket.mint(user1.address);

            const claimTime = 4 * 30 * 24 * 60 * 60;

            await staking.connect(user1).stake(ONE_ETHER);
            await skipTime(claimTime + poolDuration);
            await staking.connect(user1).requestUnstake();
            await expect(staking.connect(user1).requestUnstake()).to.be.revertedWith(
                "ERROR: requested !"
            );
        });

        it("should request success: ", async () => {
            await token.mint(user1.address, ONE_ETHER);
            await token.connect(user1).approve(staking.address, ONE_ETHER);
            await nftMTVSTicket.mint(user1.address);

            const claimTime = 10 * 30 * 24 * 60 * 60; // 1 thangs

            await staking.connect(user1).stake(ONE_ETHER);

            await skipTime(claimTime);

            await staking.connect(user1).requestUnstake();
            const data = await staking.users(user1.address);
            expect(data.lazyUnstake.isRequested).to.equal(true);
        });
    });

    describe("requestClaim:", async () => {
        it("should revert when pool is not start: ", async () => {
            await token.mint(user1.address, ONE_ETHER);
            await token.connect(user1).approve(staking.address, ONE_ETHER);
            await nftMTVSTicket.mint(user1.address);
            await staking.setStartTime(0);
            await expect(staking.connect(user1).requestClaim()).to.be.revertedWith(
                "ERROR: not allow claim at this time"
            );
        });
        it("should revert when more request: ", async () => {
            await token.mint(user1.address, ONE_ETHER);
            await token.connect(user1).approve(staking.address, ONE_ETHER);
            await nftMTVSTicket.mint(user1.address);

            const claimTime = 4 * 30 * 24 * 60 * 60;

            await staking.connect(user1).stake(ONE_ETHER);
            await skipTime(claimTime);
            await staking.connect(user1).requestClaim();
            await expect(staking.connect(user1).requestClaim()).to.be.revertedWith(
                "ERROR: requested !"
            );
        });
        it("should request success: ", async () => {
            await token.mint(user1.address, ONE_ETHER);
            await token.connect(user1).approve(staking.address, ONE_ETHER);
            await nftMTVSTicket.mint(user1.address);

            const claimTime = 4 * 30 * 24 * 60 * 60;

            await staking.connect(user1).stake(ONE_ETHER);
            await skipTime(claimTime);
            await staking.connect(user1).requestClaim();
            const data = await staking.users(user1.address);
            expect(data.lazyClaim.isRequested).to.equal(true);
        });
    });

    describe("claim:", async () => {
        it("should revert when NOT request and can claim after 24 hours ", async () => {
            await token.mint(user1.address, ONE_ETHER);
            await token.connect(user1).approve(staking.address, ONE_ETHER);
            await nftMTVSTicket.mint(user1.address);

            await staking.connect(user1).stake(ONE_ETHER);

            await skipTime(30 * 24 * 60 * 60);
            await staking.connect(user1).requestClaim();
            await skipTime(23 * 60 * 60 + 1); // 23h

            await expect(staking.connect(user1).claim()).to.be.revertedWith(
                "ERROR: please request and can claim after 24 hours"
            );
        });

        it("should revert when amount of ERROR: reward value equal to zero ", async () => {
            // emulator balance
            await token.mint(staking.address, ONE_ETHER);
            await token.mint(user1.address, ONE_ETHER);
            await token.connect(user1).approve(staking.address, ONE_ETHER);
            await nftMTVSTicket.mint(user1.address);

            await staking.connect(user1).stake(ONE_ETHER);

            await skipTime(10 * 30 * 24 * 60 * 60);
            await expect(staking.connect(user1).requestClaim()).to.be.revertedWith(
                "ERROR: not allow claim at this time"
            );
            // await skipTime(24 * 60 * 60 + 1);
            // await expect(staking.connect(user1).claim()).to.be.revertedWith(
            //     "ERROR: staking pool had been expired !"
            // );
        });

        it("should claim success", async () => {
            await token.mint(user1.address, ONE_ETHER);
            await token.connect(user1).approve(staking.address, ONE_ETHER);
            await nftMTVSTicket.mint(user1.address);

            await staking.connect(user1).stake(ONE_ETHER);
            await skipTime(24 * 60 * 60 + 1);

            await staking.connect(user1).requestClaim();
            let data = await staking.users(user1.address);

            expect(data.lazyClaim.isRequested).to.equal(true);
            await skipTime(24 * 60 * 60 + 1);
            const pendingRewards = await staking.pendingRewards(user1.address);
            await staking.connect(user1).claim();
            data = await staking.users(user1.address);

            expect(data.lazyClaim.isRequested).to.equal(false);

            const value = await token.balanceOf(user1.address);
            const epsilon = (1 / 100) * ONE_ETHER;
            expect(acceptable(pendingRewards.toString(), value.toString(), epsilon)).to.be.true;
        });
    });
    describe("unstake:", async () => {
        it("should revert when staking pool for NFT not expired: ", async () => {
            await token.mint(user1.address, ONE_ETHER);
            await token.connect(user1).approve(staking.address, ONE_ETHER);
            await nftMTVSTicket.mint(user1.address);

            const unstakeTime = 8 * 30 * 24 * 60 * 60 + 1; // not enough time

            await staking.connect(user1).stake(ONE_ETHER);
            await skipTime(unstakeTime);

            await expect(staking.connect(user1).unstake(ONE_ETHER)).to.be.revertedWith(
                "ERROR: staking pool for NFT has not expired yet !"
            );
        });
        it("should revert when request not finish after 24 hours: ", async () => {
            await token.mint(user1.address, ONE_ETHER);
            await token.connect(user1).approve(staking.address, ONE_ETHER);
            await nftMTVSTicket.mint(user1.address);

            const unstakeTime = 9 * 30 * 24 * 60 * 60 + 1;

            await staking.connect(user1).stake(ONE_ETHER);
            await skipTime(unstakeTime);

            await expect(staking.connect(user1).unstake(ONE_ETHER)).to.be.revertedWith(
                "ERROR: please request and can withdraw after 24 hours"
            );
        });
        it("should revert when connot unstake more than staked amount: ", async () => {
            await token.mint(user1.address, ONE_ETHER);
            await token.connect(user1).approve(staking.address, ONE_ETHER);
            await nftMTVSTicket.mint(user1.address);
            const unstakeTime = 9 * 30 * 24 * 60 * 60 + 1;

            await staking.connect(user1).stake(ONE_ETHER);
            await skipTime(unstakeTime);
            await staking.connect(user1).requestUnstake();
            await skipTime(25 * 60 * 60);
            await expect(staking.connect(user1).unstake(OVER_AMOUNT)).to.be.revertedWith(
                "ERROR: cannot unstake more than staked amount"
            );
        });
        it("should unstake success: ", async () => {
            await token.mint(staking.address, ONE_ETHER);
            await token.mint(user1.address, ONE_ETHER);
            await token.connect(user1).approve(staking.address, ONE_ETHER);
            await nftMTVSTicket.mint(user1.address);

            const unstakeTime = 9 * 30 * 24 * 60 * 60 + 1;

            await staking.connect(user1).stake(ONE_ETHER);
            await skipTime(unstakeTime);
            await staking.connect(user1).requestUnstake();
            await skipTime(25 * 60 * 60);
            const pendingRewards = await staking.pendingRewards(user1.address);
            await staking.connect(user1).unstake(ONE_ETHER);

            expect(await token.balanceOf(staking.address)).to.equal(
                subtract(ONE_ETHER, pendingRewards)
            );

            expect(await token.balanceOf(user1.address)).to.equal(add(ONE_ETHER, pendingRewards));
        });
    });

    describe("Check EmergencyWithdraw function: ", async () => {
        it("should deposit success: ", async () => {
            await token.mint(owner.address, ONE_ETHER);
            await token.connect(owner).transfer(staking.address, 10000);
            expect(await token.balanceOf(owner.address)).to.equal(subtract(ONE_ETHER, 10000));
            await staking.connect(owner).emergencyWithdraw();
            expect(await staking.stakedAmount()).to.equal(await token.balanceOf(staking.address));
            expect(await token.balanceOf(owner.address)).to.equal(subtract(ONE_ETHER));
        });
    });
});
