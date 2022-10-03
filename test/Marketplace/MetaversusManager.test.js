const { expect } = require("chai");
const { upgrades, ethers } = require("hardhat");
const { constants } = require("@openzeppelin/test-helpers");
const { add } = require("js-big-decimal");
const { generateMerkleTree, generateLeaf } = require("../utils");

describe("Metaversus Manager:", () => {
    beforeEach(async () => {
        TOTAL_SUPPLY = ethers.utils.parseEther("1000000000000");
        AMOUNT = ethers.utils.parseEther("1000000000000");
        ONE_ETHER = ethers.utils.parseEther("1");

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

        MkpManager = await ethers.getContractFactory("MarketPlaceManager");
        mkpManager = await upgrades.deployProxy(MkpManager, [treasury.address, admin.address]);

        // Collection
        TokenERC721 = await ethers.getContractFactory("TokenERC721");
        tokenERC721 = await TokenERC721.deploy();

        TokenERC1155 = await ethers.getContractFactory("TokenERC1155");
        tokenERC1155 = await TokenERC1155.deploy();

        CollectionFactory = await ethers.getContractFactory("CollectionFactory");
        collectionFactory = await upgrades.deployProxy(CollectionFactory, [
            tokenERC721.address,
            tokenERC1155.address,
            admin.address,
            mkpManager.address,
            user1.address,
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

        await admin.setPermittedNFT(tokenMintERC721.address, true);
        await admin.setPermittedNFT(tokenMintERC1155.address, true);
    });

    describe("Deployment:", async () => {
        it("Should be revert when NFT721 Address equal to Zero Address", async () => {
            await expect(
                upgrades.deployProxy(MTVSManager, [
                    constants.ZERO_ADDRESS,
                    tokenMintERC1155.address,
                    token.address,
                    treasury.address,
                    mkpManager.address,
                    admin.address,
                ])
            ).to.be.revertedWith("Invalid address");
        });

        it("Should be revert when NFT1155 Address equal to Zero Address", async () => {
            await expect(
                upgrades.deployProxy(MTVSManager, [
                    tokenMintERC721.address,
                    constants.ZERO_ADDRESS,
                    token.address,
                    treasury.address,
                    mkpManager.address,
                    admin.address,
                ])
            ).to.be.revertedWith("Invalid address");
        });

        it("Should be revert when token Address equal to Zero Address", async () => {
            await expect(
                upgrades.deployProxy(MTVSManager, [
                    tokenMintERC721.address,
                    tokenMintERC1155.address,
                    constants.ZERO_ADDRESS,
                    treasury.address,
                    mkpManager.address,
                    admin.address,
                ])
            ).to.be.revertedWith("Invalid address");
        });

        it("Should be revert when Treasury Address equal to Zero Address", async () => {
            await expect(
                upgrades.deployProxy(MTVSManager, [
                    tokenMintERC721.address,
                    tokenMintERC1155.address,
                    token.address,
                    constants.ZERO_ADDRESS,
                    mkpManager.address,
                    admin.address,
                ])
            ).to.be.revertedWith("Invalid address");
        });

        it("Should be revert when Marketplace Address equal to Zero Address", async () => {
            await expect(
                upgrades.deployProxy(MTVSManager, [
                    tokenMintERC721.address,
                    tokenMintERC1155.address,
                    token.address,
                    treasury.address,
                    constants.ZERO_ADDRESS,
                    admin.address,
                ])
            ).to.be.revertedWith("Invalid address");
        });

        it("Should revert when invalid admin contract address", async () => {
            await expect(
                upgrades.deployProxy(MTVSManager, [
                    tokenMintERC721.address,
                    tokenMintERC1155.address,
                    token.address,
                    treasury.address,
                    mkpManager.address,
                    constants.ZERO_ADDRESS,
                ])
            ).to.revertedWith("Invalid Admin contract");
            await expect(
                upgrades.deployProxy(MTVSManager, [
                    tokenMintERC721.address,
                    tokenMintERC1155.address,
                    token.address,
                    treasury.address,
                    mkpManager.address,
                    user1.address,
                ])
            ).to.revertedWith("Invalid Admin contract");
            await expect(
                upgrades.deployProxy(MTVSManager, [
                    tokenMintERC721.address,
                    tokenMintERC1155.address,
                    token.address,
                    treasury.address,
                    mkpManager.address,
                    treasury.address,
                ])
            ).to.revertedWith("Invalid Admin contract");
        });

        it("Check all address token were set: ", async () => {
            expect(await mtvsManager.paymentToken()).to.equal(token.address);
            expect(await mtvsManager.tokenMintERC721()).to.equal(tokenMintERC721.address);
            expect(await mtvsManager.tokenMintERC1155()).to.equal(tokenMintERC1155.address);

            expect(await mtvsManager.marketplace()).to.equal(mkpManager.address);
            expect(await mtvsManager.treasury()).to.equal(treasury.address);
        });
    });

    describe("setMarketplace function:", async () => {
        it("Only admin can call this function", async () => {
            await expect(mtvsManager.connect(user1).setMarketplace(user2.address)).to.revertedWith(
                "Caller is not an owner or admin"
            );
        });

        it("should revert when address equal to zero address: ", async () => {
            await expect(mtvsManager.setMarketplace(constants.ZERO_ADDRESS)).to.be.revertedWith("Invalid address");
        });

        it("should set marketplace address success: ", async () => {
            await mtvsManager.setMarketplace(user2.address);
            expect(await mtvsManager.marketplace()).to.equal(user2.address);

            await mtvsManager.setMarketplace(user1.address);
            expect(await mtvsManager.marketplace()).to.equal(user1.address);
        });
    });

    describe("setTreasury function:", async () => {
        it("Only admin can call this function", async () => {
            await expect(mtvsManager.connect(user1).setTreasury(user2.address)).to.revertedWith(
                "Caller is not an owner or admin"
            );
        });

        it("should revert when invalid wallet", async () => {
            await expect(mtvsManager.setTreasury(constants.ZERO_ADDRESS)).to.revertedWith("Invalid address");
        });

        it("should set treasury success: ", async () => {
            await mtvsManager.setTreasury(treasury.address);
            expect(await mtvsManager.treasury()).to.equal(treasury.address);

            await mtvsManager.setTreasury(user1.address);
            expect(await mtvsManager.treasury()).to.equal(user1.address);

            await mtvsManager.setTreasury(treasury.address);
            expect(await mtvsManager.treasury()).to.equal(treasury.address);
        });
    });

    describe("createNFT function:", async () => {
        it("should revert when amount equal to zero amount: ", async () => {
            await expect(
                mtvsManager.connect(user1).createNFT(1, 0, "this_uri", ONE_ETHER, 0, 0, token.address),
                token.address
            ).to.be.revertedWith("ERROR: amount must be greater than zero !");
        });
        it("should create NFT success: ", async () => {
            await token.mint(user2.address, AMOUNT);

            await token.connect(user2).approve(mtvsManager.address, ethers.constants.MaxUint256);

            await mkpManager.setAdmin(mtvsManager.address, true);

            await tokenMintERC721.setAdmin(mtvsManager.address, true);

            await mtvsManager.connect(user2).createNFT(0, 1, "this_uri", 0, 0, 0, token.address, false);

            // check owner nft
            expect(await tokenMintERC721.ownerOf(1)).to.equal(mkpManager.address);

            let allItems = await mkpManager.fetchMarketItemsByAddress(user2.address);
            expect(allItems[0].status).to.equal(0); // 0 is FREE

            await tokenMintERC1155.setAdmin(mtvsManager.address, true);
            const blockNumAfter = await ethers.provider.getBlockNumber();
            const blockAfter = await ethers.provider.getBlock(blockNumAfter);
            const current = blockAfter.timestamp;
            const time = current + 30 * 24 * 60 * 60; // sale 30 ngay
            await mtvsManager.connect(user2).createNFT(1, 100, "this_uri", 0, time, time + 10000, token.address, false);

            allItems = await mkpManager.fetchMarketItemsByAddress(user2.address);
            expect(allItems[1].status).to.equal(0);
            expect(parseInt(allItems[1].endTime)).lessThan(current);
        });
        it("should create and sale NFT success: ", async () => {
            await token.mint(user2.address, AMOUNT);

            await token.connect(user2).approve(mtvsManager.address, ethers.constants.MaxUint256);

            await mkpManager.setAdmin(mtvsManager.address, true);

            await tokenMintERC721.setAdmin(mtvsManager.address, true);
            const blockNumAfter = await ethers.provider.getBlockNumber();
            const blockAfter = await ethers.provider.getBlock(blockNumAfter);
            const current = blockAfter.timestamp;
            const time = current + 30 * 24 * 60 * 60; // sale 30 ngay
            await mtvsManager
                .connect(user2)
                .createNFT(0, 1, "this_uri", 1000, time, time + 10000, token.address, false);

            // check owner nft
            expect(await tokenMintERC721.ownerOf(1)).to.equal(mkpManager.address);
            const allItems = await mkpManager.fetchMarketItemsByAddress(user2.address);
            expect(allItems[0].status).to.equal(0);
            expect(parseInt(allItems[0].endTime)).greaterThan(current);
        });
    });

    describe("createNFT limit function:", async () => {
        beforeEach(async () => {
            await collectionFactory.setPause(false);
            await collectionFactory.create(0, "NFT", "NFT", user1.address, 250);

            await collectionFactory.create(1, "NFT1155", "NFT1155", user1.address, 250);

            collection_1 = await collectionFactory.getCollectionInfo(1);
            collection_2 = await collectionFactory.getCollectionInfo(2);

            const merkleTree = generateMerkleTree([user1.address, user2.address]);
        });

        it("should revert when amount equal to zero amount: ", async () => {
            await expect(
                mtvsManager
                    .connect(user1)
                    .createNFTLimit(
                        collection_1.collectionAddress,
                        0,
                        "this_uri",
                        ONE_ETHER,
                        0,
                        0,
                        token.address,
                        merkleTree.getHexRoot()
                    ),
                token.address
            ).to.be.revertedWith("ERROR: amount must be greater than zero !");
        });

        it("should create NFT success: ", async () => {
            await token.mint(user2.address, AMOUNT);
            await token.connect(user2).approve(mtvsManager.address, ethers.constants.MaxUint256);

            await mtvsManager
                .connect(user2)
                .createNFTLimit(
                    nft_721.address,
                    1,
                    "this_uri",
                    ONE_ETHER,
                    0,
                    0,
                    token.address,
                    formatBytes32String("0x1234")
                );

            // check owner nft
            expect(await nft_721.ownerOf(1)).to.equal(mkpManager.address);

            let allItems = await mkpManager.fetchMarketItemsByAddress(user2.address);
            expect(allItems[0].status).to.equal(0); // 0 is FREE

            const blockNumAfter = await ethers.provider.getBlockNumber();
            const blockAfter = await ethers.provider.getBlock(blockNumAfter);
            const current = blockAfter.timestamp;
            const time = current + 30 * 24 * 60 * 60; // sale 30 ngay
            await mtvsManager
                .connect(user2)
                .createNFTLimit(
                    nft_1155.address,
                    100,
                    "this_uri",
                    ONE_ETHER,
                    time,
                    time + 10000,
                    token.address,
                    formatBytes32String("0x1234")
                );

            allItems = await mkpManager.fetchMarketItemsByAddress(user2.address);
            expect(allItems[1].status).to.equal(0);
        });
    });

    describe("buyTicketEvent function:", async () => {
        it("should revert when amount equal to zero amount: ", async () => {
            await expect(mtvsManager.connect(user1).buyTicketEvent(1, 0)).to.be.revertedWith(
                "ERROR: amount must be greater than zero !"
            );
        });
        it("should buy ticket success: ", async () => {
            await token.mint(user2.address, AMOUNT);
            await token.approve(user2.address, ethers.constants.MaxUint256);
            await token.connect(user2).approve(mtvsManager.address, ethers.constants.MaxUint256);
            const price = 10000;
            await expect(() => mtvsManager.connect(user2).buyTicketEvent(1, price)).to.changeTokenBalance(
                token,
                user2,
                -price
            );
            expect(await token.balanceOf(treasury.address)).to.equal(add(TOTAL_SUPPLY, price));
        });
    });
});
