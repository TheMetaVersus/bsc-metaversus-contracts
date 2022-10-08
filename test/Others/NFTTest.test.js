const { expect } = require("chai");
const { upgrades, ethers } = require("hardhat");
const { multiply } = require("js-big-decimal");

describe("NftTest:", () => {
    beforeEach(async () => {
        TOTAL_SUPPLY = ethers.utils.parseEther("1000000000000");
        ONE_ETHER = ethers.utils.parseEther("1");
        PRICE = ethers.utils.parseEther("2");
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
            treasury.address,
            admin.address,
        ]);

        NftTest = await ethers.getContractFactory("NftTest");
        nftTest = await upgrades.deployProxy(NftTest, [
            "NFT test",
            "NFT",
            token.address,
            treasury.address,
            250,
            PRICE,
            admin.address,
        ]);

        MkpManager = await ethers.getContractFactory("MarketPlaceManager");
        mkpManager = await upgrades.deployProxy(MkpManager, [treasury.address, admin.address]);
    });

    describe("Deployment:", async () => {
        it("Check name, symbol and default state: ", async () => {
            const name = await nftTest.name();
            const symbol = await nftTest.symbol();
            expect(name).to.equal("NFT test");
            expect(symbol).to.equal("NFT");

            let royaltiesInfo = await nftTest.royaltyInfo(0, 10000);

            expect(royaltiesInfo[0]).to.equal(treasury.address.toString());
            expect(royaltiesInfo[1].toString()).to.equal("250");
        });
        it("Check tokenURI: ", async () => {
            const URI = "this_is_uri_1.json";
            await token.mint(owner.address, multiply(100, ONE_ETHER));
            await token.connect(owner).approve(nftTest.address, ethers.constants.MaxUint256);
            await nftTest.buy(URI);

            const newURI = await nftTest.tokenURI(1);

            expect(newURI).to.equal(URI);
        });
    });

    describe("tokenURI function:", async () => {
        it("should revert when invalid tokenID params: ", async () => {
            await expect(nftTest.tokenURI(2)).to.be.revertedWith("ERC721Metadata: URI query for nonexistent token.");
        });
    });

    describe("setTokenURI function:", async () => {
        it("should setTokenURI: ", async () => {
            const URI = "this_is_uri_1.json";
            await token.mint(owner.address, multiply(100, ONE_ETHER));
            await token.connect(owner).approve(nftTest.address, ethers.constants.MaxUint256);

            await nftTest.buy(URI);

            const newURI = await nftTest.tokenURI(1);

            expect(newURI).to.equal(URI);
            await nftTest.setTokenURI("new_uri.json", 1);
            expect(await nftTest.tokenURI(1)).to.equal("new_uri.json");
        });
    });

    describe("setTreasury function:", async () => {
        it("should revert when caller is not owner: ", async () => {
            await expect(nftTest.connect(user1).setTreasury(user2.address)).to.be.revertedWith(
                "Caller is not an owner or admin"
            );
        });

        it("should set treasury success: ", async () => {
            await nftTest.setTreasury(treasury.address);
            expect(await nftTest.treasury()).to.equal(treasury.address);

            await nftTest.setTreasury(treasury.address);
            expect(await nftTest.treasury()).to.equal(treasury.address);
        });
    });

    describe("buy function:", async () => {
        it("should buy success: ", async () => {
            await token.mint(owner.address, multiply(100, ONE_ETHER));

            await token.connect(owner).approve(nftTest.address, ethers.constants.MaxUint256);

            await nftTest.buy("this_uri");
            expect(await nftTest.balanceOf(owner.address)).to.equal(1);
        });
    });
});
