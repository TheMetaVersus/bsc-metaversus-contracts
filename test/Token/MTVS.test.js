const { expect } = require("chai");
const { upgrades, ethers } = require("hardhat");

const { AddressZero } = ethers.constants;
describe("MTVS Token:", () => {
    beforeEach(async () => {
        TOTAL_SUPPLY = ethers.utils.parseEther("1000000000000");
        const accounts = await ethers.getSigners();
        owner = accounts[0];
        user1 = accounts[1];
        user2 = accounts[2];
        user3 = accounts[3];

        Token = await ethers.getContractFactory("MTVS");
        token = await upgrades.deployProxy(Token, ["Metaversus Token", "MTVS", TOTAL_SUPPLY, user1.address]);
    });

    describe("Deployment:", async () => {
        it("Should revert when invalid address", async () => {
            await expect(
                upgrades.deployProxy(Token, ["Metaversus Token", "MTVS", TOTAL_SUPPLY, AddressZero])
            ).to.revertedWith("InvalidAddress()");
        });

        it("Should revert when invalid amount", async () => {
            await expect(upgrades.deployProxy(Token, ["Metaversus Token", "MTVS", 0, user1.address])).to.revertedWith(
                "InvalidAmount()"
            );
        });

        it("Check name, symbol and default state: ", async () => {
            const name = await token.name();
            const symbol = await token.symbol();
            const totalSupply = await token.totalSupply();
            const total = await token.balanceOf(user1.address);
            expect(name).to.equal("Metaversus Token");
            expect(symbol).to.equal("MTVS");
            expect(totalSupply).to.equal(TOTAL_SUPPLY);
            expect(total).to.equal(totalSupply);
        });
    });

    describe("burn function:", async () => {
        it("should revert when amount equal to zero: ", async () => {
            await expect(token.burn(0)).to.be.revertedWith("InvalidAmount()");
        });

        it("should burn success: ", async () => {
            await expect(() => token.connect(user1).burn(50)).to.changeTokenBalance(token, user1, -50);
        });
    });
});
