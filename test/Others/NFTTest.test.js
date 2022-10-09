const { expect } = require("chai");
const { upgrades, ethers } = require("hardhat");

const TOTAL_SUPPLY = ethers.utils.parseEther("1000000000000");
const ETHER_100 = ethers.utils.parseEther("100");
const PRICE = ethers.utils.parseEther("2");

describe("NftTest:", () => {
    beforeEach(async () => {
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
            "Metaversus Token",
            "MTVS",
            TOTAL_SUPPLY,
            owner.address,
        ]);

        NftTest = await ethers.getContractFactory("NftTest");
        nftTest = await upgrades.deployProxy(NftTest, [
            "NFT Test",
            "TEST",
            token.address,
            250,
            PRICE,
            admin.address
        ]);

        MkpManager = await ethers.getContractFactory("MarketPlaceManager");
        mkpManager = await upgrades.deployProxy(MkpManager, [admin.address]);

        await nftTest.deployed();
    });

    describe("Deployment:", async () => {
        it("Check name, symbol and default state: ", async () => {
            const name = await nftTest.name();
            const symbol = await nftTest.symbol();
            expect(name).to.equal("NFT Test");
            expect(symbol).to.equal("TEST");

            let royaltiesInfo = await nftTest.royaltyInfo(0, 10000);

            expect(royaltiesInfo[0]).to.equal(treasury.address);
            expect(royaltiesInfo[1]).to.equal(250);
        });

        it("Check tokenURI: ", async () => {
            const URI = "this_is_uri_1.json";
            await token.approve(nftTest.address, ethers.constants.MaxUint256);
            await nftTest.buy(URI);

            const newURI = await nftTest.tokenURI(1);

            expect(newURI).to.equal(URI);
        });
    });

    describe("tokenURI function:", async () => {
        it("should revert when invalid tokenID params: ", async () => {
            await expect(nftTest.tokenURI(2)).to.be.revertedWith("URI query for nonexistent token");
        });
    });

    describe("setTokenURI function:", async () => {
        it("should setTokenURI: ", async () => {
            const URI = "this_is_uri_1.json";
            await token.connect(owner).approve(nftTest.address, ethers.constants.MaxUint256);

            await nftTest.buy(URI);

            const newURI = await nftTest.tokenURI(1);

            expect(newURI).to.equal(URI);
            await nftTest.setTokenURI("new_uri.json", 1);
            expect(await nftTest.tokenURI(1)).to.equal("new_uri.json");
        });
    });

    describe("buy function:", async () => {
        it("should buy success: ", async () => {
            await token.approve(nftTest.address, ethers.constants.MaxUint256);

            await nftTest.buy("this_uri");
            expect(await nftTest.balanceOf(owner.address)).to.equal(1);
        });
    });
});
