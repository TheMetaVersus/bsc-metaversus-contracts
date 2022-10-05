const { constants } = require("@openzeppelin/test-helpers");
const { ZERO_ADDRESS } = require("@openzeppelin/test-helpers/src/constants");
const { expect } = require("chai");
const { upgrades, ethers } = require("hardhat");
const { multiply, add, subtract } = require("js-big-decimal");
const { getCurrentTime, skipTime } = require("../utils");

describe("Marketplace interact with Tokens:", () => {
    before(async () => {
        TOTAL_SUPPLY = ethers.utils.parseEther("1000");
        PRICE = ethers.utils.parseEther("1");
        ONE_ETHER = ethers.utils.parseEther("1");
        ONE_WEEK = 604800;
        const accounts = await ethers.getSigners();
        owner = accounts[0];
        user1 = accounts[1];
        user2 = accounts[2];
        user3 = accounts[3];

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

        USD = await ethers.getContractFactory("USD");
        usd = await upgrades.deployProxy(USD, [user1.address, "USD Token", "USD", TOTAL_SUPPLY, treasury.address]);

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

        NftTest = await ethers.getContractFactory("NftTest");
        nftTest = await upgrades.deployProxy(NftTest, [
            "NFT test",
            "NFT",
            token.address,
            treasury.address,
            250,
            PRICE,
            admin.address,
        ]);

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

        await admin.connect(owner).setAdmin(mtvsManager.address, true);
    });

    describe("Setup: Set permitted tokens => Unpause contracts => Connect order contract", () => {
        it("Set permitted tokens", async () => {
            expect(await admin.isPermittedPaymentToken(token.address)).to.equal(false);
            expect(await admin.isPermittedPaymentToken(usd.address)).to.equal(false);
            expect(await admin.isPermittedPaymentToken(constants.ZERO_ADDRESS)).to.equal(false);

            await admin.setPermittedPaymentToken(token.address, true);
            await admin.setPermittedPaymentToken(usd.address, true);
            await admin.setPermittedPaymentToken(constants.ZERO_ADDRESS, true);

            expect(await admin.isPermittedPaymentToken(token.address)).to.equal(true);
            expect(await admin.isPermittedPaymentToken(usd.address)).to.equal(true);
            expect(await admin.isPermittedPaymentToken(constants.ZERO_ADDRESS)).to.equal(true);
        });

        it("Unpause contracts", async () => {
            expect(await orderManager.paused()).to.equal(true);
            expect(await mtvsManager.paused()).to.equal(true);
            expect(await mkpManager.paused()).to.equal(true);

            await orderManager.setPause(false);
            await mtvsManager.setPause(false);
            await mkpManager.setPause(false);

            expect(await orderManager.paused()).to.equal(false);
            expect(await mtvsManager.paused()).to.equal(false);
            expect(await mkpManager.paused()).to.equal(false);
        });

        it("Connect order contract", async () => {
            expect(await mkpManager.orderManager()).to.equal(constants.ZERO_ADDRESS);

            await mkpManager.setOrder(orderManager.address);

            expect(await mkpManager.orderManager()).to.equal(orderManager.address);
        });
    });
});
