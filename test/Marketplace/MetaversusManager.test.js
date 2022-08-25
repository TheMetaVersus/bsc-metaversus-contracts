const { expect } = require("chai");
const { upgrades, ethers } = require("hardhat");
const { constants } = require("@openzeppelin/test-helpers");
const { add } = require("js-big-decimal");

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

        TokenMintERC721 = await ethers.getContractFactory("TokenMintERC721");
        tokenMintERC721 = await upgrades.deployProxy(TokenMintERC721, [
            owner.address,
            "NFT Metaversus",
            "nMTVS",
            treasury.address,
            250,
        ]);

        TokenMintERC1155 = await ethers.getContractFactory("TokenMintERC1155");
        tokenMintERC1155 = await upgrades.deployProxy(TokenMintERC1155, [owner.address, treasury.address, 250]);

        MkpManager = await ethers.getContractFactory("MarketPlaceManager");
        mkpManager = await upgrades.deployProxy(MkpManager, [owner.address, token.address, treasury.address]);

        MTVSManager = await ethers.getContractFactory("MetaversusManager");
        mtvsManager = await upgrades.deployProxy(MTVSManager, [
            owner.address,
            tokenMintERC721.address,
            tokenMintERC1155.address,
            token.address,
            treasury.address,
            mkpManager.address,
        ]);

        await mtvsManager.setPause(false);
        await mkpManager.setPause(false);
        await mkpManager.setPermitedNFT(tokenMintERC721.address, true);
        await mkpManager.setPermitedNFT(tokenMintERC1155.address, true);
    });

    describe("Deployment:", async () => {
        it("Check all address token were set: ", async () => {
            expect(await mtvsManager.paymentToken()).to.equal(token.address);
            expect(await mtvsManager.tokenMintERC721()).to.equal(tokenMintERC721.address);
            expect(await mtvsManager.tokenMintERC1155()).to.equal(tokenMintERC1155.address);

            expect(await mtvsManager.marketplace()).to.equal(mkpManager.address);
            expect(await mtvsManager.treasury()).to.equal(treasury.address);
        });

        it("Check Owner: ", async () => {
            const ownerAddress = await mtvsManager.owner();
            expect(ownerAddress).to.equal(owner.address);
        });
    });

    describe("setAdmin function:", async () => {
        it("should revert when caller is not owner: ", async () => {
            await expect(mtvsManager.connect(user1).setAdmin(user2.address, true)).to.be.revertedWith(
                "Ownable: caller is not the owner"
            );
        });
        it("should set admin success: ", async () => {
            await mtvsManager.setAdmin(user2.address, true);
            expect(await mtvsManager.isAdmin(user2.address)).to.equal(true);

            await mtvsManager.setAdmin(user1.address, false);
            expect(await mtvsManager.isAdmin(user1.address)).to.equal(false);

            await mtvsManager.setAdmin(user2.address, false);
            expect(await mtvsManager.isAdmin(user2.address)).to.equal(false);
        });
    });

    describe("setMarketplace function:", async () => {
        it("should revert when caller is not owner: ", async () => {
            await expect(mtvsManager.connect(user1).setMarketplace(user2.address)).to.be.revertedWith(
                "Adminable: caller is not an owner or admin"
            );
        });
        it("should revert when address equal to zero address: ", async () => {
            await expect(mtvsManager.setMarketplace(constants.ZERO_ADDRESS)).to.be.revertedWith(
                "ERROR: invalid address !"
            );
        });
        it("should set marketplace address success: ", async () => {
            await mtvsManager.setMarketplace(user2.address);
            expect(await mtvsManager.marketplace()).to.equal(user2.address);

            await mtvsManager.setMarketplace(user1.address);
            expect(await mtvsManager.marketplace()).to.equal(user1.address);
        });
    });

    describe("setTreasury function:", async () => {
        it("should revert when caller is not owner or admin: ", async () => {
            await expect(mtvsManager.connect(user1).setTreasury(user2.address)).to.be.revertedWith(
                "Adminable: caller is not an owner or admin"
            );
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
            await expect(mtvsManager.connect(user1).createNFT(1, 0, "this_uri", ONE_ETHER, 0, 0)).to.be.revertedWith(
                "ERROR: amount must be greater than zero !"
            );
        });
        it("should create NFT success: ", async () => {
            await token.mint(user2.address, AMOUNT);

            await token.connect(user2).approve(mtvsManager.address, ethers.constants.MaxUint256);

            await mkpManager.setAdmin(mtvsManager.address, true);

            await tokenMintERC721.setAdmin(mtvsManager.address, true);

            await mtvsManager.connect(user2).createNFT(0, 1, "this_uri", 0, 0, 0);

            // check owner nft
            expect(await tokenMintERC721.ownerOf(1)).to.equal(mkpManager.address);

            let allItems = await mkpManager.fetchMarketItemsByAddress(user2.address);
            expect(allItems[0].status).to.equal(0); // 0 is FREE

            await tokenMintERC1155.setAdmin(mtvsManager.address, true);
            const blockNumAfter = await ethers.provider.getBlockNumber();
            const blockAfter = await ethers.provider.getBlock(blockNumAfter);
            const current = blockAfter.timestamp;
            const time = current + 30 * 24 * 60 * 60; // sale 30 ngay
            await mtvsManager.connect(user2).createNFT(1, 100, "this_uri", 0, time, time + 10000);

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
            await mtvsManager.connect(user2).createNFT(0, 1, "this_uri", 1000, time, time + 10000);

            // check owner nft
            expect(await tokenMintERC721.ownerOf(1)).to.equal(mkpManager.address);
            const allItems = await mkpManager.fetchMarketItemsByAddress(user2.address);
            expect(allItems[0].status).to.equal(0);
            expect(parseInt(allItems[0].endTime)).greaterThan(current);
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
