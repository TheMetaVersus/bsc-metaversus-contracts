const chai = require("chai");
const { expect } = require("chai");
const { upgrades } = require("hardhat");
const { solidity } = require("ethereum-waffle");
const { constants } = require("@openzeppelin/test-helpers");

chai.use(solidity);
const { add, subtract, multiply, divide } = require("js-big-decimal");
describe("Treasury:", () => {
    beforeEach(async () => {
        MAX_LIMIT =
            "115792089237316195423570985008687907853269984665640564039457584007913129639935";
        TOTAL_SUPPLY = "1000000000000000000000000000000";

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
    });

    describe("Deployment:", async () => {
        it("Check Owner: ", async () => {
            const ownerAddress = await token.owner();
            expect(ownerAddress).to.equal(owner.address);
        });
    });

    describe("isPermitedToken:", async () => {
        it("should return whether token input is in permit token list or not: ", async () => {
            await treasury.setPaymentToken(token.address, true);
            expect(await treasury.isPermitedToken(token.address)).to.equal(true);

            await treasury.setPaymentToken(token.address, false);
            expect(await treasury.isPermitedToken(token.address)).to.equal(false);
        });
    });

    describe("isAdmin function:", async () => {
        it("should return whether caller is admin or not: ", async () => {
            await treasury.setAdmin(user2.address, true);
            expect(await treasury.isAdmin(user2.address)).to.equal(true);

            await treasury.setAdmin(user2.address, false);
            expect(await treasury.isAdmin(user2.address)).to.equal(false);
        });
    });

    describe("setAdmin function:", async () => {
        it("should revert when caller is not owner: ", async () => {
            await expect(treasury.connect(user1).setAdmin(user2.address, true)).to.be.revertedWith(
                "Ownable: caller is not the owner"
            );
        });
        it("should set admin success: ", async () => {
            await treasury.setAdmin(user2.address, true);
            expect(await treasury.isAdmin(user2.address)).to.equal(true);

            await treasury.setAdmin(user1.address, false);
            expect(await treasury.isAdmin(user1.address)).to.equal(false);

            await treasury.setAdmin(user2.address, false);
            expect(await treasury.isAdmin(user2.address)).to.equal(false);
        });
    });

    describe("setPaymentToken function:", async () => {
        it("should revert when caller not be an owner or admin: ", async () => {
            await expect(
                treasury.connect(user1).setPaymentToken(token.address, true)
            ).to.be.revertedWith("Ownable: caller is not an owner or admin");
        });
        it("should revert when payment token is invalid address: ", async () => {
            await expect(treasury.setPaymentToken(constants.ZERO_ADDRESS, true)).to.be.revertedWith(
                "ERROR: Invalid address !"
            );
        });
        it("should set payment token success: ", async () => {
            await treasury.setPaymentToken(token.address, true);
            expect(await treasury.isPermitedToken(token.address)).to.equal(true);

            await treasury.setPaymentToken(token.address, false);
            expect(await treasury.isPermitedToken(token.address)).to.equal(false);
        });
    });

    describe("distribute function:", async () => {
        it("should revert when caller not be an owner or admin: ", async () => {
            await expect(
                treasury.connect(user1).distribute(token.address, user1.address, 10)
            ).to.be.revertedWith("Ownable: caller is not an owner or admin");
        });
        it("should revert when payment token is not permit: ", async () => {
            await expect(treasury.distribute(token.address, user1.address, 10)).to.be.revertedWith(
                "ERROR: Token is not permit !"
            );
        });
        it("should revert when payment token is invalid address: ", async () => {
            await token.mint(treasury.address, 100);
            await treasury.setPaymentToken(token.address, true);
            await expect(
                treasury.distribute(constants.ZERO_ADDRESS, user1.address, 10)
            ).to.be.revertedWith("ERROR: Invalid address !");
        });
        it("should revert when destination address is invalid address: ", async () => {
            await token.mint(treasury.address, 100);
            await treasury.setPaymentToken(token.address, true);
            await expect(
                treasury.distribute(token.address, constants.ZERO_ADDRESS, 10)
            ).to.be.revertedWith("ERROR: Invalid address !");
        });
        it("should revert when token amount equal to zero: ", async () => {
            await token.mint(treasury.address, 100);
            await treasury.setPaymentToken(token.address, true);
            await expect(treasury.distribute(token.address, user1.address, 0)).to.be.revertedWith(
                "ERROR: amount must be greater than zero !"
            );
        });
        it("should distribute token success: ", async () => {
            await token.mint(treasury.address, 100);
            await treasury.setPaymentToken(token.address, true);
            await treasury.distribute(token.address, user1.address, 10);
            expect(await token.balanceOf(user1.address)).to.equal(10);
        });
    });
});
