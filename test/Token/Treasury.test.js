const { expect } = require("chai");
const { upgrades, ethers } = require("hardhat");
const { AddressZero } = ethers.constants;

describe("Treasury:", () => {
    beforeEach(async () => {
        TOTAL_SUPPLY = ethers.utils.parseEther("1000000000000");

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

    describe("setPermittedPaymentToken function:", async () => {
        it("should revert when caller not be an owner or admin: ", async () => {
            await expect(treasury.connect(user1).setPermittedPaymentToken(token.address, true)).to.be.revertedWith(
                "Adminable: caller is not an owner or admin"
            );
        });
        it("should revert when payment token is invalid address: ", async () => {
            await expect(treasury.setPermittedPaymentToken(AddressZero, true)).to.be.revertedWith(
                "ERROR: invalid address !"
            );
        });
        it("should set payment token success: ", async () => {
            await treasury.setPermittedPaymentToken(token.address, true);
            expect(await treasury.isPermitedToken(token.address)).to.equal(true);

            await treasury.setPermittedPaymentToken(token.address, false);
            expect(await treasury.isPermitedToken(token.address)).to.equal(false);
        });
    });

    describe("distribute function:", async () => {
        it("should revert when caller not be an owner or admin: ", async () => {
            await expect(treasury.connect(user1).distribute(token.address, user1.address, 10)).to.be.revertedWith(
                "Adminable: caller is not an owner or admin"
            );
        });
        it("should revert when payment token is not permit: ", async () => {
            await expect(treasury.distribute(token.address, user1.address, 10)).to.be.revertedWith(
                "ERROR: token is not permit !"
            );
        });
        it("should revert when payment token is invalid address: ", async () => {
            await token.mint(treasury.address, 100);
            await treasury.setPermittedPaymentToken(token.address, true);
            await expect(treasury.distribute(AddressZero, user1.address, 10)).to.be.revertedWith(
                "ERROR: invalid address !"
            );
        });
        it("should revert when destination address is invalid address: ", async () => {
            await token.mint(treasury.address, 100);
            await treasury.setPermittedPaymentToken(token.address, true);
            await expect(treasury.distribute(token.address, AddressZero, 10)).to.be.revertedWith(
                "ERROR: invalid address !"
            );
        });
        it("should revert when token amount equal to zero: ", async () => {
            await token.mint(treasury.address, 100);
            await treasury.setPermittedPaymentToken(token.address, true);
            await expect(treasury.distribute(token.address, user1.address, 0)).to.be.revertedWith(
                "ERROR: amount must be greater than zero !"
            );
        });
        it("should distribute token success: ", async () => {
            await token.mint(treasury.address, 100);
            await treasury.setPermittedPaymentToken(token.address, true);
            await treasury.distribute(token.address, user1.address, 10);
            expect(await token.balanceOf(user1.address)).to.equal(10);
        });
    });
});
