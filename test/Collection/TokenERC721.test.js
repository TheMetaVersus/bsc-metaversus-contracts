const { expect } = require("chai");
const { upgrades, ethers } = require("hardhat");
const { constants } = require("@openzeppelin/test-helpers");

describe("TokenERC721:", () => {
    beforeEach(async () => {
        TOTAL_SUPPLY = ethers.utils.parseEther("1000000000000");
        ONE_ETHER = ethers.utils.parseEther("1");
        const accounts = await ethers.getSigners();
        owner = accounts[0];
        user1 = accounts[1];
        user2 = accounts[2];
        user3 = accounts[3];

        Admin = await ethers.getContractFactory("Admin");
        admin = await upgrades.deployProxy(Admin, [owner.address]);

        Treasury = await ethers.getContractFactory("Treasury");
        treasury = await upgrades.deployProxy(Treasury, [admin.address]);

        MkpManager = await ethers.getContractFactory("MarketPlaceManager");
        mkpManager = await upgrades.deployProxy(MkpManager, [treasury.address, admin.address]);

        Token = await ethers.getContractFactory("MTVS");
        token = await upgrades.deployProxy(Token, [
            user1.address,
            "Metaversus Token",
            "MTVS",
            TOTAL_SUPPLY,
            treasury.address,
            admin.address,
        ]);

        TokenERC721 = await ethers.getContractFactory("TokenERC721");
        tokenERC721 = await upgrades.deployProxy(TokenERC721, [
            "My NFT",
            "M",
            TOTAL_SUPPLY,
            treasury.address,
            250,
            admin.address,
        ]);

        await tokenERC721.deployed();
    });

    describe("Deployment:", async () => {
        it("Should revert when invalid admin contract address", async () => {
            await expect(
                upgrades.deployProxy(TokenERC721, [
                    "My NFT",
                    "M",
                    TOTAL_SUPPLY,
                    treasury.address,
                    250,
                    constants.ZERO_ADDRESS,
                ])
            ).to.revertedWith("Invalid Admin contract");
            await expect(
                upgrades.deployProxy(TokenERC721, ["My NFT", "M", TOTAL_SUPPLY, treasury.address, 250, user1.address])
            ).to.revertedWith("Invalid Admin contract");
            await expect(
                upgrades.deployProxy(TokenERC721, [
                    "My NFT",
                    "M",
                    TOTAL_SUPPLY,
                    treasury.address,
                    250,
                    treasury.address,
                ])
            ).to.revertedWith("Invalid Admin contract");
        });

        it("Check name, symbol and default state: ", async () => {
            const name = await tokenERC721.name();
            const symbol = await tokenERC721.symbol();
            expect(name).to.equal("My NFT");
            expect(symbol).to.equal("M");

            let royaltiesInfo = await tokenERC721.royaltyInfo(0, 10000);

            expect(royaltiesInfo[0]).to.equal(treasury.address.toString());
            expect(royaltiesInfo[1].toString()).to.equal("250");
        });

        it("Check tokenURI: ", async () => {
            const URI = "this_is_uri_1.json";
            await tokenERC721.mint(mkpManager.address, URI);

            const newURI = await tokenERC721.tokenURI(1);

            expect(newURI).to.equal(URI);
        });
    });

    describe("tokenURI function:", async () => {
        it("should revert when invalid tokenID params: ", async () => {
            await expect(tokenERC721.tokenURI(2)).to.be.revertedWith(
                "ERC721Metadata: URI query for nonexistent token."
            );
        });
    });

    describe("setTokenURI function:", async () => {
        it("should setTokenURI: ", async () => {
            const URI = "this_is_uri_1.json";
            await tokenERC721.mint(mkpManager.address, URI);

            const newURI = await tokenERC721.tokenURI(1);

            expect(newURI).to.equal(URI);
            await tokenERC721.setTokenURI("new_uri.json", 1);
            expect(await tokenERC721.tokenURI(1)).to.equal("new_uri.json");
        });
    });

    describe("mint function:", async () => {
        it("should revert when aller is not an owner or admin: ", async () => {
            await expect(tokenERC721.connect(user1).mint(mkpManager.address, "this_uri")).to.be.revertedWith(
                "Caller is not an owner or admin"
            );
        });

        it("should revert when receiver address equal to zero address: ", async () => {
            await expect(tokenERC721.mint(constants.ZERO_ADDRESS, "this_uri")).to.be.revertedWith("Invalid address");
        });
        it("should mint success: ", async () => {
            await token.mint(owner.address, ONE_ETHER);

            await token.connect(owner).approve(tokenERC721.address, ethers.constants.MaxUint256);

            await tokenERC721.mint(mkpManager.address, "this_uri");
            expect(await tokenERC721.balanceOf(mkpManager.address)).to.equal(1);
        });
    });

    describe("batch mint function:", async () => {
        it("should revert when aller is not an owner or admin: ", async () => {
            await expect(
                tokenERC721.connect(user1).mintBatch(mkpManager.address, ["this_uri", "this_uri_1", "this_uri_2"])
            ).to.be.revertedWith("Adminable: caller is not an owner or admin");
        });

        it("should revert when receiver address equal to zero address: ", async () => {
            await expect(
                tokenERC721.mintBatch(constants.ZERO_ADDRESS, ["this_uri", "this_uri_1", "this_uri_2"])
            ).to.be.revertedWith("Invalid address");
        });

        it("should revert when amount of tokens is exceeded: ", async () => {
            await token.mint(owner.address, ONE_ETHER);

            await token.connect(owner).approve(tokenERC721.address, ethers.constants.MaxUint256);

            await expect(tokenERC721.mintBatch(mkpManager.address, Array(101).fill("this_uri"))).to.be.revertedWith(
                "Exceeded amount of tokens"
            );
        });

        it("should mint success: ", async () => {
            await token.mint(owner.address, ONE_ETHER);

            await token.connect(owner).approve(tokenERC721.address, ethers.constants.MaxUint256);

            await tokenERC721.mint(mkpManager.address, ["this_uri", "this_uri_1", "this_uri_2"]);
            expect(await tokenERC721.balanceOf(mkpManager.address)).to.equal(1);
        });
    });
});
