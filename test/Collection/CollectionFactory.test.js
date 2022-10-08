const { expect } = require("chai");
const { upgrades } = require("hardhat");
const { AddressZero } = ethers.constants;

describe("CollectionFactory", () => {
    beforeEach(async () => {
        const accounts = await ethers.getSigners();
        owner = accounts[0];
        user1 = accounts[1];
        user2 = accounts[2];
        user3 = accounts[3];
        treasury = accounts[4];

        TokenERC721 = await ethers.getContractFactory("TokenERC721");
        tokenERC721 = await TokenERC721.deploy();

        TokenERC1155 = await ethers.getContractFactory("TokenERC1155");
        tokenERC1155 = await TokenERC1155.deploy();

        Admin = await ethers.getContractFactory("Admin");
        admin = await upgrades.deployProxy(Admin, [owner.address]);

        CollectionFactory = await ethers.getContractFactory("CollectionFactory");
        collectionFactory = await upgrades.deployProxy(CollectionFactory, [
            tokenERC721.address,
            tokenERC1155.address,
            admin.address,
            user1.address,
            user2.address,
        ]);
    });

    describe("Deployment", async () => {
        it("Should revert when invalid admin contract address", async () => {
            await expect(
                upgrades.deployProxy(CollectionFactory, [
                    tokenERC721.address,
                    tokenERC1155.address,
                    AddressZero,
                    user1.address,
                    user2.address,
                ])
            ).to.revertedWith("Invalid Admin contract");
            await expect(
                upgrades.deployProxy(CollectionFactory, [
                    tokenERC721.address,
                    tokenERC1155.address,
                    user1.address,
                    user1.address,
                    user2.address,
                ])
            ).to.revertedWith("Invalid Admin contract");
        });
    });

    describe("setMaxCollection", async () => {
        it("Should revert when invalid admin contract address", async () => {
            await expect(collectionFactory.connect(user1).setMaxCollection(50)).to.revertedWith(
                "Caller is not an owner or admin"
            );
        });

        it("Should revert Invalid maxCollection", async () => {
            await expect(collectionFactory.setMaxCollection(0)).to.revertedWith("Invalid maxCollection");
        });

        it("Should setMaxCollection successfully", async () => {
            await collectionFactory.setMaxCollection(50);
            const maxCollection = await collectionFactory.maxCollection();
            expect(maxCollection).equal(50);
        });
    });

    describe("setMaxTotalSuply", async () => {
        it("Should revert when invalid admin contract address", async () => {
            await expect(collectionFactory.connect(user1).setMaxTotalSuply(50)).to.revertedWith(
                "Caller is not an owner or admin"
            );
        });

        it("Should revert Invalid maxTotalSuply", async () => {
            await expect(collectionFactory.setMaxTotalSuply(0)).to.revertedWith("Invalid maxTotalSuply");
        });

        it("Should setMaxTotalSuply successfully", async () => {
            await collectionFactory.setMaxTotalSuply(50);
            const maxTotalSuply = await collectionFactory.maxTotalSuply();
            expect(maxTotalSuply).equal(50);
        });
    });

    describe("setMaxCollectionOfUser", async () => {
        it("Should revert when invalid admin contract address", async () => {
            await expect(collectionFactory.connect(user1).setMaxCollectionOfUser(user1.address, 50)).to.revertedWith(
                "Caller is not an owner or admin"
            );
        });

        it("Should revert Invalid address", async () => {
            await expect(collectionFactory.setMaxCollectionOfUser(AddressZero, 0)).to.revertedWith("Invalid address");
        });

        it("Should revert Invalid maxCollectionOfUser", async () => {
            await expect(collectionFactory.setMaxCollectionOfUser(user1.address, 0)).to.revertedWith(
                "Invalid maxCollectionOfUser"
            );
        });

        it("Should setMaxCollectionOfUser successfully", async () => {
            await collectionFactory.setMaxCollectionOfUser(user1.address, 50);
            const maxCollectionOfUsers = await collectionFactory.maxCollectionOfUsers(user1.address);
            expect(maxCollectionOfUsers).equal(50);
        });
    });

    describe("create", async () => {
        beforeEach(async () => {
            await collectionFactory.setPause(false);
        });

        it("should revert Exceeding the maxCollection", async () => {
            await collectionFactory.setMaxCollection(1);
            await collectionFactory.create(0, "NFT", "NFT", user1.address, 250);

            await expect(collectionFactory.create(1, "NFT1155", "NFT1155", user1.address, 250)).to.be.revertedWith(
                "Exceeding the maxCollection"
            );
        });

        it("should create success", async () => {
            await collectionFactory.create(0, "NFT", "NFT", user1.address, 250);

            await collectionFactory.create(1, "NFT1155", "NFT1155", user1.address, 250);

            const totalCollection = await collectionFactory.getCollectionLength();
            expect(totalCollection).to.equal(2);

            const collectionByUser = await collectionFactory.getCollectionByUser(owner.address);
            expect(collectionByUser.length).to.equal(2);

            const collectionInfo = await collectionFactory.getCollectionInfo(1);
            expect(collectionInfo.typeNft).to.equal(0);
            expect(collectionInfo.collectionAddress).to.equal(collectionByUser[0]);
            expect(collectionInfo.owner).to.equal(owner.address);
        });
    });
});
