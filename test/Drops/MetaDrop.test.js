const { expect } = require("chai");
const { upgrades, ethers } = require("hardhat");
const { MaxUint256, AddressZero } = ethers.constants;
const { formatBytes32String } = ethers.utils;
const { getCurrentTime, setTime, generateMerkleTree, generateLeaf } = require("../utils");

const TOTAL_SUPPLY = ethers.utils.parseEther("1000000000000");
const MINT_FEE = 1000;
const TOKEN_0_1 = ethers.utils.parseEther("0.1");
const TOKEN_0_2 = ethers.utils.parseEther("0.2");
const ONE_DAY = 3600 * 24;

describe("MetaDrop", () => {
    beforeEach(async () => {
        const accounts = await ethers.getSigners();
        owner = accounts[0];
        user1 = accounts[1];
        user2 = accounts[2];
        user3 = accounts[3];
        user_notWhitelisted = accounts[4];

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

        MetaCitizen = await ethers.getContractFactory("MetaCitizen");
        metaCitizen = await upgrades.deployProxy(MetaCitizen, [
            treasury.address,
            token.address,
            MINT_FEE,
            admin.address,
        ]);
        await metaCitizen.deployed();

        MetaDrop = await ethers.getContractFactory("MetaDrop");
        metaDrop = await upgrades.deployProxy(MetaDrop, [metaCitizen.address, admin.address, treasury.address]);
        await metaDrop.deployed();

        await token.mint(user1.address, TOTAL_SUPPLY);
        await token.mint(user2.address, TOTAL_SUPPLY);
        await token.mint(user3.address, TOTAL_SUPPLY);

        await token.connect(user1).approve(metaDrop.address, MaxUint256);
        await token.connect(user2).approve(metaDrop.address, MaxUint256);
        await token.connect(user3).approve(metaDrop.address, MaxUint256);

        await metaCitizen.mint(user1.address);
        await metaCitizen.mint(user2.address);
        await metaCitizen.mint(user3.address);

        await admin.setPermitedPaymentToken(token.address, true);

        privateStartTime = (await getCurrentTime()) + 10;
        publicStartTime = privateStartTime + ONE_DAY;
        publicEndTime = publicStartTime + ONE_DAY;

        merkleTree = generateMerkleTree([user1.address, user2.address, user3.address]);
        proof_user1 = merkleTree.getHexProof(generateLeaf(user1.address));
        proof_user2 = merkleTree.getHexProof(generateLeaf(user2.address));
        proof_user3 = merkleTree.getHexProof(generateLeaf(user3.address));
    });

    describe("Deployment", async () => {
        it("Check correct initial state", async () => {
            expect(await metaDrop.metaCitizen()).to.equal(metaCitizen.address);
        });
    });

    describe("create", async () => {
        beforeEach(async () => {
            drop = {
                root: merkleTree.getHexRoot(),
                owner: user1.address,
                nft: tokenMintERC721.address,
                paymentToken: token.address,
                fundingReceiver: user1.address,
                privateFee: TOKEN_0_1,
                publicFee: TOKEN_0_2,
                privateStartTime: privateStartTime,
                publicStartTime: publicStartTime,
                publicEndTime: publicEndTime,
                privateMintableLimit: 1,
                publicMintableLimit: 5,
                mintedTotal: 0,
                maxSupply: 100,
            };
        });

        it("Should throw error Invalid root", async () => {
            drop.root = formatBytes32String("");

            await expect(metaDrop.connect(user1).create(drop)).to.be.revertedWith("Invalid root");
        });

        it("Should throw error Invalid Drop owner", async () => {
            drop.owner = user2.address;

            await expect(metaDrop.connect(user1).create(drop)).to.be.revertedWith("Invalid Drop owner");
        });

        it("Should throw error Invalid funding receiver", async () => {
            drop.fundingReceiver = AddressZero;

            await expect(metaDrop.connect(user1).create(drop)).to.be.revertedWith("Invalid funding receiver");
        });

        it("Should throw error Invalid private sale start time", async () => {
            drop.privateStartTime = getCurrentTime();

            await expect(metaDrop.connect(user1).create(drop)).to.be.revertedWith("Invalid private sale start time");
        });

        it("Should throw error Invalid public sale start time", async () => {
            drop.publicStartTime = privateStartTime;

            await expect(metaDrop.connect(user1).create(drop)).to.be.revertedWith("Invalid public sale start time");
        });

        it("Should throw error Invalid public sale end time", async () => {
            drop.publicEndTime = publicStartTime;

            await expect(metaDrop.connect(user1).create(drop)).to.be.revertedWith("Invalid public sale end time");
        });

        it("Should throw error Minted total must be zero", async () => {
            drop.mintedTotal = 1;

            await expect(metaDrop.connect(user1).create(drop)).to.be.revertedWith("Minted total must be zero");
        });

        it("Should throw error Invalid minting supply", async () => {
            drop.maxSupply = 0;

            await expect(metaDrop.connect(user1).create(drop)).to.be.revertedWith("Invalid minting supply");
        });

        it("Should throw error Invalid payment token", async () => {
            drop.paymentToken = user1.address;

            await expect(metaDrop.connect(user1).create(drop)).to.be.revertedWith("Invalid payment token");
        });

        it("Should create drop successful", async () => {
            await metaDrop.connect(user1).create(drop);

            const currentDropCounter = await metaDrop.getCurrentCounter();
            expect(currentDropCounter).to.equal("1");

            const createdDrop = await metaDrop.drops(currentDropCounter);
            expect(createdDrop.root).to.equal(drop.root);
            expect(createdDrop.owner).to.equal(drop.owner);
            expect(createdDrop.nft).to.equal(drop.nft);
            expect(createdDrop.paymentToken).to.equal(drop.paymentToken);
            expect(createdDrop.fundingReceiver).to.equal(drop.fundingReceiver);
            expect(createdDrop.privateFee).to.equal(drop.privateFee);
            expect(createdDrop.publicFee).to.equal(drop.publicFee);
            expect(createdDrop.privateStartTime).to.equal(drop.privateStartTime);
            expect(createdDrop.publicStartTime).to.equal(drop.publicStartTime);
            expect(createdDrop.publicEndTime).to.equal(drop.publicEndTime);
            expect(createdDrop.privateMintableLimit).to.equal(drop.privateMintableLimit);
            expect(createdDrop.publicMintableLimit).to.equal(drop.publicMintableLimit);
            expect(createdDrop.mintedTotal).to.equal(drop.mintedTotal);
            expect(createdDrop.maxSupply).to.equal(drop.maxSupply);
        });
    });

    describe("update", async () => {
        beforeEach(async () => {
            drop = {
                root: merkleTree.getHexRoot(),
                owner: user1.address,
                nft: tokenMintERC721.address,
                paymentToken: token.address,
                fundingReceiver: user1.address,
                privateFee: TOKEN_0_1,
                publicFee: TOKEN_0_2,
                privateStartTime: privateStartTime,
                publicStartTime: publicStartTime,
                publicEndTime: publicEndTime,
                privateMintableLimit: 1,
                publicMintableLimit: 5,
                mintedTotal: 0,
                maxSupply: 100,
            };

            await metaDrop.connect(user1).create(drop);

            dropId = await metaDrop.getCurrentCounter();
        });

        it("Should throw error Only Drop owner can call this function", async () => {
            await expect(metaDrop.connect(user2).update(dropId, drop)).to.be.revertedWith(
                "Only Drop owner can call this function"
            );
        });

        it("Should throw error Invalid Drop owner", async () => {
            drop.owner = user2.address;

            await expect(metaDrop.connect(user1).update(dropId, drop)).to.be.revertedWith("Invalid Drop owner");
        });

        it("Should throw error Invalid funding receiver", async () => {
            drop.fundingReceiver = AddressZero;

            await expect(metaDrop.connect(user1).update(dropId, drop)).to.be.revertedWith("Invalid funding receiver");
        });

        it("Should throw error Invalid private sale start time", async () => {
            drop.privateStartTime = 0;

            await expect(metaDrop.connect(user1).update(dropId, drop)).to.be.revertedWith(
                "Invalid private sale start time"
            );
        });

        it("Should throw error Invalid public sale start time", async () => {
            drop.publicStartTime = privateStartTime;

            await expect(metaDrop.connect(user1).update(dropId, drop)).to.be.revertedWith(
                "Invalid public sale start time"
            );
        });

        it("Should throw error Invalid public sale end time", async () => {
            drop.publicEndTime = publicStartTime;

            await expect(metaDrop.connect(user1).update(dropId, drop)).to.be.revertedWith(
                "Invalid public sale end time"
            );
        });

        it("Should throw error Invalid minted total", async () => {
            drop.mintedTotal = 1;

            await expect(metaDrop.connect(user1).update(dropId, drop)).to.be.revertedWith("Invalid minted tota");
        });

        it("Should throw error Invalid minting supply", async () => {
            drop.maxSupply = 0;

            await expect(metaDrop.connect(user1).update(dropId, drop)).to.be.revertedWith("Invalid minting supply");
        });

        it("Should throw error Invalid payment token", async () => {
            drop.paymentToken = user1.address;

            await expect(metaDrop.connect(user1).update(dropId, drop)).to.be.revertedWith("Invalid payment token");
        });

        it("Should update drop successful", async () => {
            const expectedUpdateDrop = {
                root: merkleTree.getHexRoot(),
                owner: user1.address,
                nft: tokenMintERC721.address,
                paymentToken: token.address,
                fundingReceiver: user1.address,
                privateFee: TOKEN_0_1,
                publicFee: TOKEN_0_2,
                privateStartTime: privateStartTime + 10,
                publicStartTime: publicStartTime + 10,
                publicEndTime: publicEndTime + 10,
                privateMintableLimit: 2,
                publicMintableLimit: 0,
                mintedTotal: 0,
                maxSupply: 200,
            };

            await metaDrop.connect(user1).update(dropId, expectedUpdateDrop);

            const updatedDrop = await metaDrop.drops(dropId);
            expect(updatedDrop.root).to.equal(expectedUpdateDrop.root);
            expect(updatedDrop.owner).to.equal(expectedUpdateDrop.owner);
            expect(updatedDrop.nft).to.equal(expectedUpdateDrop.nft);
            expect(updatedDrop.paymentToken).to.equal(expectedUpdateDrop.paymentToken);
            expect(updatedDrop.fundingReceiver).to.equal(expectedUpdateDrop.fundingReceiver);
            expect(updatedDrop.privateFee).to.equal(expectedUpdateDrop.privateFee);
            expect(updatedDrop.publicFee).to.equal(expectedUpdateDrop.publicFee);
            expect(updatedDrop.privateStartTime).to.equal(expectedUpdateDrop.privateStartTime);
            expect(updatedDrop.publicStartTime).to.equal(expectedUpdateDrop.publicStartTime);
            expect(updatedDrop.publicEndTime).to.equal(expectedUpdateDrop.publicEndTime);
            expect(updatedDrop.privateMintableLimit).to.equal(expectedUpdateDrop.privateMintableLimit);
            expect(updatedDrop.publicMintableLimit).to.equal(expectedUpdateDrop.publicMintableLimit);
            expect(updatedDrop.mintedTotal).to.equal(expectedUpdateDrop.mintedTotal);
            expect(updatedDrop.maxSupply).to.equal(expectedUpdateDrop.maxSupply);
        });
    });

    describe("mint", async () => {
        beforeEach(async () => {
            drop = {
                root: merkleTree.getHexRoot(),
                owner: owner.address,
                nft: tokenMintERC721.address,
                paymentToken: token.address,
                fundingReceiver: user1.address,
                privateFee: TOKEN_0_1,
                publicFee: TOKEN_0_2,
                privateStartTime: privateStartTime,
                publicStartTime: publicStartTime,
                publicEndTime: publicEndTime,
                privateMintableLimit: 1,
                publicMintableLimit: 5,
                mintedTotal: 0,
                maxSupply: 12,
            };

            await metaDrop.create(drop);
            dropId = await metaDrop.getCurrentCounter();
        });

        it("Should throw error Invalid drop", async () => {
            await expect(metaDrop.connect(user1).mint("0", proof_user1, 5)).to.be.revertedWith("Invalid drop");

            await expect(metaDrop.connect(user1).mint("2", proof_user1, 5)).to.be.revertedWith("Invalid drop");
        });

        it("Should throw error when not hold MTV Citizen", async () => {
            await expect(metaDrop.connect(user3).mint(dropId, proof_user3, 5)).to.be.revertedWith(
                "Not permitted to mint token at the moment"
            );
        });

        it("Should throw error when drop has not started yet", async () => {
            await expect(metaDrop.connect(user1).mint(dropId, proof_user1, 5)).to.be.revertedWith(
                "Not permitted to mint token at the moment"
            );
        });

        it("Should throw error when drop has ended", async () => {
            await setTime(publicEndTime);

            await expect(metaDrop.connect(user1).mint(dropId, proof_user1, 5)).to.be.revertedWith(
                "Not permitted to mint token at the moment"
            );
        });

        it("Should throw error when is not in whitelist", async () => {
            await setTime(privateStartTime);

            const proof_user_notWhitelisted = merkleTree.getHexProof(generateLeaf(user_notWhitelisted.address));

            await expect(
                metaDrop.connect(user_notWhitelisted).mint(dropId, proof_user_notWhitelisted, 5)
            ).to.be.revertedWith("Not permitted to mint token at the moment");
        });

        it("Should throw error Mint more than allocated portion", async () => {
            await setTime(privateStartTime);
            let mintableAmount = await metaDrop.mintableAmount(dropId, user1.address);
            expect(mintableAmount).to.equal(drop.privateMintableLimit);

            await expect(metaDrop.connect(user1).mint(dropId, proof_user1, mintableAmount.add(1))).to.be.revertedWith(
                "Mint more than allocated portion"
            );

            await setTime(publicStartTime);
            mintableAmount = await metaDrop.mintableAmount(dropId, user1.address);
            expect(mintableAmount).to.equal(drop.publicMintableLimit);

            await expect(metaDrop.connect(user1).mint(dropId, proof_user1, mintableAmount.add(1))).to.be.revertedWith(
                "Mint more than allocated portion"
            );
        });

        it("Should throw error Mint more tokens than available", async () => {
            await setTime(privateStartTime);
            await metaDrop.connect(user1).mint(dropId, proof_user1, drop.privateMintableLimit);
            await metaDrop.connect(user2).mint(dropId, proof_user2, drop.privateMintableLimit);

            await setTime(publicStartTime);
            await metaDrop.connect(user1).mint(dropId, proof_user1, drop.publicMintableLimit);
            await metaDrop.connect(user2).mint(dropId, proof_user2, drop.publicMintableLimit);

            await expect(metaDrop.connect(user3).mint(dropId, proof_user3, "1")).to.be.revertedWith(
                "Mint more tokens than available"
            );
        });
    });
});
