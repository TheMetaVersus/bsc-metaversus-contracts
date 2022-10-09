const { expect } = require("chai");
const { upgrades, ethers } = require("hardhat");
const { AddressZero } = ethers.constants;

describe("TokenERC721:", () => {
    beforeEach(async () => {
        TOTAL_SUPPLY = ethers.utils.parseEther("1000000000000");
        MAX_TOTAL_SUPPLY_NFT = 100;
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
        mkpManager = await upgrades.deployProxy(MkpManager, [admin.address]);

        TokenERC721 = await ethers.getContractFactory("TokenERC721");
        tokenERC721 = await upgrades.deployProxy(TokenERC721, [
            owner.address,
            "My NFT",
            "M",
            MAX_TOTAL_SUPPLY_NFT,
            treasury.address,
            250,
        ]);

        await tokenERC721.deployed();
    });

    describe("Deployment:", async () => {
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

        it("Check variable", async () => {
            expect(await tokenERC721.name()).equal("My NFT");
            expect(await tokenERC721.symbol()).equal("M");
            expect(await tokenERC721.factory()).equal(owner.address);
            expect(await tokenERC721.owner()).equal(owner.address);
            expect(await tokenERC721.maxTotalSupply()).equal(100);
            expect(await tokenERC721.maxBatch()).equal(100);
        });
    });

    describe("tokenURI function:", async () => {
        it("should revert when invalid tokenID params: ", async () => {
            await expect(tokenERC721.tokenURI(2)).to.be.revertedWith(
                "URI query for nonexistent token"
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

    describe("setMaxBatch", async () => {
        it("Should revert when invalid admin contract address", async () => {
            await expect(tokenERC721.connect(user1).setMaxBatch(50)).to.revertedWith(
                "Caller is not an owner or admin"
            );
        });

        it("Should revert Invalid maxBatch", async () => {
            await expect(tokenERC721.setMaxBatch(0)).to.revertedWith("Invalid maxBatch");
        });

        it("Should setMaxBatch successfully", async () => {
            await tokenERC721.setMaxBatch(50);
            let maxBatch = await tokenERC721.maxBatch();
            expect(maxBatch).equal(50);

            await tokenERC721.setAdmin(user1.address, true);
            await tokenERC721.connect(user1).setMaxBatch(100);
            maxBatch = await tokenERC721.maxBatch();
            expect(maxBatch).equal(100);
        });
    });

    describe("setAdminByFactory", async () => {
        it("Should revert when invalid admin contract address", async () => {
            await expect(tokenERC721.connect(user1).setAdminByFactory(user1.address, true)).to.revertedWith(
                "Caller is not the factory"
            );
        });

        it("Should revert Invalid address", async () => {
            await expect(tokenERC721.setAdminByFactory(AddressZero, true)).to.revertedWith("Invalid address");
        });

        it("Should setAdminByFactory successfully", async () => {
            await tokenERC721.setAdminByFactory(user1.address, true);
            let isAdmin = await tokenERC721.isAdmin(user1.address);
            expect(isAdmin).to.be.true;

            await tokenERC721.setAdminByFactory(user1.address, false);
            isAdmin = await tokenERC721.isAdmin(user1.address);
            expect(isAdmin).to.be.false;
        });
    });

    describe("setAdmin", async () => {
        it("Should revert when invalid admin contract address", async () => {
            await expect(tokenERC721.connect(user1).setAdmin(user1.address, true)).to.revertedWith(
                "Ownable: caller is not the owner"
            );
        });

        it("Should revert Invalid maxBatch", async () => {
            await expect(tokenERC721.setAdmin(AddressZero, true)).to.revertedWith("Invalid address");
        });

        it("Should setAdmin successfully", async () => {
            await tokenERC721.setAdmin(user1.address, true);

            let isAdmin = await tokenERC721.isAdmin(user1.address);
            expect(isAdmin).to.be.true;

            await tokenERC721.setMaxBatch(50);
            let maxBatch = await tokenERC721.maxBatch();
            expect(maxBatch).equal(50);
        });
    });

    describe("mint function:", async () => {
        it("should revert when caller is not an owner or admin: ", async () => {
            await expect(tokenERC721.connect(user1).mint(mkpManager.address, "this_uri")).to.be.revertedWith(
                "Caller is not an owner or admin"
            );
        });

        it("should revert when exceeding total supply: ", async () => {
            for (let i = 0; i < MAX_TOTAL_SUPPLY_NFT; i++) {
                await tokenERC721.mint(owner.address, "this_uri");
            }

            await expect(tokenERC721.mint(mkpManager.address, "this_uri")).to.be.revertedWith(
                "Exceeding the totalSupply"
            );
        });

        it("should revert when receiver address equal to zero address: ", async () => {
            await expect(tokenERC721.mint(AddressZero, "this_uri")).to.be.revertedWith("Invalid address");
        });

        it("should mint success: ", async () => {
            await tokenERC721.mint(mkpManager.address, "this_uri");
            expect(await tokenERC721.balanceOf(mkpManager.address)).to.equal(1);
        });
    });

    describe("batch mint function:", async () => {
        it("should revert when aller is not an owner or admin: ", async () => {
            await expect(tokenERC721.connect(user1).mintBatch(mkpManager.address, 3)).to.be.revertedWith(
                "Caller is not an owner or admin"
            );
        });

        it("should revert when receiver address equal to zero address: ", async () => {
            await expect(tokenERC721.mintBatch(AddressZero, 3)).to.be.revertedWith("Invalid address");
        });

        it("should revert when mint fewer in each batch: ", async () => {
            await expect(tokenERC721.mintBatch(mkpManager.address, 0)).to.be.revertedWith(
                "Must mint fewer in each batch"
            );

            const max_batch = await tokenERC721.maxBatch();

            await expect(tokenERC721.mintBatch(mkpManager.address, max_batch.add(1))).to.be.revertedWith(
                "Must mint fewer in each batch"
            );
        });

        it("should revert when exceeding total supply: ", async () => {
            for (let i = 0; i < MAX_TOTAL_SUPPLY_NFT; i++) {
                await tokenERC721.mint(owner.address, "this_uri");
            }

            await expect(tokenERC721.mintBatch(mkpManager.address, 1)).to.be.revertedWith("Exceeding the totalSupply");
        });

        it("should mint success: ", async () => {
            await tokenERC721.mintBatch(mkpManager.address, 3);
            expect(await tokenERC721.balanceOf(mkpManager.address)).to.equal(3);
        });
    });

    describe("batch mint with uri function:", async () => {
        it("should revert when aller is not an owner or admin: ", async () => {
            await expect(
                tokenERC721
                    .connect(user1)
                    .mintBatchWithUri(mkpManager.address, ["this_uri", "this_uri_1", "this_uri_2"])
            ).to.be.revertedWith("Caller is not an owner or admin");
        });

        it("should revert when receiver address equal to zero address: ", async () => {
            await expect(
                tokenERC721.mintBatchWithUri(AddressZero, ["this_uri", "this_uri_1", "this_uri_2"])
            ).to.be.revertedWith("Invalid address");
        });

        it("should revert when mint fewer in each batch: ", async () => {
            const max_batch = await tokenERC721.maxBatch();

            await expect(
                tokenERC721.mintBatchWithUri(mkpManager.address, Array(Number(max_batch.add(1))).fill("this_uri"))
            ).to.be.revertedWith("Must mint fewer in each batch");
        });

        it("should revert when amount of tokens is exceeded: ", async () => {
            const max_batch = await tokenERC721.maxBatch();
            await tokenERC721.mintBatchWithUri(mkpManager.address, Array(Number(max_batch)).fill("this_uri"));

            await expect(tokenERC721.mintBatchWithUri(mkpManager.address, ["this_uri"])).to.be.revertedWith(
                "Exceeding the totalSupply"
            );
        });

        it("should mint success: ", async () => {
            await expect(() =>
                tokenERC721.mintBatchWithUri(user1.address, ["this_uri", "this_uri_1", "this_uri_2"])
            ).to.changeTokenBalance(tokenERC721, user1, 3);
        });
    });
});
