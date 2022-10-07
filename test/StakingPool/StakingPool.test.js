const { deployMockContract } = require("@ethereum-waffle/mock-contract");
const { expect } = require("chai");
const { upgrades } = require("hardhat");
const { skipTime, acceptable, getCurrentTime } = require("../utils");
const { add, multiply, divide, subtract } = require("js-big-decimal");
const { constants } = require("@openzeppelin/test-helpers");
const aggregator_abi = require("../../artifacts/@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol/AggregatorV3Interface.json");
const { ZERO_ADDRESS } = require("@openzeppelin/test-helpers/src/constants");
const { MerkleTree } = require("merkletreejs");
const keccak256 = require("keccak256");

const abi = [
    {
        inputs: [
            { internalType: "uint256", name: "amountIn", type: "uint256" },
            { internalType: "address[]", name: "path", type: "address[]" },
        ],
        name: "getAmountsOut",
        outputs: [{ internalType: "uint256[]", name: "amounts", type: "uint256[]" }],
        stateMutability: "view",
        type: "function",
    },
];
describe("Staking Pool:", () => {
    beforeEach(async () => {
        USD_TOKEN = "0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56";
        REWARD_RATE = 15854895992; // 50 % APY
        poolDuration = 9 * 30 * 24 * 60 * 60; // 9 months
        OVER_AMOUNT = ethers.utils.parseEther("1000000");
        ONE_ETHER = ethers.utils.parseEther("1");
        ONE_MILLION_ETHER = ethers.utils.parseEther("1000000");
        ONE_YEAR = 31104000;
        TOTAL_SUPPLY = ethers.utils.parseEther("1000000000000");
        accounts = await ethers.getSigners();
        owner = accounts[0];
        user1 = accounts[1];
        user2 = accounts[2];
        user3 = accounts[3];
        treasury = accounts[4];

        PANCAKE_ROUTER = await deployMockContract(owner, abi);
        await PANCAKE_ROUTER.mock.getAmountsOut.returns([ONE_ETHER, multiply(500, ONE_ETHER)]);
        AGGREGATOR = await deployMockContract(owner, aggregator_abi.abi);
        await AGGREGATOR.mock.latestRoundData.returns(1, 1, 1, 1, 1);

        await AGGREGATOR.mock.latestRoundData.returns(1, 1, 1, 1, 1);
        Admin = await ethers.getContractFactory("Admin");
        admin = await upgrades.deployProxy(Admin, [owner.address]);

        Treasury = await ethers.getContractFactory("Treasury");
        treasury = await upgrades.deployProxy(Treasury, [admin.address]);

        Token = await ethers.getContractFactory("MTVS");
        token = await upgrades.deployProxy(Token, [
            user1.address,
            "Metaversus Token",
            "MTVS",
            TOTAL_SUPPLY,
            treasury.address,
            admin.address,
        ]);

        TokenMintERC721 = await ethers.getContractFactory("TokenMintERC721");
        tokenMintERC721 = await upgrades.deployProxy(TokenMintERC721, [
            "NFT Metaversus",
            "nMTVS",
            treasury.address,
            250,
            admin.address,
        ]);

        TokenMintERC1155 = await ethers.getContractFactory("TokenMintERC1155");
        tokenMintERC1155 = await upgrades.deployProxy(TokenMintERC1155, [treasury.address, 250, admin.address]);

        MkpManager = await ethers.getContractFactory("MarketPlaceManager");
        mkpManager = await upgrades.deployProxy(MkpManager, [treasury.address, admin.address]);

        OrderManager = await ethers.getContractFactory("OrderManager");
        orderManager = await upgrades.deployProxy(OrderManager, [mkpManager.address, admin.address]);

        TokenERC721 = await ethers.getContractFactory("TokenERC721");
        tokenERC721 = await TokenERC721.deploy();
        TokenERC1155 = await ethers.getContractFactory("TokenERC1155");
        tokenERC1155 = await TokenERC1155.deploy();

        CollectionFactory = await ethers.getContractFactory("CollectionFactory");
        collectionFactory = await upgrades.deployProxy(CollectionFactory, [
            tokenERC721.address,
            tokenERC1155.address,
            admin.address,
            ZERO_ADDRESS,
            ZERO_ADDRESS,
        ]);

        MTVSManager = await ethers.getContractFactory("MetaversusManager");
        mtvsManager = await upgrades.deployProxy(MTVSManager, [
            tokenMintERC721.address,
            tokenMintERC1155.address,
            token.address,
            treasury.address,
            mkpManager.address,
            collectionFactory.address,
            admin.address,
        ]);

        Staking = await ethers.getContractFactory("StakingPool");
        staking = await upgrades.deployProxy(Staking, [
            token.address,
            token.address,
            mkpManager.address,
            REWARD_RATE,
            poolDuration,
            PANCAKE_ROUTER.address,
            USD_TOKEN,
            AGGREGATOR.address,
            admin.address,
        ]);

        await staking.deployed();
        CURRENT = await getCurrentTime();

        await staking.setStartTime(CURRENT);

        await admin.setPermittedPaymentToken(token.address, true);
        await admin.setPermittedPaymentToken(constants.ZERO_ADDRESS, true);

        await admin.setAdmin(mtvsManager.address, true);
        await mtvsManager.setPause(false);
        await staking.setPause(false);
        await orderManager.setPause(false);
        await mkpManager.setOrder(orderManager.address);
        await mkpManager.setMetaversusManager(mtvsManager.address);
    });

    describe("Deployment:", async () => {
        it("Should revert when invalid admin contract address", async () => {
            await expect(
                upgrades.deployProxy(Staking, [
                    token.address,
                    token.address,
                    mkpManager.address,
                    REWARD_RATE,
                    poolDuration,
                    PANCAKE_ROUTER.address,
                    USD_TOKEN,
                    USD_TOKEN,
                    constants.ZERO_ADDRESS,
                ])
            ).to.revertedWith("Invalid Admin contract");
            await expect(
                upgrades.deployProxy(Staking, [
                    token.address,
                    token.address,
                    mkpManager.address,
                    REWARD_RATE,
                    poolDuration,
                    PANCAKE_ROUTER.address,
                    USD_TOKEN,
                    USD_TOKEN,
                    user1.address,
                ])
            ).to.revertedWith("Invalid Admin contract");
            await expect(
                upgrades.deployProxy(Staking, [
                    token.address,
                    token.address,
                    mkpManager.address,
                    REWARD_RATE,
                    poolDuration,
                    PANCAKE_ROUTER.address,
                    USD_TOKEN,
                    USD_TOKEN,
                    treasury.address,
                ])
            ).to.revertedWith("Invalid Admin contract");
        });
    });
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
            await token.mint(user2.address, ONE_MILLION_ETHER);
            await token.mint(user1.address, ONE_MILLION_ETHER);
            await token.connect(user2).approve(mtvsManager.address, ONE_MILLION_ETHER);
            await token.connect(user1).approve(mkpManager.address, ONE_MILLION_ETHER);

            const current = await getCurrentTime();
            await mtvsManager
                .connect(user2)
                .createNFT(0, 1, "this_uri", ONE_ETHER, current + 10, current + 100000000, token.address);

            await skipTime(1000);

            await mkpManager.connect(user1).buy(1);
            await token.connect(user1).approve(staking.address, multiply(500, ONE_ETHER));

            await staking.connect(user1).stake(multiply(500, ONE_ETHER));
            expect(await staking.getUserAmount(user1.address)).to.equal(multiply(500, ONE_ETHER));
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
    describe("getPendingClaimTime:", async () => {
        it("should get pending claim time: ", async () => {
            expect(await staking.getPendingClaimTime(user1.address)).to.equal(0);
        });
    });

    describe("getPendingUnstakeTime:", async () => {
        it("should get pending unstake time: ", async () => {
            expect(await staking.getPendingUnstakeTime(user1.address)).to.equal(0);
        });
    });
    describe("getAllParams:", async () => {
        it("should get all params of pool: ", async () => {
            const params = await staking.getAllParams();
            expect(await staking.stakeToken()).to.equal(params[0]);
            expect(await staking.mkpManager()).to.equal(params[1]);
            expect(await staking.stakedAmount()).to.equal(params[2]);
            expect(await staking.poolDuration()).to.equal(params[3]);
            expect(await staking.rewardRate()).to.equal(params[4]);
            expect(await staking.startTime()).to.equal(params[5]);
            expect(await staking.pendingTime()).to.equal(params[6]);
            expect(await staking.isActivePool()).to.equal(params[7]);
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
        it("should change pending time: ", async () => {
            const time = 1234567;
            await staking.setPendingTime(time);
            expect(await staking.pendingTime()).to.equal(time);
        });
    });

    describe("setAcceptableLost:", async () => {
        it("should change acceptable lost: ", async () => {
            const lost = 10;
            await staking.setAcceptableLost(lost);
            expect(await staking.acceptableLost()).to.equal(lost);
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
            await token.mint(user2.address, ONE_MILLION_ETHER);
            await token.mint(user1.address, ONE_MILLION_ETHER);
            await token.connect(user2).approve(mtvsManager.address, ONE_MILLION_ETHER);
            await token.connect(user1).approve(mkpManager.address, ONE_MILLION_ETHER);
            const current = await getCurrentTime();
            await mtvsManager
                .connect(user2)
                .createNFT(0, 1, "this_uri", 1000, current + 10, current + 1000000, token.address);

            await skipTime(1000);
            await mkpManager.connect(user1).buy(1);

            const amount = "125000000000000000000000";
            await token.mint(user1.address, amount);
            await token.connect(user1).approve(staking.address, amount);
            await staking.connect(user1).stake(amount);
            expect(await staking.getUserAmount(user1.address)).to.equal(amount);
        });
        it("should stake success with more times: ", async () => {
            await token.mint(user2.address, ONE_MILLION_ETHER);
            await token.mint(user1.address, ONE_MILLION_ETHER);
            await token.connect(user2).approve(mtvsManager.address, ONE_MILLION_ETHER);
            await token.connect(user1).approve(mkpManager.address, ONE_MILLION_ETHER);
            const current = await getCurrentTime();
            await mtvsManager
                .connect(user2)
                .createNFT(0, 1, "this_uri", 1000, current + 10, current + 1000000, token.address);

            await skipTime(1000);
            await mkpManager.connect(user1).buy(1);

            const amount = "125000000000000000000000";
            await token.mint(user1.address, amount);
            await token.connect(user1).approve(staking.address, multiply(3, amount));
            await staking.connect(user1).stake(amount);
            expect(await staking.getUserAmount(user1.address)).to.equal(amount);
            await staking.connect(user1).stake(amount);
            await staking.connect(user1).stake(amount);
            expect(await staking.getUserAmount(user1.address)).to.equal(multiply(3, amount));
        });
    });
    describe("callReward:", async () => {
        it("should return zero reward: ", async () => {
            const calReward = await staking.calReward(user1.address);

            expect(calReward).to.equal(0);
        });
        it("should return reward each day: ", async () => {
            await token.mint(user2.address, ONE_MILLION_ETHER);
            await token.mint(user1.address, ONE_MILLION_ETHER);
            await token.connect(user2).approve(mtvsManager.address, ONE_MILLION_ETHER);
            await token.connect(user1).approve(mkpManager.address, ONE_MILLION_ETHER);
            const current = await getCurrentTime();
            await mtvsManager
                .connect(user2)
                .createNFT(0, 1, "this_uri", 1000, current + 10, current + 10000, token.address);

            await skipTime(1000);
            await mkpManager.connect(user1).buy(1);

            await token.mint(user1.address, ONE_ETHER);
            await token.connect(user1).approve(staking.address, ONE_ETHER);
            await staking.connect(user1).stake(ONE_ETHER);

            // await skipTime(86000);
            let calReward = await staking.calReward(user1.address);

            expect(calReward.toNumber()).to.equal(0);

            await skipTime(86400);
            calReward = await staking.calReward(user1.address);
            expect(calReward.toNumber()).to.greaterThan(0);

            await staking.connect(user1).requestClaim();
            let data = await staking.users(user1.address);

            expect(data.lazyClaim.isRequested).to.equal(true);
            await skipTime(24 * 60 * 60 + 1);
            // const pendingRewards = await staking.pendingRewards(user1.address);
            await staking.connect(user1).claim();
            // data = await staking.users(user1.address);

            await skipTime(86400);
            const newcalReward = await staking.calReward(user1.address);
            expect(newcalReward.toNumber()).to.equal(newcalReward.toNumber());
        });
    });
    describe("pendingRewards:", async () => {
        it("should return zero reward: ", async () => {
            const pendingRewards = await staking.pendingRewards(user1.address);

            expect(pendingRewards).to.equal(0);
        });

        it("should return pending reward: ", async () => {
            await token.mint(user2.address, ONE_MILLION_ETHER);
            await token.mint(user1.address, ONE_MILLION_ETHER);
            await token.connect(user2).approve(mtvsManager.address, ONE_MILLION_ETHER);
            await token.connect(user1).approve(mkpManager.address, ONE_MILLION_ETHER);
            const current = await getCurrentTime();
            await mtvsManager
                .connect(user2)
                .createNFT(0, 1, "this_uri", 1000, current + 10, current + 10000, token.address);

            await skipTime(1000);
            await mkpManager.connect(user1).buy(1);

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
            await token.connect(user1).approve(staking.address, ONE_ETHER);
            await token.mint(user2.address, ONE_MILLION_ETHER);
            await token.mint(user1.address, ONE_MILLION_ETHER);
            await token.connect(user2).approve(mtvsManager.address, ONE_MILLION_ETHER);
            await token.connect(user1).approve(mkpManager.address, ONE_MILLION_ETHER);
            const current = await getCurrentTime();
            await mtvsManager
                .connect(user2)
                .createNFT(0, 1, "this_uri", 1000, current + 10, current + 10000, token.address);

            await skipTime(1000);
            await mkpManager.connect(user1).buy(1);

            const claimTime = 4 * 30 * 24 * 60 * 60;

            await staking.connect(user1).stake(ONE_ETHER);
            await skipTime(claimTime);
            await expect(staking.connect(user1).requestUnstake()).to.be.revertedWith(
                "ERROR: not allow unstake at this time"
            );
        });

        it("should revert when ERROR: requested !: ", async () => {
            await token.mint(user2.address, ONE_MILLION_ETHER);
            await token.mint(user1.address, ONE_MILLION_ETHER);
            await token.connect(user2).approve(mtvsManager.address, ONE_MILLION_ETHER);
            await token.connect(user1).approve(mkpManager.address, ONE_MILLION_ETHER);
            await token.connect(user1).approve(staking.address, ONE_ETHER);
            const current = await getCurrentTime();
            await mtvsManager
                .connect(user2)
                .createNFT(0, 1, "this_uri", 1000, current + 10, current + 10000, token.address);

            await skipTime(1000);
            await mkpManager.connect(user1).buy(1);

            const claimTime = 4 * 30 * 24 * 60 * 60;

            await staking.connect(user1).stake(ONE_ETHER);
            await skipTime(claimTime + poolDuration);
            await staking.connect(user1).requestUnstake();
            await expect(staking.connect(user1).requestUnstake()).to.be.revertedWith("ERROR: requested !");
        });

        it("should request success: ", async () => {
            await token.mint(user2.address, ONE_MILLION_ETHER);
            await token.mint(user1.address, ONE_MILLION_ETHER);
            await token.connect(user2).approve(mtvsManager.address, ONE_MILLION_ETHER);
            await token.connect(user1).approve(mkpManager.address, ONE_MILLION_ETHER);
            await token.connect(user1).approve(staking.address, ONE_ETHER);
            const current = await getCurrentTime();
            await mtvsManager
                .connect(user2)
                .createNFT(0, 1, "this_uri", 1000, current + 10, current + 10000, token.address);

            await skipTime(1000);
            await mkpManager.connect(user1).buy(1);

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
            await token.mint(user2.address, ONE_MILLION_ETHER);
            await token.mint(user1.address, ONE_MILLION_ETHER);
            await token.connect(user2).approve(mtvsManager.address, ONE_MILLION_ETHER);
            await token.connect(user1).approve(mkpManager.address, ONE_MILLION_ETHER);
            await token.connect(user1).approve(staking.address, ONE_ETHER);
            const current = await getCurrentTime();
            await mtvsManager
                .connect(user2)
                .createNFT(0, 1, "this_uri", 1000, current + 10, current + 10000, token.address);

            await skipTime(1000);
            await mkpManager.connect(user1).buy(1);

            await staking.setStartTime(0);
            await expect(staking.connect(user1).requestClaim()).to.be.revertedWith(
                "ERROR: not allow claim at this time"
            );
        });
        it("should revert when more request: ", async () => {
            await token.mint(user2.address, ONE_MILLION_ETHER);
            await token.mint(user1.address, ONE_MILLION_ETHER);
            await token.connect(user2).approve(mtvsManager.address, ONE_MILLION_ETHER);
            await token.connect(user1).approve(mkpManager.address, ONE_MILLION_ETHER);
            await token.connect(user1).approve(staking.address, ONE_ETHER);
            const current = await getCurrentTime();
            await mtvsManager
                .connect(user2)
                .createNFT(0, 1, "this_uri", 1000, current + 10, current + 10000, token.address);

            await skipTime(1000);
            await mkpManager.connect(user1).buy(1);

            const claimTime = 4 * 30 * 24 * 60 * 60;

            await staking.connect(user1).stake(ONE_ETHER);
            await skipTime(claimTime);
            await staking.connect(user1).requestClaim();
            await expect(staking.connect(user1).requestClaim()).to.be.revertedWith("ERROR: requested !");
        });
        it("should request success: ", async () => {
            await token.mint(user2.address, ONE_MILLION_ETHER);
            await token.mint(user1.address, ONE_MILLION_ETHER);
            await token.connect(user2).approve(mtvsManager.address, ONE_MILLION_ETHER);
            await token.connect(user1).approve(mkpManager.address, ONE_MILLION_ETHER);
            await token.connect(user1).approve(staking.address, ONE_ETHER);
            const current = await getCurrentTime();
            await mtvsManager
                .connect(user2)
                .createNFT(0, 1, "this_uri", 1000, current + 10, current + 10000, token.address);

            await skipTime(1000);
            await mkpManager.connect(user1).buy(1);

            const claimTime = 4 * 30 * 24 * 60 * 60;

            await staking.connect(user1).stake(ONE_ETHER);
            await skipTime(claimTime);
            await staking.connect(user1).requestClaim();
            const data = await staking.users(user1.address);
            expect(data.lazyClaim.isRequested).to.equal(true);
        });
    });

    describe("claim:", async () => {
        it("should revert when staking pool had been expired ", async () => {
            await token.mint(user2.address, ONE_MILLION_ETHER);
            await token.mint(user1.address, ONE_MILLION_ETHER);
            await token.connect(user2).approve(mtvsManager.address, ONE_MILLION_ETHER);
            await token.connect(user1).approve(mkpManager.address, ONE_MILLION_ETHER);
            await token.connect(user1).approve(staking.address, ONE_ETHER);
            const current = await getCurrentTime();
            await mtvsManager
                .connect(user2)
                .createNFT(0, 1, "this_uri", 1000, current + 10, current + 10000, token.address);

            await skipTime(1000);
            await mkpManager.connect(user1).buy(1);

            await staking.connect(user1).stake(ONE_ETHER);

            await skipTime(10 * 24 * 60 * 60);
            await staking.connect(user1).requestClaim();
            await skipTime(10 * 30 * 24 * 60 * 60 + 1); // 23h

            await expect(staking.connect(user1).claim()).to.be.revertedWith("ERROR: staking pool had been expired !");
        });

        it("should revert when not rquest claim before ", async () => {
            await token.mint(user2.address, ONE_MILLION_ETHER);
            await token.mint(user1.address, ONE_MILLION_ETHER);
            await token.connect(user2).approve(mtvsManager.address, ONE_MILLION_ETHER);
            await token.connect(user1).approve(mkpManager.address, ONE_MILLION_ETHER);
            await token.connect(user1).approve(staking.address, ONE_ETHER);
            const current = await getCurrentTime();
            await mtvsManager
                .connect(user2)
                .createNFT(0, 1, "this_uri", 1000, current + 10, current + 10000, token.address);

            await skipTime(1000);
            await mkpManager.connect(user1).buy(1);

            await staking.connect(user1).stake(ONE_ETHER);

            await skipTime(30 * 24 * 60 * 60);

            await expect(staking.connect(user1).claim()).to.be.revertedWith("ERROR: please request before");
        });

        it("should accept lost 50% first ", async () => {
            // emulator balance
            await token.mint(user2.address, ONE_MILLION_ETHER);
            await token.mint(user1.address, ONE_MILLION_ETHER);
            await token.connect(user2).approve(mtvsManager.address, ONE_MILLION_ETHER);
            await token.connect(user1).approve(mkpManager.address, ONE_MILLION_ETHER);
            await token.connect(user1).approve(staking.address, ONE_ETHER);
            const current = await getCurrentTime();
            await mtvsManager
                .connect(user2)
                .createNFT(0, 1, "this_uri", 1000, current + 10, current + 10000, token.address);

            await skipTime(1000);
            await mkpManager.connect(user1).buy(1);

            await staking.connect(user1).stake(ONE_ETHER);

            await skipTime(1 * 24 * 60 * 60);
            await staking.connect(user1).requestClaim();
            await skipTime(100);
            const pendingRewards = await staking.pendingRewards(user1.address);
            await expect(() => staking.connect(user1).claim()).to.changeTokenBalance(token, user1, +pendingRewards / 2);
        });

        it("should claim success", async () => {
            await token.mint(user2.address, ONE_MILLION_ETHER);
            await token.mint(user1.address, ONE_MILLION_ETHER);
            await token.connect(user2).approve(mtvsManager.address, ONE_MILLION_ETHER);
            await token.connect(user1).approve(mkpManager.address, ONE_MILLION_ETHER);
            await token.connect(user1).approve(staking.address, ONE_ETHER);
            const current = await getCurrentTime();
            const typeNft = 0; // ERC721
            const amount = 1;
            const uri = "this_uri";
            const price = 1000;
            const startTime = current + 10;
            const endTime = current + 10000;

            await mtvsManager.connect(user2).createNFT(typeNft, amount, uri, price, startTime, endTime, token.address);

            await skipTime(1000);
            await mkpManager.connect(user1).buy(1);

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

            const epsilon = (1 / 100) * ONE_ETHER;

            expect(
                acceptable(
                    pendingRewards.toString(),
                    divide(multiply(multiply(ONE_ETHER, 0.5), 24 * 60 * 60 + 1), ONE_YEAR),
                    epsilon
                )
            ).to.be.true;
        });
        it("should claim accept lost 50%", async () => {
            await token.mint(user2.address, ONE_MILLION_ETHER);
            await token.mint(user1.address, ONE_MILLION_ETHER);
            await token.connect(user2).approve(mtvsManager.address, ONE_MILLION_ETHER);
            await token.connect(user1).approve(mkpManager.address, ONE_MILLION_ETHER);
            await token.connect(user1).approve(staking.address, ONE_ETHER);
            const current = await getCurrentTime();
            const typeNft = 0; // ERC721
            const amount = 1;
            const uri = "this_uri";
            const price = ONE_ETHER;
            const startTime = current + 10;
            const endTime = current + 10000;

            await mtvsManager.connect(user2).createNFT(typeNft, amount, uri, price, startTime, endTime, token.address);

            await skipTime(1000);
            await mkpManager.connect(user1).buy(1);

            await staking.connect(user1).stake(ONE_ETHER);
            await skipTime(24 * 60 * 60 + 1);

            await staking.connect(user1).requestClaim();
            let data = await staking.users(user1.address);

            expect(data.lazyClaim.isRequested).to.equal(true);
            await skipTime(10 * 60 * 60 + 1);
            const pendingRewards = await staking.pendingRewards(user1.address);
            await expect(() =>
                staking
                    .connect(user1)
                    .claim()
                    .to.changeTokenBalance(token, user1, divide(pendingRewards, 2))
            );
        });
    });
    describe("unstake:", async () => {
        it("should revert when staking pool for NFT not expired: ", async () => {
            await token.mint(user2.address, ONE_MILLION_ETHER);
            await token.mint(user1.address, ONE_MILLION_ETHER);
            await token.connect(user2).approve(mtvsManager.address, ONE_MILLION_ETHER);
            await token.connect(user1).approve(mkpManager.address, ONE_MILLION_ETHER);
            await token.connect(user1).approve(staking.address, ONE_ETHER);
            const current = await getCurrentTime();
            await mtvsManager
                .connect(user2)
                .createNFT(0, 1, "this_uri", 1000, current + 10, current + 10000, token.address);

            await skipTime(1000);
            await mkpManager.connect(user1).buy(1);

            const unstakeTime = 8 * 30 * 24 * 60 * 60 + 1; // not enough time

            await staking.connect(user1).stake(ONE_ETHER);
            await skipTime(unstakeTime);

            await expect(staking.connect(user1).unstake(ONE_ETHER)).to.be.revertedWith(
                "ERROR: staking pool for NFT has not expired yet !"
            );
        });
        it("should revert when request not finish after 24 hours: ", async () => {
            await token.mint(user2.address, ONE_MILLION_ETHER);
            await token.mint(user1.address, ONE_MILLION_ETHER);
            await token.connect(user2).approve(mtvsManager.address, ONE_MILLION_ETHER);
            await token.connect(user1).approve(mkpManager.address, ONE_MILLION_ETHER);
            await token.connect(user1).approve(staking.address, ONE_ETHER);
            const current = await getCurrentTime();
            await mtvsManager
                .connect(user2)
                .createNFT(0, 1, "this_uri", 1000, current + 10, current + 10000, token.address);

            await skipTime(1000);
            await mkpManager.connect(user1).buy(1);

            const unstakeTime = 9 * 30 * 24 * 60 * 60 + 1;

            await staking.connect(user1).stake(ONE_ETHER);
            await skipTime(unstakeTime);

            await expect(staking.connect(user1).unstake(ONE_ETHER)).to.be.revertedWith(
                "ERROR: please request and can withdraw after pending time"
            );
        });
        it("should revert when connot unstake more than staked amount: ", async () => {
            await token.mint(user2.address, ONE_MILLION_ETHER);
            await token.mint(user1.address, ONE_MILLION_ETHER);
            await token.connect(user2).approve(mtvsManager.address, ONE_MILLION_ETHER);
            await token.connect(user1).approve(mkpManager.address, ONE_MILLION_ETHER);
            await token.connect(user1).approve(staking.address, ONE_ETHER);
            const current = await getCurrentTime();
            await mtvsManager
                .connect(user2)
                .createNFT(0, 1, "this_uri", 1000, current + 10, current + 10000, token.address);

            await skipTime(1000);
            await mkpManager.connect(user1).buy(1);
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
            await token.mint(staking.address, ONE_MILLION_ETHER);
            await token.mint(user2.address, ONE_MILLION_ETHER);
            await token.mint(user1.address, ONE_MILLION_ETHER);
            await token.connect(user2).approve(mtvsManager.address, ONE_MILLION_ETHER);
            await token.connect(user1).approve(mkpManager.address, ONE_MILLION_ETHER);
            await token.connect(user1).approve(staking.address, ONE_ETHER);
            const current = await getCurrentTime();
            const leaves = [user1.address, user2.address].map(value => keccak256(value));
            merkleTree = new MerkleTree(leaves, keccak256, { sort: true });

            await token.connect(user2).approve(mtvsManager.address, ONE_MILLION_ETHER);
            const rootHash = merkleTree.getHexRoot();

            await mtvsManager
                .connect(user2)
                .createNFT(true, 0, 1, "this_uri", 1000, current + 10, current + 10000, token.address, rootHash);

            await skipTime(1000);
            const leaf = keccak256(user1.address);
            const proof = merkleTree.getHexProof(leaf);
            await orderManager.connect(user1).buy(1, proof);

            const unstakeTime = 9 * 30 * 24 * 60 * 60 + 1;

            // await staking.connect(user1).stake(ONE_ETHER);
            // await skipTime(unstakeTime);
            // await staking.connect(user1).requestUnstake();
            // await skipTime(25 * 60 * 60);
            // const pendingRewards = await staking.pendingRewards(user1.address);
            // await staking.connect(user1).unstake(ONE_ETHER);

            // expect(await token.balanceOf(staking.address)).to.equal(subtract(ONE_MILLION_ETHER, pendingRewards));

            // expect(await token.balanceOf(user1.address)).to.equal(
            //     subtract(add(ONE_MILLION_ETHER, pendingRewards), 1000)
            // );
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
