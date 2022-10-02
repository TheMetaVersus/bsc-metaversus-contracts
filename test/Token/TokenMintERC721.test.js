const { expect } = require("chai");
const { upgrades, ethers } = require("hardhat");
const { constants } = require("@openzeppelin/test-helpers");

describe("TokenMintERC721:", () => {
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

        Token = await ethers.getContractFactory("MTVS");
        token = await upgrades.deployProxy(Token, [
            user1.address,
            "Metaversus Token",
            "MTVS",
            TOTAL_SUPPLY,
            treasury.address,
            admin.address,
        ]);

        TokenMintERC721 = await ethers.getContractFactory("TokenMintERC721");
        tokenMintERC721 = await upgrades.deployProxy(TokenMintERC721, [
            "NFT Metaversus",
            "nMTVS",
            treasury.address,
            250,
            admin.address,
        ]);

        TokenMintERC1155 = await ethers.getContractFactory("TokenMintERC1155");
        tokenMintERC1155 = await upgrades.deployProxy(TokenMintERC1155, [treasury.address, 250, admin.address]);

        MkpManager = await ethers.getContractFactory("MarketPlaceManager");
        mkpManager = await upgrades.deployProxy(MkpManager, [treasury.address, admin.address]);

        await tokenMintERC721.deployed();
    });

    describe("Deployment:", async () => {
        it("Should revert when invalid admin contract address", async () => {
            await expect(
                upgrades.deployProxy(TokenMintERC721, [
                    "NFT Metaversus",
                    "nMTVS",
                    treasury.address,
                    250,
                    constants.ZERO_ADDRESS,
                ])
            ).to.revertedWith("Invalid Admin contract");
            await expect(
                upgrades.deployProxy(TokenMintERC721, ["NFT Metaversus", "nMTVS", treasury.address, 250, user1.address])
            ).to.revertedWith("Invalid Admin contract");
            await expect(
                upgrades.deployProxy(TokenMintERC721, [
                    "NFT Metaversus",
                    "nMTVS",
                    treasury.address,
                    250,
                    treasury.address,
                ])
            ).to.revertedWith("Invalid Admin contract");
        });

        it("Check name, symbol and default state: ", async () => {
            const name = await tokenMintERC721.name();
            const symbol = await tokenMintERC721.symbol();
            expect(name).to.equal("NFT Metaversus");
            expect(symbol).to.equal("nMTVS");

            let royaltiesInfo = await tokenMintERC721.royaltyInfo(0, 10000);

            expect(royaltiesInfo[0]).to.equal(treasury.address.toString());
            expect(royaltiesInfo[1].toString()).to.equal("250");
        });

        it("Check tokenURI: ", async () => {
            const URI = "this_is_uri_1.json";
            await tokenMintERC721.mint(mkpManager.address, URI);

            const newURI = await tokenMintERC721.tokenURI(1);

            expect(newURI).to.equal(URI);
        });
    });

    describe("tokenURI function:", async () => {
        it("should revert when invalid tokenID params: ", async () => {
            await expect(tokenMintERC721.tokenURI(2)).to.be.revertedWith(
                "ERC721Metadata: URI query for nonexistent token."
            );
        });
    });

    describe("setTokenURI function:", async () => {
        it("should setTokenURI: ", async () => {
            const URI = "this_is_uri_1.json";
            await tokenMintERC721.mint(mkpManager.address, URI);

            const newURI = await tokenMintERC721.tokenURI(1);

            expect(newURI).to.equal(URI);
            await tokenMintERC721.setTokenURI("new_uri.json", 1);
            expect(await tokenMintERC721.tokenURI(1)).to.equal("new_uri.json");
        });
    });

    describe("setTreasury function:", async () => {
        it("should revert when caller is not owner: ", async () => {
            await expect(tokenMintERC721.connect(user1).setTreasury(user2.address)).to.be.revertedWith(
                "Adminable: caller is not an owner or admin"
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

    describe("mint function:", async () => {
        it("should revert when aller is not an owner or admin: ", async () => {
            await expect(tokenMintERC721.connect(user1).mint(mkpManager.address, "this_uri")).to.be.revertedWith(
                "Adminable: caller is not an owner or admin"
            );
        });

        it("should revert when receiver address equal to zero address: ", async () => {
            await expect(tokenMintERC721.mint(constants.ZERO_ADDRESS, "this_uri")).to.be.revertedWith(
                "ERROR: invalid address !"
            );
        });
        it("should mint success: ", async () => {
            await token.mint(owner.address, ONE_ETHER);

            await token.connect(owner).approve(tokenMintERC721.address, ethers.constants.MaxUint256);

            await tokenMintERC721.mint(mkpManager.address, "this_uri");
            expect(await tokenMintERC721.balanceOf(mkpManager.address)).to.equal(1);
        });
    });

    describe("batch mint function:", async () => {
        it("should revert when aller is not an owner or admin: ", async () => {
            await expect(
                tokenMintERC721.connect(user1).batchMint(mkpManager.address, ["this_uri", "this_uri_1", "this_uri_2"])
            ).to.be.revertedWith("Adminable: caller is not an owner or admin");
        });

        it("should revert when receiver address equal to zero address: ", async () => {
            await expect(
                tokenMintERC721.batchMint(constants.ZERO_ADDRESS, ["this_uri", "this_uri_1", "this_uri_2"])
            ).to.be.revertedWith("ERROR: invalid address !");
        });

        it("should revert when amount of tokens is exceeded: ", async () => {
            await token.mint(owner.address, ONE_ETHER);

            await token.connect(owner).approve(tokenMintERC721.address, ethers.constants.MaxUint256);

            await expect(tokenMintERC721.batchMint(mkpManager.address, Array(101).fill("this_uri"))).to.be.revertedWith(
                "Exceeded amount of tokens"
            );
        });

        it("should mint success: ", async () => {
            await token.mint(owner.address, ONE_ETHER);

            await token.connect(owner).approve(tokenMintERC721.address, ethers.constants.MaxUint256);

            await tokenMintERC721.mint(mkpManager.address, ["this_uri", "this_uri_1", "this_uri_2"]);
            expect(await tokenMintERC721.balanceOf(mkpManager.address)).to.equal(1);
        });
    });
});
