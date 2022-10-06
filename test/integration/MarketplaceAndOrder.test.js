const { constants, balance } = require("@openzeppelin/test-helpers");
const { ZERO_ADDRESS } = require("@openzeppelin/test-helpers/src/constants");
const { expect } = require("chai");
const { upgrades, ethers } = require("hardhat");
const { multiply, add, subtract } = require("js-big-decimal");
const { getCurrentTime, skipTime } = require("../utils");
const { MerkleTree } = require("merkletreejs");
const keccak256 = require("keccak256");
const { parseEther } = require("ethers/lib/utils");
describe("Marketplace interact with Order", () => {
    before(async () => {
        TOTAL_SUPPLY = ethers.utils.parseEther("1000");
        PRICE = ethers.utils.parseEther("1");
        ONE_ETHER = ethers.utils.parseEther("1");
        ONE_WEEK = 604800;
        MINT_FEE = 1000;
        BID_PRICE = parseEther("100");
        BUY_BID_PRICE = add(BID_PRICE, parseEther("100"));
        [owner, user1, user2, user3] = await ethers.getSigners();

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

        MetaCitizen = await ethers.getContractFactory("MetaCitizen");
        metaCitizen = await upgrades.deployProxy(MetaCitizen, [
            treasury.address,
            token.address,
            MINT_FEE,
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

        CollectionFactory = await ethers.getContractFactory("CollectionFactory");
        collectionFactory = await upgrades.deployProxy(CollectionFactory, [
            templateERC721.address,
            templateERC1155.address,
            admin.address,
            user1.address,
            user2.address,
        ]);

        MkpManager = await ethers.getContractFactory("MarketPlaceManager");
        mkpManager = await upgrades.deployProxy(MkpManager, [treasury.address, admin.address]);

        CollectionFactory = await ethers.getContractFactory("CollectionFactory");
        collectionFactory = await upgrades.deployProxy(CollectionFactory, [
            templateERC721.address,
            templateERC1155.address,
            admin.address,
            user1.address,
            user2.address,
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

        await admin.setPermittedPaymentToken(token.address, true);
        await admin.setPermittedPaymentToken(constants.ZERO_ADDRESS, true);

        await admin.setPermittedNFT(tokenMintERC721.address, true);
        await admin.setPermittedNFT(tokenMintERC1155.address, true);
        await admin.setPermittedNFT(nftTest.address, true);

        await token.connect(user1).approve(orderManager.address, ethers.constants.MaxUint256);
        await token.mint(user1.address, parseEther("1000"));

        await token.connect(user2).approve(orderManager.address, ethers.constants.MaxUint256);
        await token.mint(user2.address, parseEther("1000"));

        await token.connect(user3).approve(orderManager.address, ethers.constants.MaxUint256);
        await token.mint(user3.address, parseEther("1000"));

        await mkpManager.setOrder(orderManager.address);
        await orderManager.setPause(false);
    });
    describe("Buy/Mint a NFT ", async () => {
        it("Buy token ERC721", async () => {
            await token.connect(user1).approve(nftTest.address, PRICE);
            await expect(() => nftTest.connect(user1).buy("nftTest_uri")).to.changeTokenBalance(nftTest, user1, 1);
            expect(await nftTest.balanceOf(user1.address)).to.equal(1);
        });
        it("Mint token ERC1155", async () => {
            await tokenMintERC1155.connect(owner).mint(user2.address, 100, "nftTest_uri");
            expect(await tokenMintERC1155.balanceOf(user2.address, 1)).to.equal(100);
        });
    });

    describe("Offer in wallet ", async () => {
        it("Offer in wallet", async () => {
            const current = await getCurrentTime();
            await token.connect(user2).approve(orderManager.address, ONE_ETHER);
            await expect(() =>
                orderManager
                    .connect(user2)
                    .makeOfferWalletAsset(
                        token.address,
                        ONE_ETHER,
                        user1.address,
                        nftTest.address,
                        1,
                        1,
                        add(current, ONE_WEEK)
                    )
            ).to.changeTokenBalance(token, user2, ONE_ETHER.mul(-1));
        });
        it("ReOffer in wallet", async () => {
            const current = await getCurrentTime();
            await token.connect(user2).approve(orderManager.address, ONE_ETHER);
            await expect(() =>
                orderManager
                    .connect(user2)
                    .makeOfferWalletAsset(
                        token.address,
                        ONE_ETHER.mul(2),
                        user1.address,
                        nftTest.address,
                        1,
                        1,
                        add(current, ONE_WEEK)
                    )
            ).to.changeTokenBalance(token, user2, ONE_ETHER.mul(-1));
        });
        it("Offer in wallet with native", async () => {
            const current = await getCurrentTime();

            await expect(() =>
                orderManager
                    .connect(user3)
                    .makeOfferWalletAsset(
                        ZERO_ADDRESS,
                        ONE_ETHER.mul(2),
                        user1.address,
                        nftTest.address,
                        1,
                        1,
                        add(current, ONE_WEEK),
                        { value: ONE_ETHER.mul(2) }
                    )
            ).to.changeEtherBalance(user3, ONE_ETHER.mul(-2));
        });
    });

    describe("Create a market item", async () => {
        it("Create a market item", async () => {
            const startTime = await getCurrentTime();
            const endTime = add(await getCurrentTime(), ONE_WEEK);

            const leaves = [user1.address, user2.address].map(value => keccak256(value));
            merkleTree = new MerkleTree(leaves, keccak256, { sort: true });

            rootHash = merkleTree.getHexRoot();
            await nftTest.connect(user1).approve(orderManager.address, 1);
            await orderManager
                .connect(user1)
                .sell(nftTest.address, 1, 1, ONE_ETHER, startTime, endTime, token.address, rootHash);
        });
    });

    describe("Offer in market item", async () => {
        it("Offer in market item", async () => {
            const endTime = add(await getCurrentTime(), ONE_WEEK);
            await orderManager.connect(user3).makeOffer(1, token.address, ONE_ETHER, endTime, { value: 0 });
            // await expect(() =>
            //     orderManager.connect(user3).makeOffer(1, token.address, ONE_ETHER, endTime, { value: 0 })
            // )
            //     .to.changeEtherBalance(user3, ONE_ETHER)
            //     .and.to.changeTokenBalance(token, user3, ONE_ETHER.mul(-1));
        });
        it("ReOffer in market item", async () => {
            const endTime = add(await getCurrentTime(), ONE_WEEK);

            await expect(() =>
                orderManager.connect(user3).makeOffer(1, token.address, ONE_ETHER.mul(2), endTime)
            ).to.changeTokenBalance(token, user3, ONE_ETHER.mul(-1));
        });
    });

    describe("Cancel sell NFT", async () => {
        it("Cancel sell", async () => {
            await expect(() => orderManager.connect(user1).cancelSell(1)).to.changeTokenBalance(nftTest, user1, 1);
        });
    });

    describe("ReSell in marketplace and Buy it", async () => {
        it("Resell NFT", async () => {
            const startTime = await getCurrentTime();
            const endTime = add(await getCurrentTime(), ONE_WEEK);

            const leaves = [user1.address, user2.address].map(value => keccak256(value));
            merkleTree = new MerkleTree(leaves, keccak256, { sort: true });

            rootHash = merkleTree.getHexRoot();
            await nftTest.connect(user1).approve(orderManager.address, 1);
            await orderManager
                .connect(user1)
                .sell(nftTest.address, 1, 1, ONE_ETHER, startTime, endTime, token.address, rootHash);
        });

        it("Buy NFT in marketplace", async () => {
            const leaf = keccak256(user2.address);
            const proof = merkleTree.getHexProof(leaf);
            await orderManager.connect(user2).buy(1, proof, { value: 0 });
            expect(await nftTest.balanceOf(user2.address)).to.equal(1);
        });
    });
});
