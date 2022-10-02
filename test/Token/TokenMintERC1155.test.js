const { expect } = require("chai");
const { upgrades, ethers } = require("hardhat");
const { constants } = require("@openzeppelin/test-helpers");

describe("TokenMintERC1155:", () => {
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

        await tokenMintERC1155.deployed();
    });

    describe("Deployment:", async () => {
        it("Should revert when invalid admin contract address", async () => {
            await expect(
                upgrades.deployProxy(TokenMintERC1155, [treasury.address, 250, constants.ZERO_ADDRESS])
            ).to.revertedWith("Invalid Admin contract");
            await expect(
                upgrades.deployProxy(TokenMintERC1155, [treasury.address, 250, user1.address])
            ).to.revertedWith("Invalid Admin contract");
            await expect(
                upgrades.deployProxy(TokenMintERC1155, [treasury.address, 250, treasury.address])
            ).to.revertedWith("Invalid Admin contract");
        });

        it("Check uri: ", async () => {
            const URI = "this_is_uri_1.json";
            await tokenMintERC1155.mint(mkpManager.address, 100, URI);

            const newURI = await tokenMintERC1155.uri(1);

            expect(newURI).to.equal(URI);
        });

        it("Check royalties: ", async () => {
            let royaltiesInfo = await tokenMintERC1155.royaltyInfo(0, 10000);

            expect(royaltiesInfo[0]).to.equal(treasury.address.toString());
            expect(royaltiesInfo[1].toString()).to.equal("250");
        });
    });

    describe("setAdmin function:", async () => {
        it("should revert when caller is not owner: ", async () => {
            await expect(tokenMintERC1155.connect(user1).setAdmin(user2.address, true)).to.be.revertedWith(
                "Ownable: caller is not the owner"
            );
        });
        it("should set admin success: ", async () => {
            await tokenMintERC1155.setAdmin(user2.address, true);
            expect(await tokenMintERC1155.isAdmin(user2.address)).to.equal(true);

            await tokenMintERC1155.setAdmin(user1.address, false);
            expect(await tokenMintERC1155.isAdmin(user1.address)).to.equal(false);

            await tokenMintERC1155.setAdmin(user2.address, false);
            expect(await tokenMintERC1155.isAdmin(user2.address)).to.equal(false);
        });
    });

    describe("setURI function:", async () => {
        it("should setURI: ", async () => {
            const URI = "this_is_uri_1.json";
            await tokenMintERC1155.mint(mkpManager.address, 100, URI);

            const newURI = await tokenMintERC1155.uri(1);

            expect(newURI).to.equal(URI);
            await tokenMintERC1155.setURI("new_uri.json", 1);
            expect(await tokenMintERC1155.uri(1)).to.equal("new_uri.json");
        });
    });

    describe("setTreasury function:", async () => {
        it("should revert when caller is not owner: ", async () => {
            await expect(tokenMintERC1155.connect(user1).setTreasury(user2.address)).to.be.revertedWith(
                "Adminable: caller is not an owner or admin"
            );
        });
        it("should revert when address equal to zero address: ", async () => {
            await expect(tokenMintERC1155.setTreasury(constants.ZERO_ADDRESS)).to.be.revertedWith(
                "ERROR: invalid address !"
            );
        });
        it("should set treasury success: ", async () => {
            await tokenMintERC1155.setTreasury(treasury.address);
            expect(await tokenMintERC1155.treasury()).to.equal(treasury.address);

            await tokenMintERC1155.setTreasury(user1.address);
            expect(await tokenMintERC1155.treasury()).to.equal(user1.address);

            await tokenMintERC1155.setTreasury(treasury.address);
            expect(await tokenMintERC1155.treasury()).to.equal(treasury.address);
        });
    });

    describe("mint function:", async () => {
        it("should revert when caller is not owner: ", async () => {
            await expect(tokenMintERC1155.connect(user1).mint(mkpManager.address, 100, "this_uri")).to.be.revertedWith(
                "Adminable: caller is not an owner or admin"
            );
        });
        it("should revert when receiver address equal to zero address: ", async () => {
            await expect(tokenMintERC1155.mint(constants.ZERO_ADDRESS, 100, "this_uri")).to.be.revertedWith(
                "ERROR: invalid address !"
            );
        });
        it("should revert when amount equal to zero address: ", async () => {
            await expect(tokenMintERC1155.mint(mkpManager.address, 0, "this_uri")).to.be.revertedWith("Invalid amount");
        });
        it("should mint success: ", async () => {
            await token.mint(owner.address, ONE_ETHER);

            await token.connect(owner).approve(tokenMintERC1155.address, ethers.constants.MaxUint256);

            await tokenMintERC1155.mint(mkpManager.address, 100, "this_uri");
            expect(await tokenMintERC1155.balanceOf(mkpManager.address, 1)).to.equal(100);
        });
    });

    describe("batch mint function:", async () => {
        it("should revert when caller is not owner: ", async () => {
            await expect(
                tokenMintERC1155
                    .connect(user1)
                    .mintBatch(mkpManager.address, [101, 102, 103], ["this_uri", "this_uri_1", "this_uri_2"])
            ).to.be.revertedWith("Adminable: caller is not an owner or admin");
        });

        it("should revert when amount length not equal to uris length: ", async () => {
            await expect(
                tokenMintERC1155.mintBatch(
                    mkpManager.address,
                    [10, 11, 12, 13],
                    ["this_uri", "this_uri_1", "this_uri_2"]
                )
            ).to.be.revertedWith("Invalid length");
        });

        it("should revert when receiver address equal to zero address: ", async () => {
            await expect(
                tokenMintERC1155.mintBatch(
                    constants.ZERO_ADDRESS,
                    [10, 11, 12],
                    ["this_uri", "this_uri_1", "this_uri_2"]
                )
            ).to.be.revertedWith("ERROR: invalid address !");
        });

        it("should revert when amount equal to zero address: ", async () => {
            await expect(
                tokenMintERC1155.mintBatch(mkpManager.address, [0, 100, 100], ["this_uri", "this_uri_1", "this_uri_2"])
            ).to.be.revertedWith("Invalid amount");
        });

        it("should mint success: ", async () => {
            await token.mint(owner.address, ONE_ETHER);

            await token.connect(owner).approve(tokenMintERC1155.address, ethers.constants.MaxUint256);

            await tokenMintERC1155.mintBatch(
                mkpManager.address,
                [10, 11, 12],
                ["this_uri", "this_uri_1", "this_uri_2"]
            );
            expect(await tokenMintERC1155.balanceOf(mkpManager.address, 1)).to.equal(10);
            expect(await tokenMintERC1155.balanceOf(mkpManager.address, 2)).to.equal(11);
            expect(await tokenMintERC1155.balanceOf(mkpManager.address, 3)).to.equal(12);
        });
    });
});
