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

        Admin = await ethers.getContractFactory("Admin");
        admin = await upgrades.deployProxy(Admin, [owner.address]);

        Treasury = await ethers.getContractFactory("Treasury");
        treasury = await upgrades.deployProxy(Treasury, [admin.address]);

        Token = await ethers.getContractFactory("MTVS");
        token = await upgrades.deployProxy(Token, [
            user1.address,
            "Metaversus Token",
            "MTVS",
            TOTAL_SUPPLY,
            admin.address,
        ]);
    });

    describe("Deployment:", async () => {
        it("Should revert when invalid admin contract address", async () => {
            await expect(
                upgrades.deployProxy(Token, [
                    user1.address,
                    "Metaversus Token",
                    "MTVS",
                    TOTAL_SUPPLY,
                    AddressZero,
                ])
            ).to.revertedWith("Invalid Admin contract");
            await expect(
                upgrades.deployProxy(Token, [
                    user1.address,
                    "Metaversus Token",
                    "MTVS",
                    TOTAL_SUPPLY,
                    user1.address,
                ])
            ).to.revertedWith("Invalid Admin contract");
            await expect(
                upgrades.deployProxy(Token, [
                    user1.address,
                    "Metaversus Token",
                    "MTVS",
                    TOTAL_SUPPLY,
                    treasury.address,
                ])
            ).to.revertedWith("Invalid Admin contract");
        });

        it("Check name, symbol and default state: ", async () => {
            const name = await token.name();
            const symbol = await token.symbol();
            const totalSupply = await token.totalSupply();
            const total = await token.balanceOf(treasury.address);
            expect(name).to.equal("Metaversus Token");
            expect(symbol).to.equal("MTVS");
            expect(totalSupply).to.equal(TOTAL_SUPPLY);
            expect(total).to.equal(totalSupply);
        });
    });

    // describe("isController function:", async () => {
    //     it("should return role of account checking: ", async () => {
    //         expect(await token.isController(user1.address)).to.equal(false);
    //         await token.setController(user1.address, true);
    //         expect(await token.isController(user1.address)).to.equal(true);
    //     });
    // });

    // describe("setController function:", async () => {
    //     it("should revert when caller not be owner: ", async () => {
    //         await expect(token.connect(user1).setController(user1.address, true)).to.be.revertedWith(
    //             "Caller is not an owner"
    //         );
    //     });
    //     it("should revert when user address equal to zero address: ", async () => {
    //         await expect(token.setController(AddressZero, true)).to.be.revertedWith("ERROR: invalid address !");
    //     });
    //     it("should set controller success: ", async () => {
    //         expect(await token.isController(user1.address)).to.equal(false);
    //         await token.setController(user1.address, true);
    //         expect(await token.isController(user1.address)).to.equal(true);
    //         await token.setController(user1.address, false);
    //         expect(await token.isController(user1.address)).to.equal(false);
    //     });
    // });

    describe("mint function:", async () => {
        it("should revert when caller not be controller: ", async () => {
            await expect(token.connect(user1).mint(user1.address, 100)).to.be.revertedWith(
                "Caller is not an owner or admin"
            );
        });
        it("should revert when receiver is zero address: ", async () => {
            await expect(token.mint(AddressZero, 100)).to.be.revertedWith("Invalid address");
        });
        it("should revert when amount equal to zero: ", async () => {
            await expect(token.mint(user1.address, 0)).to.be.revertedWith("Invalid amount");
        });
        it("should mint success: ", async () => {
            await token.mint(user1.address, 100);
            expect(await token.balanceOf(user1.address)).to.equal(100);
        });
    });

    describe("burn function:", async () => {
        it("should revert when amount equal to zero: ", async () => {
            await expect(token.burn(0)).to.be.revertedWith("Invalid amount");
        });

        it("should burn success: ", async () => {
            await token.mint(user1.address, 100);

            await token.connect(user1).burn(50);

            expect(await token.balanceOf(user1.address)).to.equal(50);
        });
    });
});
