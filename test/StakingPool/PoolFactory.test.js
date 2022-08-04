const { expect } = require("chai");
const { upgrades } = require("hardhat");
const { skipTime, acceptable, getCurrentTime } = require("../utils");
const { add, multiply, divide, subtract } = require("js-big-decimal");

describe("Pool Factory:", () => {
    beforeEach(async () => {
        REWARD_RATE = 15854895992; // 50 % APY
        POOL_DURATION = 9 * 30 * 24 * 60 * 60; // 9 months
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
        staking = await Staking.deploy();

        CURRENT = await getCurrentTime();

        PoolFactory = await ethers.getContractFactory("PoolFactory");
        poolFactory = await upgrades.deployProxy(PoolFactory, [staking.address]);
        await poolFactory.deployed();
    });

    describe("Deployment:", async () => {
        it("should return owner address : ", async () => {
            const ownerAddress = await poolFactory.owner();
            expect(ownerAddress).to.equal(owner.address);
        });
    });
    // GET FUNC
    describe("getPool:", async () => {
        it("should return a pool address: ", async () => {
            await poolFactory.create(
                owner.address,
                token.address,
                token.address,
                nftMTVSTicket.address,
                REWARD_RATE,
                POOL_DURATION
            );
            const addressPool = await poolFactory.getPool(1);
            // console.log("addressPool", addressPool);
        });
    });
    describe("getPoolInfo:", async () => {
        it("should return pool info: ", async () => {
            await poolFactory.create(
                owner.address,
                token.address,
                token.address,
                nftMTVSTicket.address,
                REWARD_RATE,
                POOL_DURATION
            );
            const poolInfo = await poolFactory.getPoolInfo(1);
            // console.log("poolInfo", poolInfo);
            const addressPool = await poolFactory.getPool(1);
            // console.log("addressPool", addressPool);
            expect(poolInfo.poolAddress).to.equal(addressPool);
        });
    });
    describe("getAllPool:", async () => {
        it("should return all pool info: ", async () => {
            await poolFactory.create(
                user2.address,
                token.address,
                token.address,
                nftMTVSTicket.address,
                REWARD_RATE,
                POOL_DURATION
            );
            await poolFactory.create(
                user1.address,
                token.address,
                token.address,
                nftMTVSTicket.address,
                REWARD_RATE,
                POOL_DURATION
            );
            const allPool = await poolFactory.getAllPool();
            // console.log("allPool", allPool);
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
                        nftMTVSTicket.address,
                        REWARD_RATE,
                        POOL_DURATION
                    )
            ).to.be.revertedWith("Adminable: caller is not an owner or admin");
        });
        it("should create success: ", async () => {
            await poolFactory.create(
                user2.address,
                token.address,
                token.address,
                nftMTVSTicket.address,
                REWARD_RATE,
                POOL_DURATION
            );
            await poolFactory.create(
                user1.address,
                token.address,
                token.address,
                nftMTVSTicket.address,
                REWARD_RATE,
                POOL_DURATION
            );
            const allPool = await poolFactory.getAllPool();
            expect(allPool.length).to.equal(2);
        });
    });
});
