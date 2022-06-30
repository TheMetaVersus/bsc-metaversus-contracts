const { expect } = require("chai");
const { upgrades, ethers } = require("hardhat");

describe("Metaversus Manager:", () => {
    beforeEach(async () => {
        MAX_LIMIT =
            "115792089237316195423570985008687907853269984665640564039457584007913129639935";
        TOTAL_SUPPLY = "1000000000000000000000000000000";
        ZERO_ADDR = "0x0000000000000000000000000000000000000000";
        PRICE = "1000000000000000000";
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
            token.address,
            treasury.address,
            250,
            PRICE,
        ]);

        TokenMintERC1155 = await ethers.getContractFactory("TokenMintERC1155");
        tokenMintERC1155 = await upgrades.deployProxy(TokenMintERC1155, [
            owner.address,
            "uri",
            token.address,
            treasury.address,
            250,
            PRICE,
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

        MkpManager = await ethers.getContractFactory("MarketPlaceManager");
        mkpManager = await upgrades.deployProxy(MkpManager, [
            owner.address,
            token.address,
            treasury.address,
        ]);

        MTVSManager = await ethers.getContractFactory("MetaversusManager");
        mtvsManager = await upgrades.deployProxy(MTVSManager, [
            owner.address,
            tokenMintERC721.address,
            tokenMintERC1155.address,
            nftMTVSTicket.address,
            token.address,
            treasury.address,
            mkpManager.address,
            250,
            350,
            450,
        ]);
    });

    describe("Deployment:", async () => {
        it("Check all address token were set: ", async () => {
            expect(await mtvsManager.paymentToken()).to.equal(token.address);
            expect(await mtvsManager.tokenMintERC721()).to.equal(tokenMintERC721.address);
            expect(await mtvsManager.tokenMintERC1155()).to.equal(tokenMintERC1155.address);
            expect(await mtvsManager.nftTicket()).to.equal(nftMTVSTicket.address);
        });

        it("Check Owner: ", async () => {
            const ownerAddress = await mtvsManager.owner();
            expect(ownerAddress).to.equal(owner.address);
        });
    });

    describe("isAdmin function:", async () => {
        it("should return whether caller is admin or not: ", async () => {
            await mtvsManager.setAdmin(user2.address, true);
            expect(await mtvsManager.isAdmin(user2.address)).to.equal(true);

            await mtvsManager.setAdmin(user2.address, false);
            expect(await mtvsManager.isAdmin(user2.address)).to.equal(false);
        });
    });

    describe("setAdmin function:", async () => {
        it("should revert when caller is not owner: ", async () => {
            await expect(
                mtvsManager.connect(user1).setAdmin(user2.address, true)
            ).to.be.revertedWith("Ownable: caller is not the owner");
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

    describe("setTreasury function:", async () => {
        it("should revert when caller is not owner or admin: ", async () => {
            await expect(mtvsManager.connect(user1).setTreasury(user2.address)).to.be.revertedWith(
                "Ownable: caller is not an owner or admin"
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

    describe("buyTicket function:", async () => {
        it("should buy ticket success: ", async () => {
            await token.mint(user2.address, "9000000000000000000");
            await token.approve(user2.address, MAX_LIMIT);
            await token.connect(user2).approve(mtvsManager.address, MAX_LIMIT);

            await nftMTVSTicket.setAdmin(mtvsManager.address, true);

            await mtvsManager.connect(user2).buyTicket();
            expect(await nftMTVSTicket.balanceOf(user2.address)).to.equal(1);
        });
    });
});
