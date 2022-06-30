const chai = require("chai");
const { expect } = require("chai");
const { upgrades } = require("hardhat");
const { solidity } = require("ethereum-waffle");

chai.use(solidity);
const { add, subtract, multiply, divide } = require("js-big-decimal");
const constants = require("@openzeppelin/test-helpers/src/constants");
describe("MTVS Token:", () => {
    beforeEach(async () => {
        MAX_LIMIT =
            "115792089237316195423570985008687907853269984665640564039457584007913129639935";
        TOTAL_SUPPLY = "1000000000000000000000000000000";
        ZERO_ADDR = "0x0000000000000000000000000000000000000000";
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
        it("Check name, symbol and default state: ", async () => {
            const name = await token.name();
            const symbol = await token.symbol();
            const totalSupply = await token.totalSupply();
            const total = await token.balanceOf(treasury.address);
            expect(name).to.equal("Vetaversus Token");
            expect(symbol).to.equal("MTVS");
            expect(totalSupply).to.equal(TOTAL_SUPPLY);
            expect(total).to.equal(totalSupply);
        });

        it("Check Owner: ", async () => {
            const ownerAddress = await token.owner();
            expect(ownerAddress).to.equal(owner.address);
        });
    });

    describe("isComtroller function:", async () => {
        it("should return role of account checking: ", async () => {
            expect(await token.isController(user1.address)).to.equal(false);
            await token.setController(user1.address, true);
            expect(await token.isController(user1.address)).to.equal(true);
        });
    });

    describe("setController function:", async () => {
        it("should revert when user address equal to zero address: ", async () => {
            await expect(token.setController(constants.ZERO_ADDRESS, true)).to.be.revertedWith(
                "ERROR: Invalid address !"
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
            await expect(token.mint(ZERO_ADDR, 100)).to.be.revertedWith("ERROR: Invalid address !");
        });
        it("should revert when amount equal to zero: ", async () => {
            await expect(token.mint(user1.address, 0)).to.be.revertedWith(
                "ERROR: Amount equal to zero !"
            );
        });
        it("should mint success: ", async () => {
            await token.mint(user1.address, 100);
            expect(await token.balanceOf(user1.address)).to.equal(100);
        });
    });

    describe("burn function:", async () => {
        it("should revert when caller not be controller: ", async () => {
            await expect(token.connect(user1).burn(user1.address, 100)).to.be.revertedWith(
                "Ownable: caller is not a controller"
            );
        });

        it("should burn success: ", async () => {
            await token.mint(user1.address, 100);

            await token.connect(owner).burn(user1.address, 50);

            expect(await token.balanceOf(user1.address)).to.equal(50);
        });
    });
});
