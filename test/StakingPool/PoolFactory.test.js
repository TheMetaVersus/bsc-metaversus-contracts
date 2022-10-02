const { expect } = require("chai");
const { upgrades } = require("hardhat");
const { getCurrentTime } = require("../utils");
const { constants } = require("@openzeppelin/test-helpers");

describe("Pool Factory:", () => {
    beforeEach(async () => {
        REWARD_RATE = 15854895992; // 50 % APY
        POOL_DURATION = 9 * 30 * 24 * 60 * 60; // 9 months
        OVER_AMOUNT = ethers.utils.parseEther("1000000");
        ONE_ETHER = ethers.utils.parseEther("1");
        ONE_YEAR = 31104000;
        TOTAL_SUPPLY = ethers.utils.parseEther("1000000000000");
        PRICE = 10000;
        PANCAKE_ROUTER = "0x05fF2B0DB69458A0750badebc4f9e13aDd608C7F";
        USD_TOKEN = "0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56";
        const accounts = await ethers.getSigners();
        owner = accounts[0];
        user1 = accounts[1];
        user2 = accounts[2];
        user3 = accounts[3];
        treasury = accounts[4];

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

        MkpManager = await ethers.getContractFactory("MarketPlaceManager");
        mkpManager = await upgrades.deployProxy(MkpManager, [treasury.address, admin.address]);

        Staking = await ethers.getContractFactory("StakingPool");
        staking = await Staking.deploy();

        CURRENT = await getCurrentTime();

        PoolFactory = await ethers.getContractFactory("PoolFactory");
        poolFactory = await upgrades.deployProxy(PoolFactory, [staking.address, admin.address]);
        await poolFactory.deployed();
    });

    describe("Deployment:", async () => {
        it("Should revert when invalid admin contract address", async () => {
            await expect(upgrades.deployProxy(PoolFactory, [staking.address, constants.ZERO_ADDRESS])).to.revertedWith(
                "Invalid Admin contract"
            );
            await expect(upgrades.deployProxy(PoolFactory, [staking.address, user1.address])).to.revertedWith(
                "Invalid Admin contract"
            );
            await expect(upgrades.deployProxy(PoolFactory, [staking.address, treasury.address])).to.revertedWith(
                "Invalid Admin contract"
            );
        });
    });
    // GET FUNC
    describe("getPool:", async () => {
        it("should return a pool address: ", async () => {
            await poolFactory.create(
                owner.address,
                token.address,
                token.address,
                mkpManager.address,
                REWARD_RATE,
                POOL_DURATION,
                PANCAKE_ROUTER,
                USD_TOKEN
            );
            const addressPool = await poolFactory.getPool(1);
        });
    });
    describe("getPoolInfo:", async () => {
        it("should return pool info: ", async () => {
            await poolFactory.create(
                owner.address,
                token.address,
                token.address,
                mkpManager.address,
                REWARD_RATE,
                POOL_DURATION,
                PANCAKE_ROUTER,
                USD_TOKEN
            );
            const poolInfo = await poolFactory.getPoolInfo(1);
            const addressPool = await poolFactory.getPool(1);
            expect(poolInfo.poolAddress).to.equal(addressPool);
        });
    });
    describe("getAllPool:", async () => {
        it("should return all pool info: ", async () => {
            await poolFactory.create(
                user2.address,
                token.address,
                token.address,
                mkpManager.address,
                REWARD_RATE,
                POOL_DURATION,
                PANCAKE_ROUTER,
                USD_TOKEN
            );
            await poolFactory.create(
                user1.address,
                token.address,
                token.address,
                mkpManager.address,
                REWARD_RATE,
                POOL_DURATION,
                PANCAKE_ROUTER,
                USD_TOKEN
            );
            const allPool = await poolFactory.getAllPool();
            expect(allPool.length).to.equal(2);
        });
    });
    // CREATE
    describe("create:", async () => {
        it("should revert when caller is not owner or admin: ", async () => {
            await expect(
                poolFactory
                    .connect(user1)
                    .create(
                        owner.address,
                        token.address,
                        token.address,
                        mkpManager.address,
                        REWARD_RATE,
                        POOL_DURATION,
                        PANCAKE_ROUTER,
                        USD_TOKEN
                    )
            ).to.be.revertedWith("Adminable: caller is not an owner or admin");
        });
        it("should create success: ", async () => {
            await poolFactory.create(
                user2.address,
                token.address,
                token.address,
                mkpManager.address,
                REWARD_RATE,
                POOL_DURATION,
                PANCAKE_ROUTER,
                USD_TOKEN
            );
            await poolFactory.create(
                user1.address,
                token.address,
                token.address,
                mkpManager.address,
                REWARD_RATE,
                POOL_DURATION,
                PANCAKE_ROUTER,
                USD_TOKEN
            );
            const allPool = await poolFactory.getAllPool();
            expect(allPool.length).to.equal(2);
        });
    });
});
