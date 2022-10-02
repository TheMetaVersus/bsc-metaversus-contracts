const { constants } = require("@openzeppelin/test-helpers");
const { expect } = require("chai");
const { upgrades, ethers } = require("hardhat");
const { multiply, add, subtract } = require("js-big-decimal");
const { getCurrentTime, skipTime } = require("../utils");
describe("OrderManager:", () => {
    beforeEach(async () => {
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

        MTVSManager = await ethers.getContractFactory("MetaversusManager");
        mtvsManager = await upgrades.deployProxy(MTVSManager, [
            tokenMintERC721.address,
            tokenMintERC1155.address,
            token.address,
            treasury.address,
            mkpManager.address,
            admin.address,
        ]);

        OrderManager = await ethers.getContractFactory("OrderManager");
        orderManager = await upgrades.deployProxy(OrderManager, [mkpManager.address, admin.address]);

        await mkpManager.setPermitedNFT(tokenMintERC721.address, true);
        await mkpManager.setPermitedNFT(tokenMintERC1155.address, true);
        await mkpManager.setPermitedNFT(nftTest.address, true);

        await mkpManager.setPermitedPaymentToken(token.address, true);
        await mkpManager.setPermitedPaymentToken(constants.ZERO_ADDRESS, true);
    });

    describe("Deployment:", async () => {
        it("Should revert when invalid admin contract address", async () => {
            await expect(
                upgrades.deployProxy(OrderManager, [mkpManager.address, constants.ZERO_ADDRESS])
            ).to.revertedWith("Invalid Admin contract");
            await expect(upgrades.deployProxy(OrderManager, [mkpManager.address, user1.address])).to.revertedWith(
                "Invalid Admin contract"
            );
            await expect(upgrades.deployProxy(OrderManager, [mkpManager.address, treasury.address])).to.revertedWith(
                "Invalid Admin contract"
            );
        });
    });
});
