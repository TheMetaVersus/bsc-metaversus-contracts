const chai = require("chai");
const { expect } = require("chai");
const { upgrades } = require("hardhat");
const { solidity } = require("ethereum-waffle");
const { constants } = require("@openzeppelin/test-helpers");
const Big = require("big.js");
const { skipTime } = require("../utils");

chai.use(solidity);
const { add, subtract, multiply, divide } = require("js-big-decimal");
const bigDecimal = require("js-big-decimal");
describe("TokenMintERC721:", () => {
    beforeEach(async () => {
        MAX_LIMIT =
            "115792089237316195423570985008687907853269984665640564039457584007913129639935";
        TOTAL_SUPPLY = "1000000000000000000000000000000";
        PRICE = 1000;
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

        await tokenMintERC721.deployed();
    });

    describe("Deployment:", async () => {
        it("Check name, symbol and default state: ", async () => {
            const name = await tokenMintERC721.name();
            const symbol = await tokenMintERC721.symbol();
            const price = await tokenMintERC721.price();
            expect(name).to.equal("NFT Metaversus");
            expect(symbol).to.equal("nMTVS");
            expect(price).to.equal(PRICE);

            let royaltiesInfo = await tokenMintERC721.defaultRoyaltyInfo();
            expect(royaltiesInfo.receiver).to.equal(treasury.address);
            expect(royaltiesInfo.royaltyFraction).to.equal(250);
        });
        it("Check tokenURI: ", async () => {
            await tokenMintERC721.mint(user1.address);
            const URI = "this_is_uri_1";
            const tx = await tokenMintERC721.setTokenURI(URI, 0);
            await tx.wait();
            const newURI = await tokenMintERC721.tokenURI(0);

            expect(newURI).to.equal(URI + ".json");
        });
        it("Check Owner: ", async () => {
            const ownerAddress = await tokenMintERC721.owner();
            expect(ownerAddress).to.equal(owner.address);
        });
    });

    describe("isAdmin function:", async () => {
        it("should return whether caller is admin or not: ", async () => {
            await tokenMintERC721.setAdmin(user2.address, true);
            expect(await tokenMintERC721.isAdmin(user2.address)).to.equal(true);

            await tokenMintERC721.setAdmin(user2.address, false);
            expect(await tokenMintERC721.isAdmin(user2.address)).to.equal(false);
        });
    });

    describe("setAdmin function:", async () => {
        it("should revert when caller is not owner: ", async () => {
            await expect(
                tokenMintERC721.connect(user1).setAdmin(user2.address, true)
            ).to.be.revertedWith("Ownable: caller is not the owner");
        });
        it("should set admin success: ", async () => {
            await tokenMintERC721.setAdmin(user2.address, true);
            expect(await tokenMintERC721.isAdmin(user2.address)).to.equal(true);

            await tokenMintERC721.setAdmin(user1.address, false);
            expect(await tokenMintERC721.isAdmin(user1.address)).to.equal(false);

            await tokenMintERC721.setAdmin(user2.address, false);
            expect(await tokenMintERC721.isAdmin(user2.address)).to.equal(false);
        });
    });

    describe("setTreasury function:", async () => {
        it("should revert when caller is not owner: ", async () => {
            await expect(
                tokenMintERC721.connect(user1).setTreasury(user2.address)
            ).to.be.revertedWith("Ownable: caller is not an owner or admin");
        });
        it("should revert when price equal to zero: ", async () => {
            await expect(tokenMintERC721.setPrice(0)).to.be.revertedWith(
                "ERROR: amount must be greater than zero !"
            );
        });
        it("should set treasury success: ", async () => {
            await tokenMintERC721.setTreasury(treasury.address);
            expect(await tokenMintERC721.treasury()).to.equal(treasury.address);

            await tokenMintERC721.setTreasury(user1.address);
            expect(await tokenMintERC721.treasury()).to.equal(user1.address);

            await tokenMintERC721.setTreasury(treasury.address);
            expect(await tokenMintERC721.treasury()).to.equal(treasury.address);
        });
    });

    describe("buy function:", async () => {
        it("should buy success: ", async () => {
            await token.mint(user1.address, TOTAL_SUPPLY);
            await token.approve(user1.address, MAX_LIMIT);

            await token.connect(user1).approve(tokenMintERC721.address, MAX_LIMIT);

            await expect(() =>
                tokenMintERC721.connect(user1).buy("this_uri")
            ).to.changeTokenBalance(token, user1, -PRICE);
            expect(await token.balanceOf(treasury.address)).to.equal(add(TOTAL_SUPPLY, PRICE));

            expect(await tokenMintERC721.balanceOf(user1.address)).to.equal(1);
            expect(await tokenMintERC721.tokenURI(0)).to.equal("this_uri" + ".json");
        });
    });
    describe("setPrice function:", async () => {
        it("should revert when newPrice equal to zero: ", async () => {
            await expect(tokenMintERC721.connect(user1).setPrice(1000)).to.be.revertedWith(
                "Ownable: caller is not an owner or admin"
            );
        });
        it("should revert when price equal to zero: ", async () => {
            await expect(tokenMintERC721.setPrice(0)).to.be.revertedWith(
                "ERROR: amount must be greater than zero !"
            );
        });
        it("should set treasury success: ", async () => {
            let newPrice = 1000000;
            await tokenMintERC721.setPrice(newPrice);
            expect(await tokenMintERC721.price()).to.equal(newPrice);
            newPrice = 2000000;
            await tokenMintERC721.setPrice(newPrice);
            expect(await tokenMintERC721.price()).to.equal(newPrice);
            newPrice = 3000000;
            await tokenMintERC721.setPrice(newPrice);
            expect(await tokenMintERC721.price()).to.equal(newPrice);
        });
    });

    describe("mint function:", async () => {
        it("should revert when newPrice equal to zero: ", async () => {
            await expect(tokenMintERC721.connect(user1).mint(owner.address)).to.be.revertedWith(
                "Ownable: caller is not an owner or admin"
            );
        });
        it("should revert when address equal to zero address: ", async () => {
            await expect(tokenMintERC721.mint(constants.ZERO_ADDRESS)).to.be.revertedWith(
                "ERROR: Invalid address !"
            );
        });
        it("should mint success: ", async () => {
            await token.mint(owner.address, "1000000000000000000");
            await token.approve(owner.address, MAX_LIMIT);
            await token.connect(owner).approve(tokenMintERC721.address, MAX_LIMIT);

            await tokenMintERC721.mint(user2.address);
            expect(await tokenMintERC721.balanceOf(user2.address)).to.equal(1);
        });
    });
});
