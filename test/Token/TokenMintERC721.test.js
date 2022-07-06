const { expect } = require("chai");
const { upgrades, ethers } = require("hardhat");
const { constants } = require("@openzeppelin/test-helpers");
const { add } = require("js-big-decimal");
describe("TokenMintERC721:", () => {
    beforeEach(async () => {
        TOTAL_SUPPLY = "1000000000000000000000000000000";
        ONE_ETHER = "1000000000000000000";
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

        TokenMintERC721 = await ethers.getContractFactory("TokenMintERC721");
        tokenMintERC721 = await upgrades.deployProxy(TokenMintERC721, [
            owner.address,
            "NFT Metaversus",
            "nMTVS",
            token.address,
            treasury.address,
            250,
            PRICE,
        ]);

        MkpManager = await ethers.getContractFactory("MarketPlaceManager");
        mkpManager = await upgrades.deployProxy(MkpManager, [
            owner.address,
            token.address,
            treasury.address,
        ]);

        await tokenMintERC721.deployed();
    });

    describe("Deployment:", async () => {
        it("Check name, symbol and default state: ", async () => {
            const name = await tokenMintERC721.name();
            const symbol = await tokenMintERC721.symbol();
            const price = await tokenMintERC721.price();
            expect(name).to.equal("NFT Metaversus");
            expect(symbol).to.equal("nMTVS");
            expect(price).to.equal(PRICE);

            let royaltiesInfo = await tokenMintERC721.royaltyInfo(0, 10000);

            expect(royaltiesInfo[0]).to.equal(treasury.address.toString());
            expect(royaltiesInfo[1].toString()).to.equal("250");
        });
        it("Check tokenURI: ", async () => {
            const URI = "this_is_uri_1";
            await tokenMintERC721.mint(user1.address, mkpManager.address, URI);

            const newURI = await tokenMintERC721.tokenURI(1);

            expect(newURI).to.equal(URI + ".json");
        });
        it("Check Owner: ", async () => {
            const ownerAddress = await tokenMintERC721.owner();
            expect(ownerAddress).to.equal(owner.address);
        });
    });

    describe("setAdmin function:", async () => {
        it("should revert when caller is not owner: ", async () => {
            await expect(
                tokenMintERC721.connect(user1).setAdmin(user2.address, true)
            ).to.be.revertedWith("Ownable: caller is not the owner");
        });
        it("should set admin success: ", async () => {
            await tokenMintERC721.setAdmin(user2.address, true);
            expect(await tokenMintERC721.isAdmin(user2.address)).to.equal(true);

            await tokenMintERC721.setAdmin(user1.address, false);
            expect(await tokenMintERC721.isAdmin(user1.address)).to.equal(false);

            await tokenMintERC721.setAdmin(user2.address, false);
            expect(await tokenMintERC721.isAdmin(user2.address)).to.equal(false);
        });
    });

    describe("setTreasury function:", async () => {
        it("should revert when caller is not owner: ", async () => {
            await expect(
                tokenMintERC721.connect(user1).setTreasury(user2.address)
            ).to.be.revertedWith("Ownable: caller is not an owner or admin");
        });
        it("should revert when price equal to zero: ", async () => {
            await expect(tokenMintERC721.setPrice(0)).to.be.revertedWith(
                "ERROR: amount must be greater than zero !"
            );
        });
        it("should set treasury success: ", async () => {
            await tokenMintERC721.setTreasury(treasury.address);
            expect(await tokenMintERC721.treasury()).to.equal(treasury.address);

            await tokenMintERC721.setTreasury(user1.address);
            expect(await tokenMintERC721.treasury()).to.equal(user1.address);

            await tokenMintERC721.setTreasury(treasury.address);
            expect(await tokenMintERC721.treasury()).to.equal(treasury.address);
        });
    });

    describe("buy function:", async () => {
        it("should buy success: ", async () => {
            await token.mint(user1.address, TOTAL_SUPPLY);
            await token
                .connect(user1)
                .approve(tokenMintERC721.address, ethers.constants.MaxUint256);

            await expect(() =>
                tokenMintERC721.connect(user1).buy("this_uri")
            ).to.changeTokenBalance(token, user1, -PRICE);
            expect(await token.balanceOf(treasury.address)).to.equal(add(TOTAL_SUPPLY, PRICE));

            expect(await tokenMintERC721.balanceOf(user1.address)).to.equal(1);
            expect(await tokenMintERC721.tokenURI(1)).to.equal("this_uri" + ".json");
        });
    });
    describe("setPrice function:", async () => {
        it("should revert when newPrice equal to zero: ", async () => {
            await expect(tokenMintERC721.connect(user1).setPrice(1000)).to.be.revertedWith(
                "Ownable: caller is not an owner or admin"
            );
        });
        it("should revert when price equal to zero: ", async () => {
            await expect(tokenMintERC721.setPrice(0)).to.be.revertedWith(
                "ERROR: amount must be greater than zero !"
            );
        });
        it("should set treasury success: ", async () => {
            let newPrice = 1000000;
            await tokenMintERC721.setPrice(newPrice);
            expect(await tokenMintERC721.price()).to.equal(newPrice);
            newPrice = 2000000;
            await tokenMintERC721.setPrice(newPrice);
            expect(await tokenMintERC721.price()).to.equal(newPrice);
            newPrice = 3000000;
            await tokenMintERC721.setPrice(newPrice);
            expect(await tokenMintERC721.price()).to.equal(newPrice);
        });
    });

    describe("mint function:", async () => {
        it("should revert when newPrice equal to zero: ", async () => {
            await expect(
                tokenMintERC721.connect(user1).mint(owner.address, mkpManager.address, "this_uri")
            ).to.be.revertedWith("Ownable: caller is not an owner or admin");
        });
        it("should revert when seller address equal to zero address: ", async () => {
            await expect(
                tokenMintERC721.mint(constants.ZERO_ADDRESS, mkpManager.address, "this_uri")
            ).to.be.revertedWith("ERROR: Invalid address !");
        });
        it("should revert when receiver address equal to zero address: ", async () => {
            await expect(
                tokenMintERC721.mint(owner.address, constants.ZERO_ADDRESS, "this_uri")
            ).to.be.revertedWith("ERROR: Invalid address !");
        });
        it("should mint success: ", async () => {
            await token.mint(owner.address, ONE_ETHER);

            await token
                .connect(owner)
                .approve(tokenMintERC721.address, ethers.constants.MaxUint256);

            await tokenMintERC721.mint(user2.address, mkpManager.address, "this_uri");
            expect(await tokenMintERC721.balanceOf(mkpManager.address)).to.equal(1);
        });
    });
});
