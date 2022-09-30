const { expect } = require("chai");
const { upgrades, ethers } = require("hardhat");
const { MaxUint256, AddressZero } = ethers.constants;

const TOTAL_SUPPLY = ethers.utils.parseEther("1000000000000");
const MINT_FEE = 1000;

describe.only("MetaCitizen", () => {
    beforeEach(async () => {
        const accounts = await ethers.getSigners();
        owner = accounts[0];
        user1 = accounts[1];
        user2 = accounts[2];
        user3 = accounts[3];

        Treasury = await ethers.getContractFactory("Treasury");
        Token = await ethers.getContractFactory("MTVS");
        MetaCitizen = await ethers.getContractFactory("MetaCitizen");

        treasury = await upgrades.deployProxy(Treasury, [owner.address]);
        token = await upgrades.deployProxy(Token, [
            owner.address,
            "Vetaversus Token",
            "MTVS",
            TOTAL_SUPPLY,
            treasury.address,
        ]);
        metaCitizen = await upgrades.deployProxy(MetaCitizen, [
            owner.address,
            treasury.address,
            token.address,
            MINT_FEE,
        ]);
        await metaCitizen.deployed();

        await token.mint(user1.address, TOTAL_SUPPLY);
        await token.connect(user1).approve(metaCitizen.address, MaxUint256);
    });

    describe("Deployment", async () => {
        it("Check name, symbol and default state", async () => {
            const name = await metaCitizen.name();
            const symbol = await metaCitizen.symbol();
            expect(name).to.equal("MetaversusWorld Citizen");
            expect(symbol).to.equal("MWC");
        });

        it("Check tokenURI", async () => {
            const URI = "this_is_uri_1";
            await metaCitizen.setBaseURI(URI);

            await metaCitizen.mint(user1.address);
            const newURI = await metaCitizen.tokenURI(1);

            expect(newURI).to.equal(URI + ".json");
        });

        it("Check Owner", async () => {
            const ownerAddress = await metaCitizen.owner();
            expect(ownerAddress).to.equal(owner.address);
        });
    });

    describe("setAdmin function", async () => {
        it("should revert when caller is not owner", async () => {
            await expect(metaCitizen.connect(user1).setAdmin(user2.address, true)).to.be.revertedWith(
                "Ownable: caller is not the owner"
            );
        });

        it("should set admin successful", async () => {
            await metaCitizen.setAdmin(user2.address, true);
            expect(await metaCitizen.isAdmin(user2.address)).to.equal(true);

            await metaCitizen.setAdmin(user1.address, false);
            expect(await metaCitizen.isAdmin(user1.address)).to.equal(false);

            await metaCitizen.setAdmin(user2.address, false);
            expect(await metaCitizen.isAdmin(user2.address)).to.equal(false);
        });
    });

    describe("setTreasury function", async () => {
        it("should revert when caller is not owner", async () => {
            await expect(metaCitizen.connect(user1).setTreasury(user2.address)).to.be.revertedWith(
                "Adminable: caller is not an owner or admin"
            );
        });

        it("should revert when address equal to zero address", async () => {
            await expect(metaCitizen.setTreasury(AddressZero)).to.be.revertedWith("invalid address !");
        });

        it("should set treasury successful", async () => {
            await metaCitizen.setTreasury(treasury.address);
            expect(await metaCitizen.treasury()).to.equal(treasury.address);

            await metaCitizen.setTreasury(user1.address);
            expect(await metaCitizen.treasury()).to.equal(user1.address);

            await metaCitizen.setTreasury(treasury.address);
            expect(await metaCitizen.treasury()).to.equal(treasury.address);
        });
    });

    describe("setMintFee function", async () => {
        it("should revert when Ownable: caller is not an owner or admin", async () => {
            await expect(metaCitizen.connect(user1).setMintFee(1000)).to.be.revertedWith(
                "Adminable: caller is not an owner or admin"
            );
        });

        it("should revert when price equal to zero", async () => {
            await expect(metaCitizen.setMintFee(0)).to.be.revertedWith("amount must be greater than zero !");
        });

        it("should set minting fee successful", async () => {
            await metaCitizen.setMintFee("1000000");
            expect(await metaCitizen.mintFee()).to.equal("1000000");

            await metaCitizen.setMintFee("2000000");
            expect(await metaCitizen.mintFee()).to.equal("2000000");
        });
    });

    describe("buy function", async () => {
        it("should revert when user already have one", async () => {
            await metaCitizen.connect(user1).buy();
            await expect(metaCitizen.connect(user1).buy()).to.be.revertedWith("Already have one");
        });

        it("should revert Can not be transfered", async () => {
            await metaCitizen.connect(user1).buy();

            await metaCitizen.connect(user1).approve(user2.address, 1);
            await expect(metaCitizen.connect(user2).transferFrom(user1.address, user3.address, 1)).to.be.revertedWith(
                "Can not be transfered"
            );
        });

        it("should buy successful", async () => {
            await expect(() => metaCitizen.connect(user1).buy()).to.changeTokenBalance(token, user1, -1 * MINT_FEE);
            expect(await token.balanceOf(treasury.address)).to.equal(TOTAL_SUPPLY.add(MINT_FEE));
            expect(await metaCitizen.ownerOf(1)).to.equal(user1.address);
            expect(await metaCitizen.balanceOf(user1.address)).to.equal(1);

            expect(await token.balanceOf(user1.address)).to.equal(TOTAL_SUPPLY.sub(MINT_FEE));
            expect(await token.balanceOf(treasury.address)).to.equal(TOTAL_SUPPLY.add(MINT_FEE));
        });
    });

    describe("mint function", async () => {
        it("should revert when receiver is zero address", async () => {
            await expect(metaCitizen.mint(AddressZero)).to.be.revertedWith("invalid address !");
        });

        it("should revert when caller is not owner or admin", async () => {
            await expect(metaCitizen.connect(user1).mint(user1.address)).to.be.revertedWith(
                "Adminable: caller is not an owner or admin"
            );
        });

        it("should revert when user already have one", async () => {
            await metaCitizen.connect(user1).buy();
            await expect(metaCitizen.connect(user1).buy()).to.be.revertedWith("Already have one");
        });

        it("should mint successful", async () => {
            await metaCitizen.mint(user1.address);

            expect(await token.balanceOf(treasury.address)).to.equal(TOTAL_SUPPLY);
            expect(await metaCitizen.ownerOf(1)).to.equal(user1.address);
            expect(await metaCitizen.balanceOf(user1.address)).to.equal(1);
        });
    });

    describe("supportsInterface function", async () => {
        it("should supportsInterface", async () => {
            let boolVal = await metaCitizen.supportsInterface(0x01ffc9a7);
            expect(boolVal).to.be.true;

            boolVal = await metaCitizen.supportsInterface(0xffffffff);
            expect(boolVal).to.be.false;
        });
    });

    describe("transfer", async () => {
        it("should revert Can not be transfered", async () => {
            await metaCitizen.connect(user1).buy();

            await metaCitizen.connect(user1).approve(user2.address, 1);
            await expect(metaCitizen.connect(user2).transferFrom(user1.address, user3.address, 1)).to.be.revertedWith(
                "Can not be transfered"
            );
        });
    });
});
