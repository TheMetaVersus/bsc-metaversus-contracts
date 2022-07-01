const { expect } = require("chai");
const { upgrades, ethers } = require("hardhat");
const { constants } = require("@openzeppelin/test-helpers");
const { add, subtract, multiply, divide } = require("js-big-decimal");
const abiCoder = ethers.utils.defaultAbiCoder;
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
            expect(await mtvsManager.marketplace()).to.equal(mkpManager.address);
            expect(await mtvsManager.treasury()).to.equal(treasury.address);

            expect(await mtvsManager.fees(0)).to.equal(250);
            expect(await mtvsManager.fees(1)).to.equal(350);
            expect(await mtvsManager.fees(2)).to.equal(450);
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

    describe("setMarketplace function:", async () => {
        it("should revert when caller is not owner: ", async () => {
            await expect(
                mtvsManager.connect(user1).setMarketplace(user2.address)
            ).to.be.revertedWith("Ownable: caller is not an owner or admin");
        });
        it("should revert when address equal to zero address: ", async () => {
            await expect(mtvsManager.setMarketplace(constants.ZERO_ADDRESS)).to.be.revertedWith(
                "ERROR: Invalid address !"
            );
        });
        it("should set marketplace address success: ", async () => {
            await mtvsManager.setMarketplace(user2.address);
            expect(await mtvsManager.marketplace()).to.equal(user2.address);

            await mtvsManager.setMarketplace(user1.address);
            expect(await mtvsManager.marketplace()).to.equal(user1.address);
        });
    });

    describe("setFee function:", async () => {
        it("should revert when caller is not owner or admin: ", async () => {
            await expect(mtvsManager.connect(user1).setFee(100, 0)).to.be.revertedWith(
                "Ownable: caller is not an owner or admin"
            );
        });
        it("should revert when new fee equal to zero amount: ", async () => {
            await expect(mtvsManager.setFee(0, 0)).to.be.revertedWith(
                "ERROR: amount must be greater than zero !"
            );
        });
        it("should set fee success: ", async () => {
            await mtvsManager.setFee(100, 0);
            await mtvsManager.setFee(150, 1);
            await mtvsManager.setFee(200, 2);

            expect(await mtvsManager.fees(0)).to.equal(100);
            expect(await mtvsManager.fees(1)).to.equal(150);
            expect(await mtvsManager.fees(2)).to.equal(200);
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

    describe("createNFT function:", async () => {
        it("should revert when amount equal to zero amount: ", async () => {
            let data = abiCoder.encode(["string", "uint256"], ["ERC721", "0"]);
            await expect(mtvsManager.connect(user1).createNFT(data)).to.be.revertedWith(
                "ERROR: Amount must greater than 0"
            );
        });
        it("should create NFT success: ", async () => {
            let data = abiCoder.encode(["string", "uint256"], ["ERC721", "1000"]);
            await token.mint(user2.address, "9000000000000000000");
            await token.approve(user2.address, MAX_LIMIT);
            await token.connect(user2).approve(mtvsManager.address, MAX_LIMIT);

            await mkpManager.setAdmin(mtvsManager.address, true);

            await tokenMintERC721.setAdmin(mtvsManager.address, true);

            await expect(() => mtvsManager.connect(user2).createNFT(data)).to.changeTokenBalance(
                token,
                user2,
                -250
            );
            expect(await token.balanceOf(treasury.address)).to.equal(add(TOTAL_SUPPLY, 250));

            await tokenMintERC1155.setAdmin(mtvsManager.address, true);
            data = abiCoder.encode(["string", "uint256"], ["ERC1155", "100"]);
            await expect(() => mtvsManager.connect(user2).createNFT(data)).to.changeTokenBalance(
                token,
                user2,
                -250
            );
            expect(await token.balanceOf(treasury.address)).to.equal(add(TOTAL_SUPPLY, 500));
        });
    });

    describe("buyTicket function:", async () => {
        it("should buy ticket success: ", async () => {
            await token.mint(user2.address, "9000000000000000000");
            await token.approve(user2.address, MAX_LIMIT);
            await token.connect(user2).approve(mtvsManager.address, MAX_LIMIT);

            await nftMTVSTicket.setAdmin(mtvsManager.address, true);

            await expect(() => mtvsManager.connect(user2).buyTicket()).to.changeTokenBalance(
                token,
                user2,
                -350
            );
            expect(await token.balanceOf(treasury.address)).to.equal(add(TOTAL_SUPPLY, 350));

            expect(await nftMTVSTicket.balanceOf(user2.address)).to.equal(1);
        });
    });

    describe("buyTicketEvent function:", async () => {
        it("should buy ticket success: ", async () => {
            await token.mint(user2.address, "9000000000000000000");
            await token.approve(user2.address, MAX_LIMIT);
            await token.connect(user2).approve(mtvsManager.address, MAX_LIMIT);

            await expect(() => mtvsManager.connect(user2).buyTicketEvent(1)).to.changeTokenBalance(
                token,
                user2,
                -450
            );
            expect(await token.balanceOf(treasury.address)).to.equal(add(TOTAL_SUPPLY, 450));
        });
    });
});
