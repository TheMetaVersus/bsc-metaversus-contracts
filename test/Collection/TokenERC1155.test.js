const { expect } = require("chai");
const { upgrades, ethers } = require("hardhat");
const { constants } = require("@openzeppelin/test-helpers");

describe("TokenERC1155:", () => {
    beforeEach(async () => {
        TOTAL_SUPPLY = ethers.utils.parseEther("1000000000000");
        ONE_ETHER = ethers.utils.parseEther("1");
        MAX_TOTAL_SUPPLY_NFT = 100;
        const accounts = await ethers.getSigners();
        owner = accounts[0];
        user1 = accounts[1];
        user2 = accounts[2];
        user3 = accounts[3];

        Admin = await ethers.getContractFactory("Admin");
        admin = await upgrades.deployProxy(Admin, [owner.address]);

        Treasury = await ethers.getContractFactory("Treasury");
        treasury = await upgrades.deployProxy(Treasury, [admin.address]);

        TokenERC1155 = await ethers.getContractFactory("TokenERC1155");
        tokenERC1155 = await upgrades.deployProxy(TokenERC1155, [
            owner.address,
            "My NFT",
            "M",
            MAX_TOTAL_SUPPLY_NFT,
            treasury.address,
            250]);

        MkpManager = await ethers.getContractFactory("MarketPlaceManager");
        mkpManager = await upgrades.deployProxy(MkpManager, [treasury.address, admin.address]);

        await tokenERC1155.deployed();
    });

    describe("Deployment:", async () => {
        it("Check uri: ", async () => {
            const URI = "this_is_uri_1.json";
            await tokenERC1155.mint(mkpManager.address, 100, URI);

            const newURI = await tokenERC1155.uri(1);

            expect(newURI).to.equal(URI);
        });

        it("Check royalties: ", async () => {
            let royaltiesInfo = await tokenERC1155.royaltyInfo(0, 10000);

            expect(royaltiesInfo[0]).to.equal(treasury.address.toString());
            expect(royaltiesInfo[1].toString()).to.equal("250");
        });
    });

    describe("setURI function:", async () => {
        it("should setURI: ", async () => {
            const URI = "this_is_uri_1.json";
            await tokenERC1155.mint(mkpManager.address, 100, URI);

            const newURI = await tokenERC1155.uri(1);

            expect(newURI).to.equal(URI);
            await tokenERC1155.setURI("new_uri.json", 1);
            expect(await tokenERC1155.uri(1)).to.equal("new_uri.json");
        });
    });

    describe("mint function:", async () => {
        it("should revert when caller is not owner: ", async () => {
            await expect(tokenERC1155.connect(user1).mint(mkpManager.address, 100, "this_uri")).to.be.revertedWith(
                "Caller is not an owner or admin"
            );
        });

        it("should revert when receiver address equal to zero address: ", async () => {
            await expect(tokenERC1155.mint(constants.ZERO_ADDRESS, 100, "this_uri")).to.be.revertedWith(
                "Invalid address"
            );
        });

        it("should revert when amount equal to zero address: ", async () => {
            await expect(tokenERC1155.mint(mkpManager.address, 0, "this_uri")).to.be.revertedWith("Invalid amount");
        });

        it("should revert when exceeding total supply: ", async () => {
            for(let i = 0; i < MAX_TOTAL_SUPPLY_NFT; i++) {
                await tokenERC1155.mint(owner.address, 100, "this_uri");
            }

            await expect(tokenERC1155.mint(mkpManager.address, 100, "this_uri")).to.be.revertedWith(
                "Exceeding the totalSupply"
            );
        });

        it("should mint success: ", async () => {
            await tokenERC1155.mint(mkpManager.address, 100, "this_uri");
            expect(await tokenERC1155.balanceOf(mkpManager.address, 1)).to.equal(100);
        });
    });

    describe("batch mint function:", async () => {
        it("should revert when caller is not owner: ", async () => {
            await expect(
                tokenERC1155
                    .connect(user1)
                    .mintBatch(mkpManager.address, [101, 102, 103], ["this_uri", "this_uri_1", "this_uri_2"])
            ).to.be.revertedWith("Caller is not an owner or admin");
        });

        it("should revert when amount length not equal to uris length: ", async () => {
            await expect(
                tokenERC1155.mintBatch(mkpManager.address, [10, 11, 12, 13], ["this_uri", "this_uri_1", "this_uri_2"])
            ).to.be.revertedWith("Invalid input");
        });

        it("should revert when receiver address equal to zero address: ", async () => {
            await expect(
                tokenERC1155.mintBatch(constants.ZERO_ADDRESS, [10, 11, 12], ["this_uri", "this_uri_1", "this_uri_2"])
            ).to.be.revertedWith("Invalid address");
        });

        it("should revert when amount equal to zero address: ", async () => {
            await expect(
                tokenERC1155.mintBatch(mkpManager.address, [0, 100, 100], ["this_uri", "this_uri_1", "this_uri_2"])
            ).to.be.revertedWith("Invalid amount");
        });

        it("should mint success: ", async () => {
            await tokenERC1155.mintBatch(mkpManager.address, [10, 11, 12], ["this_uri", "this_uri_1", "this_uri_2"]);
            expect(await tokenERC1155.balanceOf(mkpManager.address, 1)).to.equal(10);
            expect(await tokenERC1155.balanceOf(mkpManager.address, 2)).to.equal(11);
            expect(await tokenERC1155.balanceOf(mkpManager.address, 3)).to.equal(12);
        });
    });
});
