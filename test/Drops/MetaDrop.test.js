const { expect } = require("chai");
const { upgrades, ethers } = require("hardhat");
const { MaxUint256, AddressZero } = ethers.constants;
const { formatBytes32String, parseEther } = ethers.utils;
const { getCurrentTime, setTime, generateMerkleTree, generateLeaf } = require("../utils");

const TOTAL_SUPPLY = parseEther("1000000000000");
const TOKEN_0_1 = parseEther("0.1");
const TOKEN_0_2 = parseEther("0.2");
const ONE_DAY = 3600 * 24;
const DEFAULT_SERVICE_NUMERATOR = 100000;

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

        TokenERC721 = await ethers.getContractFactory("TokenERC721");
        tokenERC721 = await upgrades.deployProxy(TokenERC721, [
            owner.address,
            "NFT Metaversus",
            "nMTVS",
            100,
            owner.address,
            10000,
        ]);

        MetaCitizen = await ethers.getContractFactory("MetaCitizen");
        metaCitizen = await upgrades.deployProxy(MetaCitizen, [
            treasury.address,
            token.address,
            TOKEN_0_1,
            admin.address
        ]);
        await metaCitizen.deployed();

        MetaDrop = await ethers.getContractFactory("MetaDrop");
        metaDrop = await upgrades.deployProxy(MetaDrop, [
            metaCitizen.address,
            admin.address,
            treasury.address,
            DEFAULT_SERVICE_NUMERATOR // 10%
        ]);
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

        await tokenERC721.setAdmin(metaDrop.address, true);

        privateStartTime = await getCurrentTime() + 10;
        privateEndTime = privateStartTime + ONE_DAY;
        publicStartTime = privateEndTime + ONE_DAY;
        publicEndTime = publicStartTime + ONE_DAY;

        merkleTree = generateMerkleTree([user1.address, user2.address, user3.address]);
        proof_user1 = merkleTree.getHexProof(generateLeaf(user1.address));
        proof_user2 = merkleTree.getHexProof(generateLeaf(user2.address));
        proof_user3 = merkleTree.getHexProof(generateLeaf(user3.address));

        SERVICE_FEE_DENOMINATOR = await metaDrop.SERVICE_FEE_DENOMINATOR();
    });

    describe("Deployment", async () => {
        it("Should throw error Service fee will exceed minting fee", async () => {
            await expect(
                upgrades.deployProxy(MetaDrop, [
                    metaCitizen.address,
                    admin.address,
                    treasury.address,
                    SERVICE_FEE_DENOMINATOR.add(1)
                ])
            ).to.be.revertedWith(
                "Service fee will exceed minting fee"
            );
        });

        it("Set initial state successful", async () => {
            expect(await metaDrop.metaCitizen()).to.equal(metaCitizen.address);
            expect(await metaDrop.mvtsAdmin()).to.equal(admin.address);
            expect(await metaDrop.treasury()).to.equal(treasury.address);
            expect(await metaDrop.serviceFeeNumerator()).to.equal(DEFAULT_SERVICE_NUMERATOR);
        });
    });


    describe("setServiceFeeNumerator", async () => {
        it("Should throw error Service fee will exceed minting fee", async () => {
            await expect(
                metaDrop.setServiceFeeNumerator(SERVICE_FEE_DENOMINATOR.add(1))
            ).to.be.revertedWith(
                "Service fee will exceed minting fee"
            );
        });

        it("Should set successfully", async () => {
            await metaDrop.setServiceFeeNumerator("0")
            expect(await metaDrop.serviceFeeNumerator()).to.equal("0");

            await metaDrop.setServiceFeeNumerator(DEFAULT_SERVICE_NUMERATOR + 1)
            expect(await metaDrop.serviceFeeNumerator()).to.equal(DEFAULT_SERVICE_NUMERATOR + 1);

            await metaDrop.setServiceFeeNumerator(SERVICE_FEE_DENOMINATOR)
            expect(await metaDrop.serviceFeeNumerator()).to.equal(SERVICE_FEE_DENOMINATOR);
        });
    });

    describe("create", async () => {
        beforeEach(async () => {
            drop = {
                root: merkleTree.getHexRoot(),
                nft: tokenERC721.address,
                paymentToken: token.address,
                fundingReceiver: user1.address,
                maxSupply: 100,
                privateRound: {
                    startTime: privateStartTime,
                    endTime: privateEndTime,
                    mintFee: TOKEN_0_1,
                    mintableLimit: 1
                },
                publicRound: {
                    startTime: publicStartTime,
                    endTime: publicEndTime,
                    mintFee: TOKEN_0_2,
                    mintableLimit: 5
                }
            }
        });

        it("Should throw error Invalid TokenCollectionERC721 contract", async () => {
            drop.nft = AddressZero;
            await expect(
                metaDrop.connect(user1).create(drop)
            ).to.be.revertedWith(
                "Invalid TokenCollectionERC721 contract"
            );

            drop.nft = metaCitizen.address;
            await expect(
                metaDrop.connect(user1).create(drop)
            ).to.be.revertedWith(
                "Invalid TokenCollectionERC721 contract"
            );
        });

        it("Should throw error Invalid root", async () => {
            drop.root = formatBytes32String('');

            await expect(
                metaDrop.connect(user1).create(drop)
            ).to.be.revertedWith(
                "Invalid root"
            );
        });

        it("Should throw error Invalid funding receiver", async () => {
            drop.fundingReceiver = AddressZero;

            await expect(
                metaDrop.connect(user1).create(drop)
            ).to.be.revertedWith(
                "Invalid funding receiver"
            );
        });

        it("Should throw error Invalid private sale start time", async () => {
            drop.privateRound.startTime = getCurrentTime();

            await expect(
                metaDrop.connect(user1).create(drop)
            ).to.be.revertedWith(
                "Invalid private sale start time"
            );
        });

        it("Should throw error Invalid private sale end time", async () => {
            drop.privateRound.endTime = privateStartTime;

            await expect(
                metaDrop.connect(user1).create(drop)
            ).to.be.revertedWith(
                "Invalid private sale end time"
            );
        });

        it("Should throw error Invalid public sale start time", async () => {
            drop.publicRound.startTime = privateEndTime;

            await expect(
                metaDrop.connect(user1).create(drop)
            ).to.be.revertedWith(
                "Invalid public sale start time"
            );
        });

        it("Should throw error Invalid public sale end time", async () => {
            drop.publicRound.endTime = publicStartTime;

            await expect(
                metaDrop.connect(user1).create(drop)
            ).to.be.revertedWith(
                "Invalid public sale end time"
            );
        });

        it("Should throw error Invalid minting supply", async () => {
            drop.maxSupply = 0;

            await expect(
                metaDrop.connect(user1).create(drop)
            ).to.be.revertedWith(
                "Invalid minting supply"
            );
        });

        it("Should throw error Invalid payment token", async () => {
            drop.paymentToken = user1.address;

            await expect(
                metaDrop.connect(user1).create(drop)
            ).to.be.revertedWith(
                "Invalid payment token"
            );
        });

        it("Should create drop successful", async () => {
            await metaDrop.connect(user1).create(drop);

            const currentDropCounter = await metaDrop.getCurrentCounter();
            expect(currentDropCounter).to.equal('1');

            const createdDrop = await metaDrop.drops(currentDropCounter);
            expect(createdDrop.root).to.equal(drop.root);
            expect(createdDrop.owner).to.equal(user1.address);
            expect(createdDrop.nft).to.equal(drop.nft);
            expect(createdDrop.paymentToken).to.equal(drop.paymentToken);
            expect(createdDrop.fundingReceiver).to.equal(drop.fundingReceiver);
            expect(createdDrop.mintedTotal).to.equal("0");
            expect(createdDrop.maxSupply).to.equal(drop.maxSupply);

            expect(createdDrop.privateRound.startTime).to.equal(drop.privateRound.startTime);
            expect(createdDrop.privateRound.endTime).to.equal(drop.privateRound.endTime);
            expect(createdDrop.privateRound.mintingFee).to.equal(drop.privateRound.mintingFee);
            expect(createdDrop.privateRound.mintableLimit).to.equal(drop.privateRound.mintableLimit);

            expect(createdDrop.publicRound.startTime).to.equal(drop.publicRound.startTime);
            expect(createdDrop.publicRound.endTime).to.equal(drop.publicRound.endTime);
            expect(createdDrop.publicRound.mintingFee).to.equal(drop.publicRound.mintingFee);
            expect(createdDrop.publicRound.mintableLimit).to.equal(drop.publicRound.mintableLimit);
        });
    });

    describe("update", async () => {
        beforeEach(async () => {
            drop = {
                root: merkleTree.getHexRoot(),
                nft: tokenERC721.address,
                paymentToken: token.address,
                fundingReceiver: user1.address,
                maxSupply: 100,
                privateRound: {
                    startTime: privateStartTime,
                    endTime: privateEndTime,
                    mintFee: TOKEN_0_1,
                    mintableLimit: 1
                },
                publicRound: {
                    startTime: publicStartTime,
                    endTime: publicEndTime,
                    mintFee: TOKEN_0_2,
                    mintableLimit: 5
                }
            }

            await metaDrop.connect(user1).create(drop);

            dropId = await metaDrop.getCurrentCounter();
        });

        it("Should throw error Invalid drop", async () => {
            await expect(
                metaDrop.connect(user1).update("0", drop)
            ).to.be.revertedWith(
                "Invalid drop"
            );

            await expect(
                metaDrop.connect(user1).update(dropId.add(1), drop)
            ).to.be.revertedWith(
                "Invalid drop"
            );
        });

        it("Should throw error Invalid TokenCollectionERC721 contract", async () => {
            drop.nft = AddressZero;
            await expect(
                metaDrop.connect(user1).update(dropId, drop)
            ).to.be.revertedWith(
                "Invalid TokenCollectionERC721 contract"
            );

            drop.nft = metaCitizen.address;
            await expect(
                metaDrop.connect(user1).update(dropId, drop)
            ).to.be.revertedWith(
                "Invalid TokenCollectionERC721 contract"
            );
        });

        it("Should throw error Only Drop owner can call this function", async () => {
            await expect(
                metaDrop.connect(user2).update(dropId, drop)
            ).to.be.revertedWith(
                "Only Drop owner can call this function"
            );
        });

        it("Should throw error Invalid funding receiver", async () => {
            drop.fundingReceiver = AddressZero;

            await expect(
                metaDrop.connect(user1).update(dropId, drop)
            ).to.be.revertedWith(
                "Invalid funding receiver"
            );
        });

        it("Should throw error Invalid private sale start time", async () => {
            drop.privateRound.startTime = 0;

            await expect(
                metaDrop.connect(user1).update(dropId, drop)
            ).to.be.revertedWith(
                "Invalid private sale start time"
            );
        });

        it("Should throw error Invalid private sale end time", async () => {
            drop.privateRound.endTime = privateStartTime;

            await expect(
                metaDrop.connect(user1).update(dropId, drop)
            ).to.be.revertedWith(
                "Invalid private sale end time"
            );
        });

        it("Should throw error Invalid public sale start time", async () => {
            drop.publicRound.startTime = privateEndTime;

            await expect(
                metaDrop.connect(user1).update(dropId, drop)
            ).to.be.revertedWith(
                "Invalid public sale start time"
            );
        });

        it("Should throw error Invalid public sale end time", async () => {
            drop.publicRound.endTime = publicStartTime;

            await expect(
                metaDrop.connect(user1).update(dropId, drop)
            ).to.be.revertedWith(
                "Invalid public sale end time"
            );
        });

        it("Should throw error Invalid minting supply", async () => {
            drop.maxSupply = 0;

            await expect(
                metaDrop.connect(user1).update(dropId, drop)
            ).to.be.revertedWith(
                "Invalid minting supply"
            );
        });

        it("Should throw error Invalid payment token", async () => {
            drop.paymentToken = user1.address;

            await expect(
                metaDrop.connect(user1).update(dropId, drop)
            ).to.be.revertedWith(
                "Invalid payment token"
            );
        });

        it("Should update drop successful", async () => {
            const expectedUpdateDrop = {
                root: formatBytes32String("0x1234"),
                nft: tokenERC721.address,
                paymentToken: token.address,
                fundingReceiver: user2.address,
                maxSupply: 200,
                privateRound: {
                    startTime: privateStartTime + 10,
                    endTime: privateEndTime + 10,
                    mintFee: 0,
                    mintableLimit: 0
                },
                publicRound: {
                    startTime: publicStartTime + 10,
                    endTime: publicEndTime + 10,
                    mintFee: 0,
                    mintableLimit: 0
                }
            }

            await metaDrop.connect(user1).update(dropId, expectedUpdateDrop);

            const updatedDrop = await metaDrop.drops(dropId);
            expect(updatedDrop.root).to.equal(expectedUpdateDrop.root);
            expect(updatedDrop.owner).to.equal(user1.address);
            expect(updatedDrop.nft).to.equal(expectedUpdateDrop.nft);
            expect(updatedDrop.paymentToken).to.equal(expectedUpdateDrop.paymentToken);
            expect(updatedDrop.fundingReceiver).to.equal(expectedUpdateDrop.fundingReceiver);
            expect(updatedDrop.mintedTotal).to.equal("0");
            expect(updatedDrop.maxSupply).to.equal(expectedUpdateDrop.maxSupply);

            expect(updatedDrop.privateRound.startTime).to.equal(expectedUpdateDrop.privateRound.startTime);
            expect(updatedDrop.privateRound.endTime).to.equal(expectedUpdateDrop.privateRound.endTime);
            expect(updatedDrop.privateRound.mintingFee).to.equal(expectedUpdateDrop.privateRound.mintingFee);
            expect(updatedDrop.privateRound.mintableLimit).to.equal(expectedUpdateDrop.privateRound.mintableLimit);

            expect(updatedDrop.publicRound.startTime).to.equal(expectedUpdateDrop.publicRound.startTime);
            expect(updatedDrop.publicRound.endTime).to.equal(expectedUpdateDrop.publicRound.endTime);
            expect(updatedDrop.publicRound.mintingFee).to.equal(expectedUpdateDrop.publicRound.mintingFee);
            expect(updatedDrop.publicRound.mintableLimit).to.equal(expectedUpdateDrop.publicRound.mintableLimit);
        });
    });

    describe("mint", async () => {
        beforeEach(async () => {
            drop = {
                root: merkleTree.getHexRoot(),
                nft: tokenERC721.address,
                paymentToken: token.address,
                fundingReceiver: owner.address,
                maxSupply: 12,
                privateRound: {
                    startTime: privateStartTime,
                    endTime: privateEndTime,
                    mintFee: TOKEN_0_1,
                    mintableLimit: 1
                },
                publicRound: {
                    startTime: publicStartTime,
                    endTime: publicEndTime,
                    mintFee: TOKEN_0_2,
                    mintableLimit: 5
                }
            }

            await metaDrop.create(drop);
            dropId = await metaDrop.getCurrentCounter();
        });

        it("Should throw error Invalid drop", async () => {
            await expect(
                metaDrop.connect(user1).mint("0", proof_user1, 5)
            ).to.be.revertedWith(
                "Invalid drop"
            );

            await expect(
                metaDrop.connect(user1).mint("2", proof_user1, 5)
            ).to.be.revertedWith(
                "Invalid drop"
            );
        });

        it("Should throw error when not hold MTV Citizen", async () => {
            await expect(
                metaDrop.connect(user3).mint(dropId, proof_user3, 5)
            ).to.be.revertedWith(
                "Not permitted to mint token at the moment"
            );
        });

        it("Should throw error when drop is not active", async () => {
            // Drop is not started yet
            await expect(
                metaDrop.connect(user1).mint(dropId, proof_user1, 5)
            ).to.be.revertedWith(
                "Not permitted to mint token at the moment"
            );

            // Private round has end
            await setTime(privateEndTime);
            await expect(
                metaDrop.connect(user1).mint(dropId, proof_user1, 5)
            ).to.be.revertedWith(
                "Not permitted to mint token at the moment"
            );

            // Public round is not started yet
            await setTime(publicStartTime - 5);
            await expect(
                metaDrop.connect(user1).mint(dropId, proof_user1, 5)
            ).to.be.revertedWith(
                "Not permitted to mint token at the moment"
            );

            // Public round has end
            await setTime(publicEndTime);
            await expect(
                metaDrop.connect(user1).mint(dropId, proof_user1, 5)
            ).to.be.revertedWith(
                "Not permitted to mint token at the moment"
            );
        });

        it("Should throw error when is not in whitelist", async () => {
            await setTime(privateStartTime);

            const proof_user_notWhitelisted = merkleTree.getHexProof(generateLeaf(user_notWhitelisted.address));

            await expect(
                metaDrop.connect(user_notWhitelisted).mint(dropId, proof_user_notWhitelisted, 5)
            ).to.be.revertedWith(
                "Not permitted to mint token at the moment"
            );
        });

        it("Should throw error Mint more than allocated portion", async () => {
            await setTime(privateStartTime);
            let mintableAmount = await metaDrop.mintableAmount(dropId, user1.address);
            expect(mintableAmount).to.equal(drop.privateRound.mintableLimit);

            await expect(
                metaDrop.connect(user1).mint(dropId, proof_user1, mintableAmount.add(1))
            ).to.be.revertedWith(
                "Mint more than allocated portion"
            );

            await setTime(publicStartTime);
            mintableAmount = await metaDrop.mintableAmount(dropId, user1.address);
            expect(mintableAmount).to.equal(drop.publicRound.mintableLimit);

            await expect(
                metaDrop.connect(user1).mint(dropId, proof_user1, mintableAmount.add(1))
            ).to.be.revertedWith(
                "Mint more than allocated portion"
            );
        });

        it("Should throw error Mint more tokens than available", async () => {
            await setTime(privateStartTime);
            await metaDrop.connect(user1).mint(dropId, proof_user1, drop.privateRound.mintableLimit);
            await metaDrop.connect(user2).mint(dropId, proof_user2, drop.privateRound.mintableLimit);

            await setTime(publicStartTime);
            await metaDrop.connect(user1).mint(dropId, proof_user1, drop.publicRound.mintableLimit);
            await metaDrop.connect(user2).mint(dropId, proof_user2, drop.publicRound.mintableLimit);

            await expect(
                metaDrop.connect(user3).mint(dropId, proof_user3, "1")
            ).to.be.revertedWith(
                "Mint more tokens than available"
            );
        });

        it("Should mint successful by an ERC-20 token", async () => {
            await setTime(privateStartTime);
            let expectedMintedFee = drop.privateRound.mintFee.mul(drop.privateRound.mintableLimit);
            let expectedServiceFee = expectedMintedFee.mul(DEFAULT_SERVICE_NUMERATOR).div(SERVICE_FEE_DENOMINATOR);
            let expectedCreatorFee = expectedMintedFee.sub(expectedServiceFee);

            await expect(() => metaDrop.connect(user1).mint(dropId, proof_user1, drop.privateRound.mintableLimit))
                .to.changeTokenBalances(
                    token,
                    [treasury, user1, owner],
                    [expectedServiceFee, expectedMintedFee.mul(-1), expectedCreatorFee]
                );

            expect(await tokenERC721.balanceOf(user1.address)).to.equal(drop.privateRound.mintableLimit);

            await setTime(publicStartTime);
            expectedMintedFee = drop.publicRound.mintFee.mul(drop.publicRound.mintableLimit);
            expectedServiceFee = expectedMintedFee.mul(DEFAULT_SERVICE_NUMERATOR).div(SERVICE_FEE_DENOMINATOR);
            expectedCreatorFee = expectedMintedFee.sub(expectedServiceFee);

            await expect(() => metaDrop.connect(user1).mint(dropId, proof_user1, drop.publicRound.mintableLimit))
                .to.changeTokenBalances(
                    token,
                    [treasury, user1, owner],
                    [expectedServiceFee, expectedMintedFee.mul(-1), expectedCreatorFee]
                );

            expect(await tokenERC721.balanceOf(user1.address)).to.equal(drop.privateRound.mintableLimit + drop.publicRound.mintableLimit);
        });

        it("Should mint successful by native coin", async () => {
            drop.paymentToken = AddressZero;
            drop.privateRound.startTime = await getCurrentTime() + 10;
            drop.privateRound.endTime = drop.privateRound.startTime + ONE_DAY;
            drop.publicRound.startTime = drop.privateRound.endTime + ONE_DAY;
            drop.publicRound.endTime = drop.publicRound.startTime + ONE_DAY;

            await metaDrop.create(drop);
            dropId = await metaDrop.getCurrentCounter();

            await setTime(drop.privateRound.startTime);
            let expectedMintedFee = drop.privateRound.mintFee.mul(drop.privateRound.mintableLimit);
            let expectedServiceFee = expectedMintedFee.mul(DEFAULT_SERVICE_NUMERATOR).div(SERVICE_FEE_DENOMINATOR);
            let expectedCreatorFee = expectedMintedFee.sub(expectedServiceFee);

            await expect(() => metaDrop.connect(user1).mint(dropId, proof_user1, drop.privateRound.mintableLimit, { value: expectedMintedFee }))
                .to.changeEtherBalances(
                    [treasury, user1, owner],
                    [expectedServiceFee, expectedMintedFee.mul(-1), expectedCreatorFee]
                );

            expect(await tokenERC721.balanceOf(user1.address)).to.equal(drop.privateRound.mintableLimit);


            await setTime(drop.publicRound.startTime);
            expectedMintedFee = drop.publicRound.mintFee.mul(drop.publicRound.mintableLimit);
            expectedServiceFee = expectedMintedFee.mul(DEFAULT_SERVICE_NUMERATOR).div(SERVICE_FEE_DENOMINATOR);
            expectedCreatorFee = expectedMintedFee.sub(expectedServiceFee);

            await expect(() => metaDrop.connect(user1).mint(dropId, proof_user1, drop.publicRound.mintableLimit, { value: expectedMintedFee }))
                .to.changeEtherBalances(
                    [treasury, user1, owner],
                    [expectedServiceFee, expectedMintedFee.mul(-1), expectedCreatorFee]
                );

            expect(await tokenERC721.balanceOf(user1.address)).to.equal(drop.privateRound.mintableLimit + drop.publicRound.mintableLimit);
        });

        it("Should throw error Not enough fee", async () => {
            drop.paymentToken = AddressZero;
            drop.privateRound.startTime = await getCurrentTime() + 10;
            drop.privateRound.endTime = drop.privateRound.startTime + ONE_DAY;
            drop.publicRound.startTime = drop.privateRound.endTime + ONE_DAY;
            drop.publicRound.endTime = drop.publicRound.startTime + ONE_DAY;

            await metaDrop.create(drop);
            dropId = await metaDrop.getCurrentCounter();

            await setTime(drop.privateRound.startTime);
            const expectedMintedFee = drop.privateRound.mintFee.mul(drop.privateRound.mintableLimit);

            await expect(
                metaDrop.connect(user1).mint(dropId, proof_user1, drop.privateRound.mintableLimit, { value: expectedMintedFee.sub(1) })
            ).to.be.revertedWith(
                "Not enough fee"
            );

            await expect(
                metaDrop.connect(user1).mint(dropId, proof_user1, drop.privateRound.mintableLimit, { value: expectedMintedFee.add(1) })
            ).to.be.revertedWith(
                "Not enough fee"
            );
        });
    });

    describe.only("mintableAmount", async () => {
        beforeEach(async () => {
            drop = {
                root: merkleTree.getHexRoot(),
                nft: tokenERC721.address,
                paymentToken: token.address,
                fundingReceiver: owner.address,
                maxSupply: 12,
                privateRound: {
                    startTime: privateStartTime,
                    endTime: privateEndTime,
                    mintFee: TOKEN_0_1,
                    mintableLimit: 1
                },
                publicRound: {
                    startTime: publicStartTime,
                    endTime: publicEndTime,
                    mintFee: TOKEN_0_2,
                    mintableLimit: 5
                }
            }
        });

        it("Should return mintable amount correctly when mintable is zero", async () => {
            drop.privateRound.mintableLimit = 0;
            drop.publicRound.mintableLimit = 0;

            await metaDrop.create(drop);
            dropId = await metaDrop.getCurrentCounter();

            await setTime(privateStartTime);
            expect(await metaDrop.mintableAmount(dropId, user1.address)).to.equal(drop.maxSupply);
            expect(await metaDrop.mintableAmount(dropId, user2.address)).to.equal(drop.maxSupply);
            expect(await metaDrop.mintableAmount(dropId, user3.address)).to.equal(drop.maxSupply);

            await metaDrop.connect(user1).mint(dropId, proof_user1, 1);
            expect(await metaDrop.mintableAmount(dropId, user1.address)).to.equal(drop.maxSupply - 1);
            expect(await metaDrop.mintableAmount(dropId, user2.address)).to.equal(drop.maxSupply - 1);
            expect(await metaDrop.mintableAmount(dropId, user3.address)).to.equal(drop.maxSupply - 1);

            await metaDrop.connect(user1).mint(dropId, proof_user1, 1);
            await metaDrop.connect(user1).mint(dropId, proof_user1, 1);
        });

    });
});
