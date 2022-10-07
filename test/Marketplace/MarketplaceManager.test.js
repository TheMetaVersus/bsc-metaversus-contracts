const { constants } = require("@openzeppelin/test-helpers");
const { ZERO_ADDRESS } = require("@openzeppelin/test-helpers/src/constants");
const { expect } = require("chai");
const { upgrades, ethers } = require("hardhat");
const { multiply, add, subtract } = require("js-big-decimal");
const { getCurrentTime, skipTime, generateMerkleTree, generateLeaf } = require("../utils");
const { MerkleTree } = require("merkletreejs");
const keccak256 = require("keccak256");
const { parseEther } = ethers.utils;

const TOTAL_SUPPLY = parseEther("1000000000000");
const PRICE = parseEther("1");
const ONE_ETHER = parseEther("1");
const ONE_WEEK = 604800;
const MINT_FEE = 1000;
const NFT_TYPE721 = 0;
const NFT_TYPE1155 = 0;

describe("Marketplace Manager:", () => {
    beforeEach(async () => {
        [owner, user1, user2, user3, treasury] = await ethers.getSigners();

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

        MetaCitizen = await ethers.getContractFactory("MetaCitizen");
        metaCitizen = await upgrades.deployProxy(MetaCitizen, [
            treasury.address,
            token.address,
            MINT_FEE,
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

        NftTest = await ethers.getContractFactory("NftTest");
        nftTest = await upgrades.deployProxy(NftTest, [
            "NFT test",
            "NFT",
            token.address,
            treasury.address,
            250,
            PRICE,
            admin.address,
        ]);

        MkpManager = await ethers.getContractFactory("MarketPlaceManager");
        mkpManager = await upgrades.deployProxy(MkpManager, [treasury.address, admin.address]);

        OrderManager = await ethers.getContractFactory("OrderManager");
        orderManager = await upgrades.deployProxy(OrderManager, [mkpManager.address, admin.address]);

        TokenERC721 = await ethers.getContractFactory("TokenERC721");
        tokenERC721 = await TokenERC721.deploy();
        TokenERC1155 = await ethers.getContractFactory("TokenERC1155");
        tokenERC1155 = await TokenERC1155.deploy();

        CollectionFactory = await ethers.getContractFactory("CollectionFactory");
        collectionFactory = await upgrades.deployProxy(CollectionFactory, [
            tokenERC721.address,
            tokenERC1155.address,
            admin.address,
            ZERO_ADDRESS,
            ZERO_ADDRESS,
        ]);

        MTVSManager = await ethers.getContractFactory("MetaversusManager");
        mtvsManager = await upgrades.deployProxy(MTVSManager, [
            tokenMintERC721.address,
            tokenMintERC1155.address,
            token.address,
            treasury.address,
            mkpManager.address,
            collectionFactory.address,
            admin.address,
        ]);

        await admin.connect(owner).setAdmin(mtvsManager.address, true);
        await admin.setPermittedPaymentToken(token.address, true);
        await admin.setPermittedPaymentToken(constants.ZERO_ADDRESS, true);
        await admin.setMetaCitizen(metaCitizen.address);

        await orderManager.setPause(false);
        await mtvsManager.setPause(false);
        await mkpManager.setPause(false);

        await mkpManager.setTreasury(treasury.address);
        await mkpManager.setMetaversusManager(mtvsManager.address);
        await mkpManager.setOrderManager(orderManager.address);
        merkleTree = generateMerkleTree([user1.address, user2.address]);
        rootHash = merkleTree.getHexRoot();
    });

    describe("Deployment:", async () => {
        it("Should revert when invalid admin contract address", async () => {
            await expect(upgrades.deployProxy(MkpManager, [treasury.address, constants.ZERO_ADDRESS])).to.revertedWith(
                "Invalid Admin contract"
            );
            await expect(upgrades.deployProxy(MkpManager, [treasury.address, user1.address])).to.revertedWith(
                "Invalid Admin contract"
            );
            await expect(upgrades.deployProxy(MkpManager, [treasury.address, treasury.address])).to.revertedWith(
                "Invalid Admin contract"
            );
        });

        it("Should revert when invalid treasury contract address", async () => {
            await expect(upgrades.deployProxy(MkpManager, [constants.ZERO_ADDRESS, admin.address])).to.revertedWith(
                "Invalid Treasury contract"
            );
            await expect(upgrades.deployProxy(MkpManager, [user1.address, admin.address])).to.revertedWith(
                "Invalid Treasury contract"
            );
            await expect(upgrades.deployProxy(MkpManager, [mkpManager.address, admin.address])).to.revertedWith(
                "Invalid Treasury contract"
            );
        });

        it("Check all address token were set: ", async () => {
            const mkpManager = await upgrades.deployProxy(MkpManager, [treasury.address, admin.address]);

            expect(await mkpManager.admin()).to.equal(admin.address);
            expect(await mkpManager.metaversusManager()).to.equal(constants.ZERO_ADDRESS);
            expect(await mkpManager.treasury()).to.equal(treasury.address);
            expect(await mkpManager.listingFee()).to.equal(25e2);
            expect(await mkpManager.orderManager()).to.equal(constants.ZERO_ADDRESS);
            expect(await mkpManager.DENOMINATOR()).to.equal(1e5);
        });
    });

    describe("setTreasury function:", async () => {
        beforeEach(async () => {
            mkpManager = await upgrades.deployProxy(MkpManager, [treasury.address, admin.address]);
        });

        it("Only admin can call this function", async () => {
            await expect(mkpManager.connect(user1).setTreasury(treasury.address)).to.revertedWith(
                "Caller is not an owner or admin"
            );
        });

        it("should revert when Invalid Treasury contract", async () => {
            await expect(mkpManager.setTreasury(constants.ZERO_ADDRESS)).to.revertedWith("Invalid Treasury contract");
            await expect(mkpManager.setTreasury(user1.address)).to.revertedWith("Invalid Treasury contract");
            await expect(mkpManager.setTreasury(mkpManager.address)).to.revertedWith("Invalid Treasury contract");
        });

        it("should set treasury success: ", async () => {
            expect(await mkpManager.treasury()).to.equal(constants.ZERO_ADDRESS);

            await mkpManager.setTreasury(treasury.address);
            expect(await mkpManager.treasury()).to.equal(treasury.address);
        });
    });

    describe("setMetaversusManager function:", async () => {
        beforeEach(async () => {
            mkpManager = await upgrades.deployProxy(MkpManager, [treasury.address, admin.address]);
        });

        it("Only admin can call this function", async () => {
            await expect(mkpManager.connect(user1).setMetaversusManager(mtvsManager.address)).to.revertedWith(
                "Caller is not an owner or admin"
            );
        });

        it("should revert when Invalid MetaversusManager contract", async () => {
            await expect(mkpManager.setMetaversusManager(constants.ZERO_ADDRESS)).to.revertedWith(
                "Invalid MetaversusManager contract"
            );
            await expect(mkpManager.setMetaversusManager(user1.address)).to.revertedWith(
                "Invalid MetaversusManager contract"
            );
            await expect(mkpManager.setMetaversusManager(mkpManager.address)).to.revertedWith(
                "Invalid MetaversusManager contract"
            );
        });

        it("should set MetaversusManager success: ", async () => {
            expect(await mkpManager.metaversusManager()).to.equal(constants.ZERO_ADDRESS);

            await mkpManager.setMetaversusManager(mtvsManager.address);
            expect(await mkpManager.metaversusManager()).to.equal(mtvsManager.address);
        });
    });

    describe("setOrder function:", async () => {
        beforeEach(async () => {
            mkpManager = await upgrades.deployProxy(MkpManager, [treasury.address, admin.address]);
        });

        it("Only admin can call this function", async () => {
            await expect(mkpManager.connect(user1).setOrderManager(orderManager.address)).to.revertedWith(
                "Caller is not an owner or admin"
            );
        });

        it("should revert when Invalid Order contract", async () => {
            await expect(mkpManager.setOrderManager(constants.ZERO_ADDRESS)).to.revertedWith("Invalid Order contract");
            await expect(mkpManager.setOrderManager(user1.address)).to.revertedWith("Invalid Order contract");
            await expect(mkpManager.setOrderManager(mkpManager.address)).to.revertedWith("Invalid Order contract");
        });

        it("should set MetaversusManager success: ", async () => {
            expect(await mkpManager.orderManager()).to.equal(constants.ZERO_ADDRESS);

            await mkpManager.setOrderManager(orderManager.address);
            expect(await mkpManager.orderManager()).to.equal(orderManager.address);
        });
    });

    describe("extTransferNFTCall function:", async () => {
        it("Only order contract can call this function", async () => {
            await expect(
                mkpManager
                    .connect(user1)
                    .extTransferNFTCall(tokenERC721.address, 1, 1, mkpManager.address, user1.address)
            ).to.revertedWith("Caller is not an order manager");
        });

        // TODO
        it("should be ok: ", async () => {
            throw "Not implement yet";
        });
    });

    describe("extTransferCall function:", async () => {
        it("Only order contract can call this function", async () => {
            await expect(
                mkpManager
                    .connect(user1)
                    .extTransferCall(token.address, parseEther("1"), mkpManager.address, user1.address)
            ).to.revertedWith("Caller is not an order manager");
        });

        // TODO
        it("should be ok: ", async () => {
            throw "Not implement yet";
        });
    });

    describe("extCreateMarketInfo function:", async () => {
        beforeEach(async () => {
            current = await getCurrentTime();
        });

        it("Only Metaversus Manger or Order contract can call this function", async () => {
            await expect(
                mkpManager
                    .connect(user1)
                    .extCreateMarketInfo(
                        tokenERC721.address,
                        1,
                        1,
                        parseEther("1"),
                        user1.address,
                        current,
                        add(current, 600),
                        token.address,
                        rootHash
                    )
            ).to.revertedWith("Caller is not a metaversus manager or order manager");
        });

        // TODO
        it("should be ok: ", async () => {
            throw "Not implement yet";
        });
    });

    describe("setNewRootHash function:", async () => {
        beforeEach(async () => {
            newMerkleTree = generateMerkleTree([user1.address, user3.address]);
            newRootHash = newMerkleTree.getHexRoot();
        });

        it("Only admin can call this function", async () => {
            await expect(mkpManager.connect(user1).setNewRootHash(rootHash, newRootHash)).to.revertedWith(
                "Caller is not an owner or admin"
            );
        });

        // TODO
        it("should be ok: ", async () => {
            throw "Not implement yet";
        });
    });

    describe("getLatestMarketItem function:", async () => {
        beforeEach(async () => {
            await token.mint(user1.address, ONE_ETHER);
            await token.mint(owner.address, ONE_ETHER);
            await token.connect(user1).approve(mtvsManager.address, ethers.constants.MaxUint256);

            startTime = add(await getCurrentTime(), 10);
            endTime = add(await getCurrentTime(), 60);
        });

        it("should be ok: ", async () => {
            let data = await mkpManager.getLatestMarketItem();
            expect(data.startTime).to.equal(0);
            expect(data.endTime).to.equal(0);

            await mtvsManager
                .connect(user1)
                .createNFT(true, NFT_TYPE721, 1, "uri", parseEther("1"), startTime, endTime, token.address, rootHash);

            data = await mkpManager.getLatestMarketItem();
            expect(data.startTime).to.equal(startTime);
            expect(data.endTime).to.equal(endTime);
        });
    });

    describe("fetchMarketItemsByMarketID function:", async () => {
        it("should return market item corresponding market ID", async () => {
            await token.mint(user1.address, multiply(1000, ONE_ETHER));
            await token.mint(user2.address, multiply(1000, ONE_ETHER));

            await token.connect(user1).approve(nftTest.address, ethers.constants.MaxUint256);

            await nftTest.connect(user1).buy("this_uri");
            await nftTest.connect(user1).approve(mkpManager.address, 1);

            let current = await getCurrentTime();

            await orderManager
                .connect(user1)
                .sell(
                    nftTest.address,
                    1,
                    1,
                    ONE_ETHER,
                    add(current, 100),
                    add(current, ONE_WEEK),
                    token.address,
                    rootHash
                );

            const fetchId721 = await mkpManager.fetchMarketItemsByMarketID(1);
            expect(fetchId721.price.toString()).to.equal(ONE_ETHER);
        });
    });

    describe("getCurrentMarketItem function:", async () => {
        it("should return current market item id", async () => {
            await token.mint(user1.address, multiply(1000, ONE_ETHER));
            await token.mint(user2.address, multiply(1000, ONE_ETHER));

            await token.connect(user1).approve(nftTest.address, ethers.constants.MaxUint256);

            await nftTest.connect(user1).buy("this_uri");
            await nftTest.connect(user1).approve(mkpManager.address, 1);

            let current = await getCurrentTime();

            expect(await mkpManager.getCurrentMarketItem()).to.equal(0);

            await orderManager
                .connect(user1)
                .sell(
                    nftTest.address,
                    1,
                    1,
                    ONE_ETHER,
                    add(current, 100),
                    add(current, ONE_WEEK),
                    token.address,
                    rootHash
                );

            expect(await mkpManager.getCurrentMarketItem()).to.equal(1);
        });
    });

    describe("wasBuyer function:", async () => {
        it("should return current market item id", async () => {
            await token.mint(user1.address, parseEther("1000"));
            await token.mint(user2.address, parseEther("1000"));

            await token.connect(user1).approve(nftTest.address, ethers.constants.MaxUint256);
            await token.connect(user2).approve(orderManager.address, ethers.constants.MaxUint256);

            await nftTest.connect(user1).buy("this_uri");
            await nftTest.connect(user1).approve(mkpManager.address, 1);

            const startTime = (await getCurrentTime()) + 10;
            const endTime = (await getCurrentTime()) + ONE_WEEK;

            await orderManager
                .connect(user1)
                .sell(nftTest.address, 1, 1, ONE_ETHER, startTime, endTime, token.address, rootHash);
            const marketItemId = await mkpManager.getCurrentMarketItem();

            expect(await mkpManager.wasBuyer(user2.address), false);
            await skipTime(10);
            await metaCitizen.mint(user2.address);
            await orderManager.connect(user2).buy(marketItemId, merkleTree.getHexProof(generateLeaf(user2.address)));

            expect(await mkpManager.wasBuyer(user2.address), true);
        });
    });

    describe("getRoyaltyInfo function:", async () => {
        it("should return royalty with corresponding address", async () => {
            throw "Not implement yet";
        });
    });

    describe("isPermittedPaymentToken function:", async () => {
        it("should check permitted token", async () => {
            admin.setPermittedPaymentToken(token.address, false);
            expect(await mkpManager.isPermittedPaymentToken(token.address), false);
            admin.setPermittedPaymentToken(token.address, true);
            expect(await mkpManager.isPermittedPaymentToken(token.address), true);
        });
    });

    describe("getListingFee function:", async () => {
        it("should return listingFee: ", async () => {
            expect(await mkpManager.getListingFee(1e5)).to.equal(2500);
        });
    });

    describe("checkStandard function:", async () => {
        it("should return type of NFT: ", async () => {
            const data_721 = await mkpManager.checkStandard(tokenMintERC721.address);
            expect(data_721).to.equal(0);
            const data_1155 = await mkpManager.checkStandard(tokenMintERC1155.address);
            expect(data_1155).to.equal(1);
        });
    });

    describe("isRoyalty function:", async () => {
        it("should check royalty: ", async () => {
            expect(tokenERC721.address).to.equal(false);
        });
    });

    describe("getMarketItemIdToMarketItem function:", async () => {
        it("should be return market item", async () => {
            await token.mint(user1.address, parseEther("1000"));
            await token.mint(user2.address, parseEther("1000"));

            await token.connect(user1).approve(nftTest.address, ethers.constants.MaxUint256);
            await token.connect(user2).approve(orderManager.address, ethers.constants.MaxUint256);

            await nftTest.connect(user1).buy("this_uri");
            await nftTest.connect(user1).approve(mkpManager.address, 1);

            const startTime = (await getCurrentTime()) + 10;
            const endTime = (await getCurrentTime()) + ONE_WEEK;

            await orderManager
                .connect(user1)
                .sell(nftTest.address, 1, 1, ONE_ETHER, startTime, endTime, token.address, rootHash);
            const marketItemId = await mkpManager.getCurrentMarketItem();

            const marketItem = await mkpManager.getMarketItemIdToMarketItem(marketItemId);
            expect(marketItem.startTime).to.equal(startTime);
            expect(marketItem.endTime).to.equal(endTime);
        });
    });

    describe("sellAvailableInMarketplace function:", async () => {
        it("should revert when market Item ID invalid: ", async () => {
            let startTime = (await getCurrentTime()) + 100;
            let endTime = (await getCurrentTime()) + ONE_WEEK;

            await mtvsManager
                .connect(user1)
                .createNFT(true, NFT_TYPE721, 1, "uri", parseEther("1"), startTime, endTime, token.address, rootHash);

            await skipTime(endTime - startTime);

            await expect(
                orderManager.connect(user1).sellAvailableInMarketplace(0, 1, 1, ONE_WEEK, ONE_WEEK, token.address)
            ).to.be.revertedWith("ERROR: sender is not owner this NFT");
        });
        it("should revert when price equal to zero: ", async () => {
            await token.mint(user1.address, ONE_ETHER);
            await token.mint(owner.address, ONE_ETHER);
            await token.connect(user1).approve(mtvsManager.address, ethers.constants.MaxUint256);

            const current = await getCurrentTime();
            const typeNft = 0; // ERC721
            const amount = 1;
            const uri = "this_uri";
            const price = 1000;
            const startTime = 0;
            const endTime = 0;

            await mtvsManager
                .connect(user1)
                .createNFT(typeNft, amount, uri, price, startTime, endTime, token.address, rootHash);
            await expect(
                orderManager.sellAvailableInMarketplace(1, 0, 1, current, current + ONE_WEEK, token.address)
            ).to.be.revertedWith("Invalid amount");
        });
        it("should revert when caller is not owner: ", async () => {
            await token.mint(user1.address, ONE_ETHER);
            await token.mint(owner.address, ONE_ETHER);
            await token.approve(user1.address, ethers.constants.MaxUint256);
            await token.connect(user1).approve(mtvsManager.address, ethers.constants.MaxUint256);

            const current = await getCurrentTime();
            const typeNft = 0; // ERC721
            const amount = 1;
            const uri = "this_uri";
            const price = 1000;
            const startTime = 0;
            const endTime = 0;

            await mtvsManager
                .connect(user1)
                .createNFT(typeNft, amount, uri, price, startTime, endTime, token.address, rootHash);
            await expect(
                orderManager.sellAvailableInMarketplace(1, price + 1000, 1, current, current + ONE_WEEK, token.address)
            ).to.be.revertedWith("ERROR: sender is not owner this NFT");
        });
        it("should sellAvailableInMarketplace success and return marketItemId: ", async () => {
            await token.mint(user1.address, ONE_ETHER);
            await token.mint(owner.address, ONE_ETHER);
            await token.approve(user1.address, ethers.constants.MaxUint256);
            await token.connect(user1).approve(mtvsManager.address, ethers.constants.MaxUint256);

            let typeNft = 0; // ERC721
            let amount = 1;
            let uri = "this_uri";
            let price = 1000;
            let startTime = 0;
            let endTime = 0;

            await mtvsManager
                .connect(user1)
                .createNFT(typeNft, amount, uri, price, startTime, endTime, token.address, rootHash);

            const latest_1 = await mkpManager.getLatestMarketItemByTokenId(tokenMintERC721.address, 1);
            const current = await getCurrentTime();
            await orderManager
                .connect(user1)
                .sellAvailableInMarketplace(
                    latest_1[0].marketItemId.toString(),
                    10005,
                    amount,
                    current,
                    add(current, ONE_WEEK),
                    token.address
                );
            const data_ERC721 = await mkpManager.fetchMarketItemsByMarketID(latest_1[0].marketItemId.toString());
            expect(data_ERC721.price).to.equal(10005);
            // ERC1155
            typeNft = 1;
            amount = 100;
            uri = "this_uri";
            price = 1000;
            startTime = 0;
            endTime = 0;
            rootHash = ethers.utils.formatBytes32String("roothash");
            await mtvsManager
                .connect(user1)
                .createNFT(typeNft, amount, uri, price, startTime, endTime, token.address, rootHash);
            const latest_2 = await mkpManager.getLatestMarketItemByTokenId(tokenMintERC1155.address, 1);
            await orderManager
                .connect(user1)
                .sellAvailableInMarketplace(
                    latest_2[0].marketItemId.toString(),
                    100056,
                    amount,
                    current,
                    add(current, ONE_WEEK),
                    token.address
                );
            const data_ERC1155 = await mkpManager.fetchMarketItemsByMarketID(latest_2[0].marketItemId.toString());

            expect(data_ERC1155.price).to.equal(100056);
            expect(data_ERC1155.amount).to.equal(100);
        });
    });

    describe("sell function:", async () => {
        it("should revert when nft contract enot allow to sell: ", async () => {
            const current = await getCurrentTime();

            await expect(
                orderManager.sell(
                    constants.ZERO_ADDRESS,
                    0,
                    100,
                    100,
                    current,
                    add(current, ONE_WEEK),
                    token.address,
                    rootHash
                )
            ).to.be.revertedWith("ERROR: NFT address is compatible !");
        });
        it("should revert when nft contract equal to zero address: ", async () => {
            const current = await getCurrentTime();
            await expect(
                orderManager.sell(
                    tokenMintERC721.address,
                    0,
                    0,
                    100,
                    current,
                    add(current, ONE_WEEK),
                    token.address,
                    rootHash
                )
            ).to.be.revertedWith("Invalid amount");
        });
        it("should revert when gross sale value equal to zero: ", async () => {
            const current = await getCurrentTime();
            await expect(
                orderManager.sell(
                    tokenMintERC721.address,
                    0,
                    100,
                    0,
                    current,
                    add(current, ONE_WEEK),
                    token.address,
                    rootHash
                )
            ).to.be.revertedWith("Invalid amount");
        });
        it("should revert ERROR: NFT not allow to sell on marketplace !", async () => {
            await token.mint(user1.address, ONE_ETHER);

            await token.connect(user1).approve(tokenMintERC721.address, ethers.constants.MaxUint256);

            const current = await getCurrentTime();

            await expect(
                orderManager
                    .connect(user1)
                    .sell(treasury.address, 1, 1, 1000, current, add(current, ONE_WEEK), token.address, rootHash)
            ).to.be.revertedWith("ERROR: NFT address is compatible !");
        });
        it("should sell success : ", async () => {
            await token.mint(user1.address, ONE_ETHER);

            await token.connect(user1).approve(nftTest.address, ethers.constants.MaxUint256);

            await nftTest.connect(user1).buy("this_uri");

            await nftTest.connect(user1).approve(orderManager.address, 1);
            const current = await getCurrentTime();

            await orderManager
                .connect(user1)
                .sell(nftTest.address, 1, 1, 1000, add(current, 100), add(current, ONE_WEEK), token.address, rootHash);

            const ownerrr = await nftTest.balanceOf(orderManager.address);
            const ownerrr1 = await nftTest.balanceOf(mkpManager.address);

            const marketInfo = await mkpManager.getLatestMarketItemByTokenId(nftTest.address, 1);
            expect(marketInfo[0].price.toString()).to.equal("1000");
        });
    });

    describe("cancelSell function:", async () => {
        it("should revert when market ID not exist: ", async () => {
            await expect(orderManager.cancelSell(123)).to.be.revertedWith("ERROR: you are not the seller !");
        });
        it("should revert when caller is not seller: ", async () => {
            await token.mint(user1.address, ONE_ETHER);

            await token.connect(user1).approve(nftTest.address, ethers.constants.MaxUint256);

            await nftTest.connect(user1).buy("this_uri");

            await nftTest.connect(user1).approve(orderManager.address, 1);

            const curent = await getCurrentTime();
            await orderManager
                .connect(user1)
                .sell(nftTest.address, 1, 1, 1000, add(curent, 100), add(curent, ONE_ETHER), token.address, rootHash);

            await expect(orderManager.cancelSell(1)).to.be.revertedWith("ERROR: you are not the seller !");
        });
        it("should cancel sell success: ", async () => {
            await token.mint(user1.address, "1000000000000000000000000000000");

            await token.connect(user1).approve(mkpManager.address, ethers.constants.MaxUint256);
            await token.connect(user1).approve(nftTest.address, ethers.constants.MaxUint256);

            await nftTest.connect(user1).buy("this_uri");

            await nftTest.connect(user1).approve(orderManager.address, 1);
            const curent = await getCurrentTime();

            await orderManager
                .connect(user1)
                .sell(nftTest.address, 1, 1, 1000, add(curent, 100), add(curent, ONE_ETHER), token.address, rootHash);

            await expect(() => orderManager.connect(user1).cancelSell(1)).to.changeTokenBalance(nftTest, user1, 1);
        });
    });

    describe("buy function:", async () => {
        it("should revert when market ID not exist: ", async () => {
            await expect(orderManager.buy(0, [])).to.be.revertedWith("ERROR: NFT is not selling");
            await expect(orderManager.buy(123, [])).to.be.revertedWith("ERROR: NFT is not selling");
        });

        it("should buy success: ", async () => {
            await token.mint(user1.address, ONE_ETHER);
            await token.mint(user2.address, ONE_ETHER);

            await token.connect(user1).approve(tokenMintERC721.address, ethers.constants.MaxUint256);
            await token.connect(user2).approve(orderManager.address, ethers.constants.MaxUint256);
            await token.connect(user1).approve(nftTest.address, ethers.constants.MaxUint256);

            await token.connect(user2).approve(treasury.address, ethers.constants.MaxUint256);

            await nftTest.connect(user1).buy("this_uri");

            await nftTest.connect(user1).approve(orderManager.address, 1);

            let current = await getCurrentTime();

            await orderManager
                .connect(user1)
                .sell(
                    nftTest.address,
                    1,
                    1,
                    ONE_ETHER,
                    add(current, 100),
                    add(current, ONE_WEEK),
                    token.address,
                    rootHash
                );

            await skipTime(4800);
            current = await getCurrentTime();

            const leaf = keccak256(user2.address);
            const proof = merkleTree.getHexProof(leaf);
            await orderManager.connect(user2).buy(1, proof);
            // ).to.changeTokenBalance(nftTest, user2, 1);
            const valueNotListingFee = multiply(0.025, ONE_ETHER);
            expect(await token.balanceOf(treasury.address)).to.equal(
                add(TOTAL_SUPPLY, add(PRICE, subtract(valueNotListingFee, multiply(valueNotListingFee, 0.025))))
            );
        });
    });

    describe("makeOfferWalletAsset function", async () => {
        it("should revert when payment token is not allowed", async () => {
            const current = await getCurrentTime();
            await token.mint(owner.address, ONE_ETHER);
            await token.approve(mkpManager.address, ONE_ETHER);
            await expect(
                orderManager.makeOfferWalletAsset(
                    tokenMintERC721.address,
                    ONE_ETHER,
                    user1.address,
                    tokenMintERC721.address,
                    1,
                    1,
                    add(current, ONE_WEEK)
                )
            ).to.be.revertedWith("ERROR: payment token is not supported !");
        });
        it("should make offer in wallet success ", async () => {
            const current = await getCurrentTime();
            await token.mint(user1.address, ONE_ETHER.mul(1000));
            await token.connect(user1).approve(orderManager.address, ONE_ETHER.mul(1000));

            await expect(() =>
                orderManager
                    .connect(user1)
                    .makeOfferWalletAsset(
                        token.address,
                        ONE_ETHER,
                        user2.address,
                        tokenMintERC721.address,
                        1,
                        1,
                        add(current, ONE_WEEK),
                        { value: 0 }
                    )
            ).to.changeTokenBalance(token, user1, ONE_ETHER.mul(-1));
            const offerOrder = await mkpManager.getOfferOrderOfBidder(user1.address);

            expect(offerOrder.length).to.greaterThan(0);
        });
        it("should MOVE offer in wallet to marketplace success ", async () => {
            const current = await getCurrentTime();

            await token.mint(user1.address, ONE_ETHER);

            await token.connect(user1).approve(nftTest.address, ethers.constants.MaxUint256);

            await nftTest.connect(user1).buy("this_uri");

            await token.mint(user2.address, ONE_ETHER);
            await token.connect(user2).approve(orderManager.address, ONE_ETHER);
            await expect(() =>
                orderManager
                    .connect(user2)
                    .makeOfferWalletAsset(
                        token.address,
                        ONE_ETHER,
                        user1.address,
                        nftTest.address,
                        1,
                        1,
                        add(current, ONE_WEEK)
                    )
            ).to.changeTokenBalance(token, user2, ONE_ETHER.mul(-1));

            await nftTest.connect(user1).approve(orderManager.address, 1);

            await orderManager
                .connect(user1)
                .sell(nftTest.address, 1, 1, 1000, add(current, 100), add(current, ONE_WEEK), token.address, rootHash);

            const list = await mkpManager.getOfferOrderOfBidder(user2.address);
            expect(list[0].marketItemId).to.equal(1);
        });
        it("should MOVE offer in marketplace to wallet success when cancel", async () => {
            const current = await getCurrentTime();
            await token.mint(user1.address, ONE_ETHER.mul(1000));
            await token.mint(user2.address, ONE_ETHER.mul(1000));
            await token.mint(user3.address, ONE_ETHER.mul(1000));
            await token.connect(user1).approve(nftTest.address, ethers.constants.MaxUint256);

            await nftTest.connect(user1).buy("this_uri");

            await token.connect(user2).approve(orderManager.address, ONE_ETHER.mul(1000));
            await token.connect(user3).approve(orderManager.address, ONE_ETHER.mul(1000));
            await expect(() =>
                orderManager
                    .connect(user2)
                    .makeOfferWalletAsset(
                        token.address,
                        ONE_ETHER,
                        user1.address,
                        nftTest.address,
                        1,
                        1,
                        add(current, ONE_WEEK)
                    )
            ).to.changeTokenBalance(token, user2, ONE_ETHER.mul(-1));
            const acidư = await mkpManager.getOfferOrderOfBidder(user2.address);
            await nftTest.connect(user1).approve(orderManager.address, 1);

            await orderManager
                .connect(user1)
                .sell(nftTest.address, 1, 1, 1000, add(current, 100), add(current, ONE_WEEK), token.address, rootHash);

            await expect(() =>
                orderManager.connect(user3).makeOffer(1, token.address, ONE_ETHER, add(current, ONE_WEEK))
            ).to.changeTokenBalance(token, user3, ONE_ETHER.mul(-1));

            const acidb = await mkpManager.getOfferOrderOfBidder(user2.address);
            const acidb3 = await mkpManager.getOfferOrderOfBidder(user3.address);
            await orderManager.connect(user1).cancelSell(1);
            const acid = await mkpManager.getOfferOrderOfBidder(user2.address);
            const acidb33 = await mkpManager.getOfferOrderOfBidder(user3.address);
        });

        it("should replace make offer before with token", async () => {
            const current = await getCurrentTime();
            await token.mint(user1.address, ONE_ETHER.mul(1000));
            await token.mint(user2.address, ONE_ETHER.mul(1000));

            await token.connect(user1).approve(nftTest.address, ethers.constants.MaxUint256);

            await nftTest.connect(user1).buy("this_uri");

            await token.mint(user2.address, ONE_ETHER.mul(10000));
            await token.connect(user2).approve(orderManager.address, ONE_ETHER.mul(10000));
            await expect(() =>
                orderManager
                    .connect(user2)
                    .makeOfferWalletAsset(
                        token.address,
                        ONE_ETHER,
                        user1.address,
                        nftTest.address,
                        1,
                        1,
                        add(current, ONE_WEEK)
                    )
            ).to.changeTokenBalance(token, user2, ONE_ETHER.mul(-1));

            await expect(() =>
                orderManager
                    .connect(user2)
                    .makeOfferWalletAsset(
                        token.address,
                        ONE_ETHER.mul(2),
                        user1.address,
                        nftTest.address,
                        1,
                        1,
                        add(current, ONE_WEEK)
                    )
            ).to.changeTokenBalance(token, user2, ONE_ETHER.mul(-1));
            await expect(() =>
                orderManager
                    .connect(user2)
                    .makeOfferWalletAsset(
                        token.address,
                        ONE_ETHER,
                        user1.address,
                        nftTest.address,
                        1,
                        1,
                        add(current, ONE_WEEK)
                    )
            ).to.changeTokenBalance(token, user2, ONE_ETHER);

            const list = await mkpManager.getOfferOrderOfBidder(user2.address);
            expect(list[0].marketItemId).to.equal(0);
            expect(list.length).to.equal(1);
        });
    });

    describe("makeOffer function", async () => {
        it("should revert when payment token is not allowed", async () => {
            await token.mint(user1.address, ONE_ETHER);

            await token.connect(user1).approve(nftTest.address, ethers.constants.MaxUint256);

            await nftTest.connect(user1).buy("this_uri");

            await nftTest.connect(user1).approve(orderManager.address, 1);
            const current = await getCurrentTime();

            await orderManager
                .connect(user1)
                .sell(nftTest.address, 1, 1, 1000, add(current, 100), add(current, ONE_WEEK), token.address, rootHash);

            await token.mint(owner.address, ONE_ETHER);
            await token.approve(orderManager.address, ONE_ETHER);
            await expect(
                orderManager.makeOffer(1, tokenMintERC721.address, ONE_ETHER, add(current, ONE_WEEK))
            ).to.be.revertedWith("ERROR: payment token is not supported !");
        });

        it("should make offer in marketplace success", async () => {
            await token.mint(user1.address, ONE_ETHER);

            await token.connect(user1).approve(nftTest.address, ethers.constants.MaxUint256);

            await nftTest.connect(user1).buy("this_uri");

            await nftTest.connect(user1).approve(orderManager.address, 1);
            const current = await getCurrentTime();

            await orderManager
                .connect(user1)
                .sell(nftTest.address, 1, 1, 1000, add(current, 100), add(current, ONE_WEEK), token.address, rootHash);

            await token.mint(user1.address, ONE_ETHER);
            await token.connect(user1).approve(orderManager.address, ONE_ETHER);
            await expect(() =>
                orderManager.connect(user1).makeOffer(1, token.address, ONE_ETHER, add(current, ONE_WEEK))
            ).to.changeTokenBalance(token, user1, ONE_ETHER.mul(-1));

            const offerOrder = await mkpManager.getOfferOrderOfBidder(user1.address);

            expect(offerOrder.length).to.greaterThan(0);
        });

        it("should make offer with native success", async () => {
            await token.mint(user1.address, ONE_ETHER.mul(1000));
            await token.mint(user2.address, ONE_ETHER.mul(1000));

            await token.connect(user1).approve(nftTest.address, ethers.constants.MaxUint256);

            await nftTest.connect(user1).buy("this_uri");

            await nftTest.connect(user1).approve(orderManager.address, 1);
            const current = await getCurrentTime();

            await orderManager
                .connect(user1)
                .sell(
                    nftTest.address,
                    1,
                    1,
                    ONE_ETHER,
                    add(current, 100),
                    add(current, ONE_WEEK),
                    constants.ZERO_ADDRESS,
                    rootHash
                );

            await skipTime(1000);

            const leaf = keccak256(user2.address);
            const proof = merkleTree.getHexProof(leaf);
            const txx = await orderManager.connect(user2).buy(1, proof, { value: ONE_ETHER });
            const log = await txx.wait();
        });

        it("should replace make offer before with native success", async () => {
            await token.mint(user1.address, ONE_ETHER.mul(1000));
            await token.mint(user2.address, ONE_ETHER.mul(1000));

            await token.connect(user1).approve(nftTest.address, ethers.constants.MaxUint256);

            await nftTest.connect(user1).buy("this_uri");

            await nftTest.connect(user1).approve(orderManager.address, 1);
            const current = await getCurrentTime();

            await orderManager
                .connect(user1)
                .sell(
                    nftTest.address,
                    1,
                    1,
                    1000,
                    add(current, 100),
                    add(current, ONE_WEEK),
                    constants.ZERO_ADDRESS,
                    rootHash
                );

            await token.mint(user2.address, ONE_ETHER);
            await token.connect(user2).approve(mkpManager.address, ONE_ETHER);

            await orderManager.connect(user2).makeOffer(1, constants.ZERO_ADDRESS, ONE_ETHER, add(current, ONE_WEEK), {
                value: ONE_ETHER.toString(),
            });

            await orderManager
                .connect(user2)
                .makeOffer(1, constants.ZERO_ADDRESS, ONE_ETHER.mul(2), add(current, ONE_WEEK), {
                    value: ONE_ETHER.toString(),
                });

            await orderManager.connect(user2).makeOffer(1, constants.ZERO_ADDRESS, ONE_ETHER, add(current, ONE_WEEK), {
                value: 0,
            });

            const offerOrder = await mkpManager.getOfferOrderOfBidder(user2.address);

            expect(offerOrder.length).to.equal(1);
        });
    });

    describe("acceptOfferWalletAsset function", async () => {
        it("should revert when caller is not owner asset", async () => {
            const current = await getCurrentTime();
            await token.mint(user1.address, ONE_ETHER);
            await token.connect(user1).approve(orderManager.address, ONE_ETHER);
            await expect(() =>
                orderManager
                    .connect(user1)
                    .makeOfferWalletAsset(
                        token.address,
                        ONE_ETHER,
                        user2.address,
                        tokenMintERC721.address,
                        1,
                        1,
                        add(current, ONE_WEEK),
                        { value: 0 }
                    )
            ).to.changeTokenBalance(token, user1, ONE_ETHER.mul(-1));

            // const current = await getCurrentTime();
            // const list = await mkpManager.getOfferOrderOfBidder(user1.address);

            await expect(orderManager.acceptOffer(1)).to.be.revertedWith("ERROR: Invalid owner of asset !");
        });
        it("should accept offer success", async () => {
            const current = await getCurrentTime();
            await token.mint(user2.address, multiply(1000, ONE_ETHER));
            await token.connect(user2).approve(mtvsManager.address, ethers.constants.MaxUint256);
            await token.connect(user2).approve(nftTest.address, ethers.constants.MaxUint256);

            await nftTest.connect(user2).buy("this_uri");

            await token.mint(user1.address, ONE_ETHER);
            await token.connect(user1).approve(orderManager.address, ONE_ETHER);
            await expect(() =>
                orderManager
                    .connect(user1)
                    .makeOfferWalletAsset(
                        token.address,
                        ONE_ETHER,
                        user2.address,
                        nftTest.address,
                        1,
                        1,
                        add(current, ONE_WEEK),
                        { value: 0 }
                    )
            ).to.changeTokenBalance(token, user1, ONE_ETHER.mul(-1));
            await nftTest.connect(user2).approve(orderManager.address, 1);
            await orderManager.connect(user2).acceptOffer(1);

            const list = await mkpManager.getOfferOrderOfBidder(user1.address);
            expect(list.length).to.equal(0);
        });
    });

    describe("acceptOffer function", async () => {
        it("should revert when caller is not owner asset", async () => {
            await token.mint(user2.address, multiply(1000, ONE_ETHER));
            await token.connect(user2).approve(mtvsManager.address, ethers.constants.MaxUint256);
            await token.connect(user2).approve(nftTest.address, ethers.constants.MaxUint256);

            await nftTest.connect(user2).buy("this_uri");
            await nftTest.connect(user2).approve(orderManager.address, 1);
            let current = await getCurrentTime();

            // sell in marketplace
            await orderManager
                .connect(user2)
                .sell(
                    nftTest.address,
                    1,
                    1,
                    ONE_ETHER,
                    add(current, 100),
                    add(current, ONE_WEEK),
                    token.address,
                    rootHash
                );

            await token.mint(user1.address, ONE_ETHER);
            await token.connect(user1).approve(orderManager.address, ONE_ETHER);
            await expect(() =>
                orderManager.connect(user1).makeOffer(1, token.address, ONE_ETHER, add(current, ONE_WEEK))
            ).to.changeTokenBalance(token, user1, ONE_ETHER.mul(-1));

            // const current = await getCurrentTime();
            // const list = await orderManager.getOfferOrderOfBidder(user1.address);

            await expect(orderManager.acceptOffer(1)).to.be.revertedWith("ERROR: Invalid seller of asset !");
        });
        it("should accept offer in marketplace success ", async () => {
            await token.mint(user2.address, multiply(1000, ONE_ETHER));
            await token.connect(user2).approve(mtvsManager.address, ethers.constants.MaxUint256);
            await token.connect(user2).approve(nftTest.address, ethers.constants.MaxUint256);

            await nftTest.connect(user2).buy("this_uri");
            await nftTest.connect(user2).approve(orderManager.address, 1);
            let current = await getCurrentTime();

            // sell in marketplace
            await orderManager
                .connect(user2)
                .sell(
                    nftTest.address,
                    1,
                    1,
                    ONE_ETHER,
                    add(current, 100),
                    add(current, ONE_WEEK),
                    token.address,
                    rootHash
                );

            await token.mint(user1.address, multiply(1000, ONE_ETHER));
            await token.connect(user1).approve(orderManager.address, ONE_ETHER);
            await expect(() =>
                orderManager.connect(user1).makeOffer(1, token.address, ONE_ETHER, add(current, ONE_WEEK))
            ).to.changeTokenBalance(token, user1, ONE_ETHER.mul(-1));

            await orderManager.connect(user2).acceptOffer(1);

            const list = await mkpManager.getOfferOrderOfBidder(user1.address);
            expect(list.length).to.equal(0);
        });
    });

    describe("refundBidAmount function", async () => {
        it("should revert when invalid bidder", async () => {
            const current = await getCurrentTime();
            await token.mint(user2.address, multiply(1000, ONE_ETHER));
            await token.connect(user2).approve(mtvsManager.address, ethers.constants.MaxUint256);
            await token.connect(user2).approve(nftTest.address, ethers.constants.MaxUint256);

            await nftTest.connect(user2).buy("this_uri");

            await token.mint(user1.address, ONE_ETHER);
            await token.connect(user1).approve(orderManager.address, ONE_ETHER);
            await expect(() =>
                orderManager
                    .connect(user1)
                    .makeOfferWalletAsset(
                        token.address,
                        ONE_ETHER,
                        user2.address,
                        nftTest.address,
                        1,
                        1,
                        add(current, ONE_WEEK)
                    )
            ).to.changeTokenBalance(token, user1, ONE_ETHER.mul(-1));

            await expect(orderManager.refundBidAmount(1)).to.be.revertedWith("ERROR: Invalid bidder !");
        });
        it("should refund bid amount success", async () => {
            const current = await getCurrentTime();
            await token.mint(user2.address, multiply(1000, ONE_ETHER));
            await token.connect(user2).approve(mtvsManager.address, ethers.constants.MaxUint256);
            await token.connect(user2).approve(nftTest.address, ethers.constants.MaxUint256);

            await nftTest.connect(user2).buy("this_uri");
            await token.mint(user1.address, ONE_ETHER);
            await token.connect(user1).approve(orderManager.address, ONE_ETHER);
            // await expect(() =>
            orderManager
                .connect(user1)
                .makeOfferWalletAsset(
                    token.address,
                    ONE_ETHER,
                    user2.address,
                    nftTest.address,
                    1,
                    1,
                    add(current, ONE_WEEK)
                );
            // ).to.changeTokenBalance(token, user1, ONE_ETHER.mul(-1));
            await orderManager.connect(user1).refundBidAmount(1);
            const list = await mkpManager.getOfferOrderOfBidder(user1.address);

            expect(list.length).to.equal(0); // Claimed
        });
    });

    describe("getOfferOrderOfBidder function", async () => {
        it("should return offer list of bidder", async () => {
            const current = await getCurrentTime();
            await token.mint(user2.address, multiply(1000, ONE_ETHER));
            await token.connect(user2).approve(mtvsManager.address, ethers.constants.MaxUint256);
            await token.connect(user2).approve(nftTest.address, ethers.constants.MaxUint256);

            await nftTest.connect(user2).buy("this_uri");
            await token.mint(user1.address, ONE_ETHER);
            await token.connect(user1).approve(orderManager.address, ONE_ETHER);
            await expect(() =>
                orderManager
                    .connect(user1)
                    .makeOfferWalletAsset(
                        token.address,
                        ONE_ETHER,
                        user2.address,
                        nftTest.address,
                        1,
                        1,
                        add(current, ONE_WEEK)
                    )
            ).to.changeTokenBalance(token, user1, ONE_ETHER.mul(-1));
            // await mkpManager.connect(user1).refundBidAmount(1);
            const list = await mkpManager.getOfferOrderOfBidder(user1.address);
            expect(list.length).to.greaterThan(0);
        });
    });

    describe("fetchAvailableMarketItems function:", async () => {
        it("should return all market items in marketplace: ", async () => {
            await token.mint(user1.address, multiply(1000, ONE_ETHER));
            await token.mint(user2.address, multiply(1000, ONE_ETHER));

            await token.connect(user1).approve(tokenMintERC721.address, ethers.constants.MaxUint256);
            await token.connect(user2).approve(tokenMintERC1155.address, ethers.constants.MaxUint256);

            await token.connect(user1).approve(nftTest.address, ethers.constants.MaxUint256);

            await nftTest.connect(user1).buy("this_uri");

            await nftTest.connect(user1).approve(orderManager.address, 1);
            let current = await getCurrentTime();

            await orderManager
                .connect(user1)
                .sell(
                    nftTest.address,
                    1,
                    1,
                    ONE_ETHER,
                    add(current, 100),
                    add(current, ONE_WEEK),
                    token.address,
                    rootHash
                );

            const data721 = await mkpManager.getLatestMarketItemByTokenId(nftTest.address, 1);
            const data = await mkpManager.fetchAvailableMarketItems();
            expect(data[0].marketItemId).to.equal(data721[0].marketItemId);
            expect(data721[0].marketItemId).to.equal(1);
        });
    });

    describe("fetchMarketItemsByAddress function:", async () => {
        it("should return market item corresponding address: ", async () => {
            await token.mint(user1.address, multiply(1000, ONE_ETHER));
            await token.mint(user2.address, multiply(1000, ONE_ETHER));

            await token.connect(user1).approve(tokenMintERC721.address, ethers.constants.MaxUint256);
            await token.connect(user2).approve(tokenMintERC1155.address, ethers.constants.MaxUint256);

            await token.connect(user1).approve(treasury.address, ethers.constants.MaxUint256);
            await token.connect(user2).approve(treasury.address, ethers.constants.MaxUint256);
            await token.connect(user1).approve(nftTest.address, ethers.constants.MaxUint256);

            await nftTest.connect(user1).buy("this_uri");

            await nftTest.connect(user1).approve(orderManager.address, 1);

            const blockNumAfter = await ethers.provider.getBlockNumber();
            const blockAfter = await ethers.provider.getBlock(blockNumAfter);
            let current = blockAfter.timestamp;

            let tx = await orderManager
                .connect(user1)
                .sell(
                    nftTest.address,
                    1,
                    1,
                    ONE_ETHER,
                    add(current, 100),
                    add(current, ONE_WEEK),
                    token.address,
                    rootHash
                );

            const data721 = await mkpManager.getLatestMarketItemByTokenId(nftTest.address, 1);

            expect(data721[0].marketItemId).to.equal(1);

            const dataUser1 = await mkpManager.fetchMarketItemsByAddress(user1.address);
            expect(dataUser1[0].price.toString()).to.equal(ONE_ETHER);
        });
    });

    describe("getListingFee function:", async () => {
        it("Only admin can call this function", async () => {
            await expect(mkpManager.connect(user1).getListingFee(1e5)).to.revertedWith(
                "Caller is not an owner or admin"
            );
        });

        it("should return tuple listingFee: ", async () => {
            expect(await mkpManager.getListingFee(1e5)).to.equal(2500);
        });
    });

    describe("getRoyaltyInfo function:", async () => {
        it("should return correct royalInfo: ", async () => {
            await tokenMintERC721.mint(mkpManager.address, "this_uri");
            const royalInfos = await mkpManager.getRoyaltyInfo(tokenMintERC721.address, 1, 1000000000);

            expect(royalInfos[0].toString()).to.equal(treasury.address);
            expect(royalInfos[1]).to.equal((1000000000 * 250) / 10000);
        });
    });
});
