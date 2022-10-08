const { expect } = require("chai");
const { upgrades, ethers } = require("hardhat");
const { AddressZero } = ethers.constants;

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
            250,
        ]);

        MkpManager = await ethers.getContractFactory("MarketPlaceManager");
        mkpManager = await upgrades.deployProxy(MkpManager, [admin.address]);

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

        it("Check variable", async () => {
            expect(await tokenERC1155.name()).equal("My NFT");
            expect(await tokenERC1155.symbol()).equal("M");
            expect(await tokenERC1155.factory()).equal(owner.address);
            expect(await tokenERC1155.owner()).equal(owner.address);
            expect(await tokenERC1155.maxTotalSupply()).equal(100);
            expect(await tokenERC1155.maxBatch()).equal(100);
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

    describe("setMaxBatch", async () => {
        it("Should revert when invalid admin contract address", async () => {
            await expect(tokenERC1155.connect(user1).setMaxBatch(50)).to.revertedWith(
                "Caller is not an owner or admin"
            );
        });

        it("Should revert Invalid maxBatch", async () => {
            await expect(tokenERC1155.setMaxBatch(0)).to.revertedWith("Invalid maxBatch");
        });

        it("Should setMaxBatch successfully", async () => {
            await tokenERC1155.setMaxBatch(50);
            let maxBatch = await tokenERC1155.maxBatch();
            expect(maxBatch).equal(50);

            await tokenERC1155.setAdmin(user1.address, true);
            await tokenERC1155.connect(user1).setMaxBatch(100);
            maxBatch = await tokenERC1155.maxBatch();
            expect(maxBatch).equal(100);
        });
    });

    describe("setAdminByFactory", async () => {
        it("Should revert when invalid admin contract address", async () => {
            await expect(tokenERC1155.connect(user1).setAdminByFactory(user1.address, true)).to.revertedWith(
                "Caller is not the factory"
            );
        });

        it("Should revert Invalid address", async () => {
            await expect(tokenERC1155.setAdminByFactory(AddressZero, true)).to.revertedWith("Invalid address");
        });

        it("Should setAdminByFactory successfully", async () => {
            await tokenERC1155.setAdminByFactory(user1.address, true);
            let isAdmin = await tokenERC1155.isAdmin(user1.address);
            expect(isAdmin).to.be.true;

            await tokenERC1155.setAdminByFactory(user1.address, false);
            isAdmin = await tokenERC1155.isAdmin(user1.address);
            expect(isAdmin).to.be.false;
        });
    });

    describe("setAdmin", async () => {
        it("Should revert when invalid admin contract address", async () => {
            await expect(tokenERC1155.connect(user1).setAdmin(user1.address, true)).to.revertedWith(
                "Ownable: caller is not the owner"
            );
        });

        it("Should revert Invalid maxBatch", async () => {
            await expect(tokenERC1155.setAdmin(AddressZero, true)).to.revertedWith("Invalid address");
        });

        it("Should setAdmin successfully", async () => {
            await tokenERC1155.setAdmin(user1.address, true);

            let isAdmin = await tokenERC1155.isAdmin(user1.address);
            expect(isAdmin).to.be.true;

            await tokenERC1155.setMaxBatch(50);
            let maxBatch = await tokenERC1155.maxBatch();
            expect(maxBatch).equal(50);
        });
    });

    describe("mint function:", async () => {
        it("should revert when caller is not owner: ", async () => {
            await expect(tokenERC1155.connect(user1).mint(mkpManager.address, 100, "this_uri")).to.be.revertedWith(
                "Caller is not an owner or admin"
            );
        });

        it("should revert when receiver address equal to zero address: ", async () => {
            await expect(tokenERC1155.mint(AddressZero, 100, "this_uri")).to.be.revertedWith("Invalid address");
        });

        it("should revert when amount equal to zero address: ", async () => {
            await expect(tokenERC1155.mint(mkpManager.address, 0, "this_uri")).to.be.revertedWith("Invalid amount");
        });

        it("should revert when exceeding total supply: ", async () => {
            for (let i = 0; i < MAX_TOTAL_SUPPLY_NFT; i++) {
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
                tokenERC1155.mintBatch(AddressZero, [10, 11, 12], ["this_uri", "this_uri_1", "this_uri_2"])
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
