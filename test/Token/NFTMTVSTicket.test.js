const { constants } = require("@openzeppelin/test-helpers");
const { expect } = require("chai");
const { upgrades, ethers } = require("hardhat");
const { add, subtract } = require("js-big-decimal");
describe("NFTMTVSTicket:", () => {
    beforeEach(async () => {
        TOTAL_SUPPLY = ethers.utils.parseEther("1000000000000");
        ONE_ETHER = ethers.utils.parseEther("1");
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

        NFTMTVSTicket = await ethers.getContractFactory("NFTMTVSTicket");
        nftMTVSTicket = await upgrades.deployProxy(NFTMTVSTicket, [
            owner.address,
            "NFT Metaversus Ticket",
            "nftMTVS",
            token.address,
            treasury.address,
            250,
            PRICE,
        ]);

        await nftMTVSTicket.deployed();
    });

    describe("Deployment:", async () => {
        it("Check name, symbol and default state: ", async () => {
            const name = await nftMTVSTicket.name();
            const symbol = await nftMTVSTicket.symbol();
            expect(name).to.equal("NFT Metaversus Ticket");
            expect(symbol).to.equal("nftMTVS");
        });
        it("Check tokenURI: ", async () => {
            const tokenId = 1;
            await nftMTVSTicket.mint(user1.address);
            const URI = "this_is_uri_1";
            const tx = await nftMTVSTicket.setBaseURI(URI);
            await tx.wait();
            const newURI = await nftMTVSTicket.tokenURI(tokenId);

            expect(newURI).to.equal(URI + "/" + tokenId + ".json");
        });
        it("Check Owner: ", async () => {
            const ownerAddress = await nftMTVSTicket.owner();
            expect(ownerAddress).to.equal(owner.address);
        });
    });

    describe("setAdmin function:", async () => {
        it("should revert when caller is not owner: ", async () => {
            await expect(
                nftMTVSTicket.connect(user1).setAdmin(user2.address, true)
            ).to.be.revertedWith("Ownable: caller is not the owner");
        });
        it("should set admin success: ", async () => {
            await nftMTVSTicket.setAdmin(user2.address, true);
            expect(await nftMTVSTicket.isAdmin(user2.address)).to.equal(true);

            await nftMTVSTicket.setAdmin(user1.address, false);
            expect(await nftMTVSTicket.isAdmin(user1.address)).to.equal(false);

            await nftMTVSTicket.setAdmin(user2.address, false);
            expect(await nftMTVSTicket.isAdmin(user2.address)).to.equal(false);
        });
    });

    describe("setTreasury function:", async () => {
        it("should revert when caller is not owner: ", async () => {
            await expect(
                nftMTVSTicket.connect(user1).setTreasury(user2.address)
            ).to.be.revertedWith("Ownable: caller is not an owner or admin");
        });
        it("should revert when address equal to zero address: ", async () => {
            await expect(nftMTVSTicket.setTreasury(constants.ZERO_ADDRESS)).to.be.revertedWith(
                "ERROR: invalid address !"
            );
        });
        it("should set treasury success: ", async () => {
            await nftMTVSTicket.setTreasury(treasury.address);
            expect(await nftMTVSTicket.treasury()).to.equal(treasury.address);

            await nftMTVSTicket.setTreasury(user1.address);
            expect(await nftMTVSTicket.treasury()).to.equal(user1.address);

            await nftMTVSTicket.setTreasury(treasury.address);
            expect(await nftMTVSTicket.treasury()).to.equal(treasury.address);
        });
    });

    describe("setPrice function:", async () => {
        it("should revert when Ownable: caller is not an owner or admin:", async () => {
            await expect(nftMTVSTicket.connect(user1).setPrice(1000)).to.be.revertedWith(
                "Ownable: caller is not an owner or admin"
            );
        });
        it("should revert when price equal to zero: ", async () => {
            await expect(nftMTVSTicket.setPrice(0)).to.be.revertedWith(
                "ERROR: amount must be greater than zero !"
            );
        });
        it("should set treasury success: ", async () => {
            let newPrice = 1000000;
            await nftMTVSTicket.setPrice(newPrice);
            expect(await nftMTVSTicket.price()).to.equal(newPrice);
            newPrice = 2000000;
            await nftMTVSTicket.setPrice(newPrice);
            expect(await nftMTVSTicket.price()).to.equal(newPrice);
            newPrice = 3000000;
            await nftMTVSTicket.setPrice(newPrice);
            expect(await nftMTVSTicket.price()).to.equal(newPrice);
        });
    });

    describe("buy function:", async () => {
        it("should buy success: ", async () => {
            await token.mint(user1.address, TOTAL_SUPPLY);

            await token.connect(user1).approve(nftMTVSTicket.address, ethers.constants.MaxUint256);

            await expect(() => nftMTVSTicket.connect(user1).buy()).to.changeTokenBalance(
                token,
                user1,
                -PRICE
            );
            expect(await token.balanceOf(treasury.address)).to.equal(add(TOTAL_SUPPLY, PRICE));
            expect(await nftMTVSTicket.ownerOf(1)).to.equal(user1.address);
            expect(await nftMTVSTicket.balanceOf(user1.address)).to.equal(1);
            expect(await nftMTVSTicket.tokenURI(1)).to.equal(".json");

            expect(await token.balanceOf(user1.address)).to.equal(subtract(TOTAL_SUPPLY, PRICE));
            expect(await token.balanceOf(treasury.address)).to.equal(add(TOTAL_SUPPLY, PRICE));
        });
    });

    describe("mint function:", async () => {
        it("should revert when receiver is zero address: ", async () => {
            await expect(nftMTVSTicket.mint(constants.ZERO_ADDRESS)).to.be.revertedWith(
                "ERROR: invalid address !"
            );
        });
        it("should revert when caller is not owner or admin: ", async () => {
            await expect(nftMTVSTicket.connect(user2).mint(user2.address)).to.be.revertedWith(
                "Ownable: caller is not an owner or admin"
            );
        });
        it("should mint success: ", async () => {
            await token.mint(owner.address, ONE_ETHER);

            await token.connect(owner).approve(nftMTVSTicket.address, ethers.constants.MaxUint256);

            await nftMTVSTicket.mint(user2.address);
            expect(await nftMTVSTicket.balanceOf(user2.address)).to.equal(1);
        });
    });

    describe("supportsInterface function:", async () => {
        it("should supportsInterface: ", async () => {
            let boolVal = await nftMTVSTicket.supportsInterface(0x01ffc9a7);
            expect(boolVal).to.equal(true);

            boolVal = await nftMTVSTicket.supportsInterface(0xffffffff);
            expect(boolVal).to.equal(false);
        });
    });
});
