const { constants } = require("@openzeppelin/test-helpers");
const { expect } = require("chai");
const { upgrades, ethers } = require("hardhat");
const { multiply, add, subtract } = require("js-big-decimal");
const { getCurrentTime, skipTime } = require("../utils");
const { MerkleTree } = require("merkletreejs");
const keccak256 = require("keccak256");

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

        TemplateERC721 = await ethers.getContractFactory("TokenERC721");
        templateERC721 = await TemplateERC721.deploy();
        await templateERC721.deployed();

        TemplateERC1155 = await ethers.getContractFactory("TokenERC1155");
        templateERC1155 = await TemplateERC1155.deploy();
        await templateERC1155.deployed();

        MkpManager = await ethers.getContractFactory("MarketPlaceManager");
        mkpManager = await upgrades.deployProxy(MkpManager, [treasury.address, admin.address]);

        CollectionFactory = await ethers.getContractFactory("CollectionFactory");
        collectionFactory = await upgrades.deployProxy(CollectionFactory, [
            templateERC721.address,
            templateERC1155.address,
            admin.address,
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

    describe("Sell function:", async () => {
        beforeEach(async () => {
            await orderManager.setPause(false);
            startTime = await getCurrentTime();
            endTime = add(await getCurrentTime(), ONE_WEEK);

            const leaves = [user1.address, user2.address].map(value => keccak256(value));
            merkleTree = new MerkleTree(leaves, keccak256, { sort: true });

            rootHash = merkleTree.getHexRoot();
        });

        it("should revert when contract is paused", async () => {
            await orderManager.setPause(true);
            expect(await orderManager.paused()).to.equal(true);

            await expect(
                orderManager.sell(constants.ZERO_ADDRESS, 0, 100, 100, startTime, endTime, token.address, rootHash)
            ).to.revertedWith("Pausable: paused");
        });

        it("should revert when nft contract is not permitted: ", async () => {
            await expect(
                orderManager.sell(constants.ZERO_ADDRESS, 0, 100, 100, startTime, endTime, token.address, rootHash)
            ).to.be.revertedWith("ERROR: NFT not allow to sell on marketplace !");
        });

        it("should revert when amount equal to zero: ", async () => {
            await expect(
                orderManager.sell(tokenMintERC721.address, 0, 0, 100, startTime, endTime, token.address, rootHash)
            ).to.be.revertedWith("Invalid amount");
        });
        it("should revert when gross sale value equal to zero: ", async () => {
            await expect(
                orderManager.sell(tokenMintERC721.address, 0, 100, 0, startTime, endTime, token.address, rootHash)
            ).to.be.revertedWith("Invalid amount");
        });
        it("should revert ERROR: NFT not allow to sell on marketplace !", async () => {
            await token.mint(user1.address, ONE_ETHER);

            await token.connect(user1).approve(tokenMintERC721.address, ethers.constants.MaxUint256);

            const current = await getCurrentTime();

            await expect(
                orderManager
                    .connect(user1)
                    .sell(treasury.address, 1, 1, 1000, current, add(current, ONE_WEEK), token.address, rootHash)
            ).to.be.revertedWith("ERROR: NFT not allow to sell on marketplace !");
        });
        it("should sell success and check private collection: ", async () => {
            await token.mint(user1.address, ONE_ETHER);
            await token.connect(user1).approve(nftTest.address, ethers.constants.MaxUint256);

            await nftTest.connect(user1).buy("this_uri");
            await nftTest.connect(user1).approve(mkpManager.address, 1);

            await orderManager
                .connect(user1)
                .sell(nftTest.address, 1, 1, 1000, startTime, endTime, token.address, rootHash);

            const leaf = keccak256(user1.address);
            const proof = merkleTree.getHexProof(leaf);

            const marketItemId = await mkpManager.getCurrentMarketItem();
            expect(await mkpManager.verify(marketItemId.toNumber(), proof, leaf)).to.equal(true);
            expect(await nftTest.ownerOf(1)).to.equal(mkpManager.address);
        });
    });
});
