const { expect } = require("chai");
const { upgrades, ethers } = require("hardhat");
const { constants } = require("@openzeppelin/test-helpers");
const { add } = require("js-big-decimal");

describe("Admin:", () => {
    beforeEach(async () => {
        const accounts = await ethers.getSigners();
        owner = accounts[0];
        user1 = accounts[1];
        user2 = accounts[2];
        user3 = accounts[3];

        Admin = await ethers.getContractFactory("Admin");
        admin = await upgrades.deployProxy(Admin, [owner.address]);

        Treasury = await ethers.getContractFactory("Treasury");
        treasury = await upgrades.deployProxy(Treasury, [owner.address]);

        MkpManager = await ethers.getContractFactory("MarketPlaceManager");
        mkpManager = await upgrades.deployProxy(MkpManager, [owner.address, treasury.address]);

        OrderManager = await ethers.getContractFactory("OrderManager");
        orderManager = await upgrades.deployProxy(OrderManager, [mkpManager.address, owner.address]);

        await admin.deployed();
    });

    describe("setAdmin function:", async () => {
        it("should revert when caller is not owner: ", async () => {
            await expect(admin.connect(user1).setAdmin(user2.address, true)).to.be.revertedWith(
                "Ownable: caller is not the owner"
            );
        });

        it("should revert when invalid wallet", async () => {
            await expect(admin.setAdmin(constants.ZERO_ADDRESS, true)).to.revertedWith("Invalid wallet");
            await expect(admin.setAdmin(admin.address, true)).to.revertedWith("Invalid wallet");
        });

        it("should set admin success: ", async () => {
            await admin.setAdmin(user2.address, true);
            expect(await admin.isAdmin(user2.address)).to.equal(true);

            await admin.setAdmin(user1.address, false);
            expect(await admin.isAdmin(user1.address)).to.equal(false);

            await admin.setAdmin(user2.address, false);
            expect(await admin.isAdmin(user2.address)).to.equal(false);
        });
    });

    describe("setOrder function:", async () => {
        it("should revert when caller is not owner: ", async () => {
            await expect(admin.connect(user1).setOrder(orderManager.address)).to.be.revertedWith(
                "Ownable: caller is not the owner"
            );
        });

        it("should revert when invalid order contract", async () => {
            await expect(admin.setOrder(constants.ZERO_ADDRESS)).to.revertedWith("Invalid address");
        });

        it("should set admin success: ", async () => {
            await admin.setOrder(orderManager.address);
            expect(await admin.isOrder(orderManager.address)).to.equal(true);
        });
    });

    describe("owner", async () => {
        it("should be ok: ", async () => {
            expect(await admin.owner()).to.equal(owner.address);
        });
    });

    describe("isAdmin", async () => {
        it("should be ok: ", async () => {
            await admin.setAdmin(user2.address, true);
            expect(await admin.isAdmin(user2.address)).to.equal(true);
            expect(await admin.isAdmin(owner.address)).to.equal(true);
            expect(await admin.isAdmin(user3.address)).to.equal(false);
        });
    });

    describe("isOrder", async () => {
        it("should be ok: ", async () => {
            await admin.setAdmin(user2.address, true);
            expect(await admin.isOrder(user2.address)).to.equal(false);
            expect(await admin.isOrder(owner.address)).to.equal(false);
            expect(await admin.isOrder(user3.address)).to.equal(false);
        });
    });
});
