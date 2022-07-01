const chai = require("chai");
const { expect } = require("chai");
const { upgrades } = require("hardhat");
const { solidity } = require("ethereum-waffle");
const { constants } = require("@openzeppelin/test-helpers");
const Big = require("big.js");
const { skipTime } = require("../utils");

chai.use(solidity);
const { add, subtract, multiply, divide } = require("js-big-decimal");
describe("TokenMintERC1155:", () => {
    beforeEach(async () => {
        MAX_LIMIT =
            "115792089237316195423570985008687907853269984665640564039457584007913129639935";
        TOTAL_SUPPLY = "1000000000000000000000000000000";
        PRICE = 10000;
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

        TokenMintERC1155 = await ethers.getContractFactory("TokenMintERC1155");
        tokenMintERC1155 = await upgrades.deployProxy(TokenMintERC1155, [
            owner.address,
            "uri",
            token.address,
            treasury.address,
            250,
            PRICE,
        ]);

        await tokenMintERC1155.deployed();
    });

    describe("Deployment:", async () => {
        it("Check uri: ", async () => {
            await tokenMintERC1155.mint(user1.address, 100);
            const URI = "this_is_uri_1.json";
            const tx = await tokenMintERC1155.setURI(URI, 0);
            await tx.wait();
            const newURI = await tokenMintERC1155.uri(0);

            expect(newURI).to.equal(URI);
        });
        it("Check Owner: ", async () => {
            const ownerAddress = await tokenMintERC1155.owner();
            expect(ownerAddress).to.equal(owner.address);
        });
        it("Check royalties: ", async () => {
            let royaltiesInfo = await tokenMintERC1155.defaultRoyaltyInfo();
            expect(royaltiesInfo.receiver).to.equal(treasury.address);
            expect(royaltiesInfo.royaltyFraction).to.equal(250);
        });
    });

    describe("isAdmin function:", async () => {
        it("should return whether caller is admin or not: ", async () => {
            await tokenMintERC1155.setAdmin(user2.address, true);
            expect(await tokenMintERC1155.isAdmin(user2.address)).to.equal(true);

            await tokenMintERC1155.setAdmin(user2.address, false);
            expect(await tokenMintERC1155.isAdmin(user2.address)).to.equal(false);
        });
    });

    describe("setAdmin function:", async () => {
        it("should revert when caller is not owner: ", async () => {
            await expect(
                tokenMintERC1155.connect(user1).setAdmin(user2.address, true)
            ).to.be.revertedWith("Ownable: caller is not the owner");
        });
        it("should set admin success: ", async () => {
            await tokenMintERC1155.setAdmin(user2.address, true);
            expect(await tokenMintERC1155.isAdmin(user2.address)).to.equal(true);

            await tokenMintERC1155.setAdmin(user1.address, false);
            expect(await tokenMintERC1155.isAdmin(user1.address)).to.equal(false);

            await tokenMintERC1155.setAdmin(user2.address, false);
            expect(await tokenMintERC1155.isAdmin(user2.address)).to.equal(false);
        });
    });

    describe("setTreasury function:", async () => {
        it("should revert when caller is not owner: ", async () => {
            await expect(
                tokenMintERC1155.connect(user1).setTreasury(user2.address)
            ).to.be.revertedWith("Ownable: caller is not an owner or admin");
        });
        it("should revert when address equal to zero address: ", async () => {
            await expect(tokenMintERC1155.setTreasury(constants.ZERO_ADDRESS)).to.be.revertedWith(
                "ERROR: Invalid address !"
            );
        });
        it("should set treasury success: ", async () => {
            await tokenMintERC1155.setTreasury(treasury.address);
            expect(await tokenMintERC1155.treasury()).to.equal(treasury.address);

            await tokenMintERC1155.setTreasury(user1.address);
            expect(await tokenMintERC1155.treasury()).to.equal(user1.address);

            await tokenMintERC1155.setTreasury(treasury.address);
            expect(await tokenMintERC1155.treasury()).to.equal(treasury.address);
        });
    });

    describe("buy function:", async () => {
        it("should revert when amount equal to zero address: ", async () => {
            await expect(tokenMintERC1155.buy(0, "this_uri")).to.be.revertedWith(
                "ERROR: amount must be greater than zero !"
            );
        });
        it("should buy success: ", async () => {
            await token.mint(user1.address, "1000000000000000000");
            await token.approve(user1.address, MAX_LIMIT);
            await token.connect(user1).approve(tokenMintERC1155.address, MAX_LIMIT);

            await expect(() =>
                tokenMintERC1155.connect(user1).buy(100, "this_uri")
            ).to.changeTokenBalance(token, user1, -PRICE);
            expect(await token.balanceOf(treasury.address)).to.equal(add(TOTAL_SUPPLY, PRICE));

            expect(await tokenMintERC1155.balanceOf(user1.address, 0)).to.equal(100);
        });
    });

    describe("mint function:", async () => {
        it("should revert when caller is not owner: ", async () => {
            await expect(
                tokenMintERC1155.connect(user1).mint(user2.address, 100)
            ).to.be.revertedWith("Ownable: caller is not an owner or admin");
        });
        it("should revert when address equal to zero address: ", async () => {
            await expect(tokenMintERC1155.mint(constants.ZERO_ADDRESS, 100)).to.be.revertedWith(
                "ERROR: Invalid address !"
            );
        });
        it("should revert when amount equal to zero address: ", async () => {
            await expect(tokenMintERC1155.mint(user2.address, 0)).to.be.revertedWith(
                "ERROR: amount must be greater than zero !"
            );
        });
        it("should mint success: ", async () => {
            await token.mint(owner.address, "1000000000000000000");
            await token.approve(owner.address, MAX_LIMIT);
            await token.connect(owner).approve(tokenMintERC1155.address, MAX_LIMIT);

            await tokenMintERC1155.mint(user2.address, 100);
            expect(await tokenMintERC1155.balanceOf(user2.address, 0)).to.equal(100);
        });
    });
});
