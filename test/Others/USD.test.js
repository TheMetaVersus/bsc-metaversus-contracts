const { expect } = require("chai");
const { upgrades, ethers } = require("hardhat");

const constants = require("@openzeppelin/test-helpers/src/constants");
describe("MTVS Token:", () => {
    beforeEach(async () => {
        TOTAL_SUPPLY = ethers.utils.parseEther("1000000000000");
        const accounts = await ethers.getSigners();
        owner = accounts[0];
        user1 = accounts[1];
        user2 = accounts[2];
        user3 = accounts[3];

        Treasury = await ethers.getContractFactory("Treasury");
        treasury = await upgrades.deployProxy(Treasury, [owner.address]);

        Token = await ethers.getContractFactory("USD");
        token = await upgrades.deployProxy(Token, [
            owner.address,
            "USD Token Test",
            "USD",
            TOTAL_SUPPLY,
            treasury.address,
        ]);
    });

    describe("Deployment:", async () => {
        it("Check name, symbol and default state: ", async () => {
            const name = await token.name();
            const symbol = await token.symbol();
            const totalSupply = await token.totalSupply();
            const total = await token.balanceOf(treasury.address);
            expect(name).to.equal("USD Token Test");
            expect(symbol).to.equal("USD");
            expect(totalSupply).to.equal(TOTAL_SUPPLY);
            expect(total).to.equal(totalSupply);
        });

        it("Check Owner: ", async () => {
            const ownerAddress = await token.owner();
            expect(ownerAddress).to.equal(owner.address);
        });
    });

    describe("isController function:", async () => {
        it("should return role of account checking: ", async () => {
            expect(await token.isController(user1.address)).to.equal(false);
            await token.setController(user1.address, true);
            expect(await token.isController(user1.address)).to.equal(true);
        });
    });

    describe("setController function:", async () => {
        it("should revert when caller not be owner: ", async () => {
            await expect(token.connect(user1).setController(user1.address, true)).to.be.revertedWith(
                "Ownable: caller is not the owner"
            );
        });
        it("should revert when user address equal to zero address: ", async () => {
            await expect(token.setController(constants.ZERO_ADDRESS, true)).to.be.revertedWith(
                "ERROR: invalid address !"
            );
        });
        it("should set controller success: ", async () => {
            expect(await token.isController(user1.address)).to.equal(false);
            await token.setController(user1.address, true);
            expect(await token.isController(user1.address)).to.equal(true);
            await token.setController(user1.address, false);
            expect(await token.isController(user1.address)).to.equal(false);
        });
    });

    describe("mint function:", async () => {
        it("should revert when caller not be controller: ", async () => {
            await expect(token.connect(user1).mint(user1.address, 100)).to.be.revertedWith(
                "Ownable: caller is not a controller"
            );
        });
        it("should revert when receiver is zero address: ", async () => {
            await expect(token.mint(constants.ZERO_ADDRESS, 100)).to.be.revertedWith("ERROR: invalid address !");
        });
        it("should revert when amount equal to zero: ", async () => {
            await expect(token.mint(user1.address, 0)).to.be.revertedWith("ERROR: Amount equal to zero !");
        });
        it("should mint success: ", async () => {
            await token.mint(user1.address, 100);
            expect(await token.balanceOf(user1.address)).to.equal(100);
        });
    });

    describe("burn function:", async () => {
        it("should revert when amount equal to zero: ", async () => {
            await expect(token.burn(0)).to.be.revertedWith("ERROR: Amount equal to zero !");
        });

        it("should burn success: ", async () => {
            await token.mint(user1.address, 100);

            await token.connect(user1).burn(50);

            expect(await token.balanceOf(user1.address)).to.equal(50);
        });
    });
});
