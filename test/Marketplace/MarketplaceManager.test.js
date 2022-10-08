const { expect } = require("chai");
const { BigNumber } = require("ethers");
const { upgrades, ethers } = require("hardhat");
const { multiply, add, subtract } = require("js-big-decimal");
const { getCurrentTime, skipTime, generateMerkleTree, generateLeaf } = require("../utils");
const { parseEther, formatBytes32String } = ethers.utils;
const { MaxUint256: MAX_UINT_256, AddressZero: ADDRESS_ZERO } = ethers.constants;

const TOTAL_SUPPLY = parseEther("1000000000000");
const PRICE = parseEther("1");
const ONE_ETHER = parseEther("1");
const ONE_WEEK = 604800;
const MINT_FEE = 1000;
const NFT_TYPE721 = 0;
const NFT_TYPE1155 = 1;

describe("Marketplace Manager:", () => {
    beforeEach(async () => {
        [owner, user1, user2, user3, treasury] = await ethers.getSigners();

        Admin = await ethers.getContractFactory("Admin");
        admin = await upgrades.deployProxy(Admin, [owner.address]);

        Treasury = await ethers.getContractFactory("Treasury");
        treasury = await upgrades.deployProxy(Treasury, [admin.address]);

        Token = await ethers.getContractFactory("MTVS");
        token = await upgrades.deployProxy(Token, [
            "Metaversus Token",
            "MTVS",
            TOTAL_SUPPLY,
            owner.address,
        ]);

        await admin.setPermittedPaymentToken(token.address, true);
        await admin.setPermittedPaymentToken(ADDRESS_ZERO, true);

        MetaCitizen = await ethers.getContractFactory("MetaCitizen");
        metaCitizen = await upgrades.deployProxy(MetaCitizen, [
            token.address,
            MINT_FEE,
            admin.address,
        ]);

        TokenMintERC721 = await ethers.getContractFactory("TokenMintERC721");
        tokenMintERC721 = await upgrades.deployProxy(TokenMintERC721, [
            "NFT Metaversus",
            "nMTVS",
            250,
            admin.address,
        ]);

        TokenMintERC1155 = await ethers.getContractFactory("TokenMintERC1155");
        tokenMintERC1155 = await upgrades.deployProxy(TokenMintERC1155, [250, admin.address]);

        NftTest = await ethers.getContractFactory("NftTest");
        nftTest = await upgrades.deployProxy(NftTest, [
            "NFT test",
            "NFT",
            token.address,
            250,
            PRICE,
            admin.address,
        ]);

        MkpManager = await ethers.getContractFactory("MarketPlaceManager");
        mkpManager = await upgrades.deployProxy(MkpManager, [admin.address]);

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
            user3.address,
            user3.address,
        ]);

        MTVSManager = await ethers.getContractFactory("MetaversusManager");
        mtvsManager = await upgrades.deployProxy(MTVSManager, [
            tokenMintERC721.address,
            tokenMintERC1155.address,
            token.address,
            mkpManager.address,
            collectionFactory.address,
            admin.address,
        ]);
        await admin.connect(owner).setAdmin(mtvsManager.address, true);

        await orderManager.setPause(false);
        await mtvsManager.setPause(false);
        await mkpManager.setPause(false);

        await mkpManager.setMetaversusManager(mtvsManager.address);
        await mkpManager.setOrderManager(orderManager.address);
        merkleTree = generateMerkleTree([user1.address, user2.address]);
        rootHash = merkleTree.getHexRoot();
    });

    describe("Deployment:", async () => {
        it("Should revert when invalid admin contract address", async () => {
            await expect(upgrades.deployProxy(MkpManager, [ADDRESS_ZERO])).to.revertedWith(
                "Invalid Admin contract"
            );
            await expect(upgrades.deployProxy(MkpManager, [user1.address])).to.revertedWith(
                "Invalid Admin contract"
            );
            await expect(upgrades.deployProxy(MkpManager, [treasury.address])).to.revertedWith(
                "Invalid Admin contract"
            );
        });
    });

    describe("setMetaversusManager function:", async () => {
        beforeEach(async () => {
            mkpManager = await upgrades.deployProxy(MkpManager, [admin.address]);
        });

        it("Only admin can call this function", async () => {
            await expect(mkpManager.connect(user1).setMetaversusManager(mtvsManager.address)).to.revertedWith(
                "Caller is not an owner or admin"
            );
        });

        it("should revert when Invalid MetaversusManager contract", async () => {
            await expect(mkpManager.setMetaversusManager(ADDRESS_ZERO)).to.revertedWith(
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
            expect(await mkpManager.metaversusManager()).to.equal(ADDRESS_ZERO);

            await mkpManager.setMetaversusManager(mtvsManager.address);
            expect(await mkpManager.metaversusManager()).to.equal(mtvsManager.address);
        });
    });

    describe("setOrder function:", async () => {
        beforeEach(async () => {
            mkpManager = await upgrades.deployProxy(MkpManager, [admin.address]);
        });

        it("Only admin can call this function", async () => {
            await expect(mkpManager.connect(user1).setOrderManager(orderManager.address)).to.revertedWith(
                "Caller is not an owner or admin"
            );
        });

        it("should revert when Invalid Order contract", async () => {
            await expect(mkpManager.setOrderManager(ADDRESS_ZERO)).to.revertedWith("Invalid Order contract");
            await expect(mkpManager.setOrderManager(user1.address)).to.revertedWith("Invalid Order contract");
            await expect(mkpManager.setOrderManager(mkpManager.address)).to.revertedWith("Invalid Order contract");
        });

        it("should set MetaversusManager success: ", async () => {
            expect(await mkpManager.orderManager()).to.equal(ADDRESS_ZERO);

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
    });

    describe("extTransferCall function:", async () => {
        it("Only order contract can call this function", async () => {
            await expect(
                mkpManager
                    .connect(user1)
                    .extTransferCall(token.address, parseEther("1"), mkpManager.address, user1.address)
            ).to.revertedWith("Caller is not an order manager");
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
    });

    describe("setNewRootHash function:", async () => {
        beforeEach(async () => {
            newMerkleTree = generateMerkleTree([user1.address, user3.address]);
            newRootHash = newMerkleTree.getHexRoot();

            await mkpManager.setCollectionFactory(collectionFactory.address);

            await collectionFactory.setPause(false);
            await collectionFactory.connect(user1).create(0, "NFT", "NFT", user1.address, 250);
            collection1 = await collectionFactory.getCollectionInfo(1);
            await collectionFactory.connect(user2).create(0, "NFT", "NFT", user2.address, 250);
            collection2 = await collectionFactory.getCollectionInfo(2);
        });

        it("Only owner can set root hash", async () => {
            await expect(
                mkpManager.connect(user2).setNewRootHash(collection1.collectionAddress, newRootHash)
            ).to.revertedWith("User is not create collection");
        });

        it("should be ok: ", async () => {
            expect(await mkpManager.nftAddressToRootHash(collection1.collectionAddress)).to.equal(
                formatBytes32String("")
            );
            await mkpManager.connect(user1).setNewRootHash(collection1.collectionAddress, newRootHash);
            expect(await mkpManager.nftAddressToRootHash(collection1.collectionAddress)).to.equal(newRootHash);
        });
    });

    describe("getLatestMarketItem function:", async () => {
        beforeEach(async () => {
            await token.transfer(user1.address, ONE_ETHER);
            await token.connect(user1).approve(mtvsManager.address, MAX_UINT_256);

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
            await token.transfer(user1.address, multiply(1000, ONE_ETHER));
            await token.transfer(user2.address, multiply(1000, ONE_ETHER));

            await token.connect(user1).approve(nftTest.address, MAX_UINT_256);

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
            await token.transfer(user1.address, multiply(1000, ONE_ETHER));
            await token.transfer(user2.address, multiply(1000, ONE_ETHER));

            await token.connect(user1).approve(nftTest.address, MAX_UINT_256);

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
            await token.transfer(user1.address, parseEther("1000"));
            await token.transfer(user2.address, parseEther("1000"));

            await token.connect(user1).approve(nftTest.address, MAX_UINT_256);
            await token.connect(user2).approve(orderManager.address, MAX_UINT_256);

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
        it("should return correct royalInfo: ", async () => {
            await tokenMintERC721.mint(mkpManager.address, "this_uri");
            const royalInfos = await mkpManager.getRoyaltyInfo(tokenMintERC721.address, 1, 1000000000);

            expect(royalInfos[0].toString()).to.equal(treasury.address);
            expect(royalInfos[1]).to.equal((1000000000 * 250) / 10000);
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
        beforeEach(async () => {
            await mkpManager.setCollectionFactory(collectionFactory.address);

            await collectionFactory.setPause(false);
            await collectionFactory.connect(user1).create(0, "NFT", "NFT", user1.address, 250);
            collection1 = await collectionFactory.getCollectionInfo(1);
            await collectionFactory.connect(user2).create(0, "NFT", "NFT", user2.address, 250);
            collection2 = await collectionFactory.getCollectionInfo(2);
        });

        it("should check royalty: ", async () => {
            expect(await mkpManager.isRoyalty(collection1.collectionAddress)).to.equal(true);
        });
    });

    describe("getMarketItemIdToMarketItem function:", async () => {
        it("should be return market item", async () => {
            await token.transfer(user1.address, parseEther("1000"));
            await token.transfer(user2.address, parseEther("1000"));

            await token.connect(user1).approve(nftTest.address, MAX_UINT_256);
            await token.connect(user2).approve(orderManager.address, MAX_UINT_256);

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

    describe("setMarketItemIdToMarketItem function:", async () => {
        beforeEach(async () => {
            await token.transfer(user1.address, parseEther("1000"));
            await token.transfer(user2.address, parseEther("1000"));

            await token.connect(user1).approve(nftTest.address, MAX_UINT_256);
            await token.connect(user2).approve(orderManager.address, MAX_UINT_256);

            await nftTest.connect(user1).buy("this_uri");
            await nftTest.connect(user1).approve(mkpManager.address, 1);

            const startTime = (await getCurrentTime()) + 10;
            const endTime = (await getCurrentTime()) + ONE_WEEK;

            await orderManager
                .connect(user1)
                .sell(nftTest.address, 1, 1, ONE_ETHER, startTime, endTime, token.address, rootHash);

            marketItemId = await mkpManager.getCurrentMarketItem();
            marketItem = await mkpManager.getMarketItemIdToMarketItem(marketItemId);
        });

        it("Only order contract can call this function", async () => {
            marketItem.amount = 100;
            marketItem.price = 0;
            await expect(
                mkpManager.connect(user1).setMarketItemIdToMarketItem(marketItemId, marketItem)
            ).to.revertedWith("Caller is not an order manager");
        });
    });

    describe("sellAvailableInMarketplace function:", async () => {
        beforeEach(async () => {
            await token.transfer(user1.address, ONE_ETHER);
            await token.transfer(owner.address, ONE_ETHER);
            await token.connect(user1).approve(mtvsManager.address, MAX_UINT_256);

            isSellOnMarket = true;
            current = await getCurrentTime();
            typeNft = NFT_TYPE721;
            amount = 1;
            uri = "uri";
            price = parseEther("1");
            startTime = (await getCurrentTime()) + 10;
            endTime = (await getCurrentTime()) + ONE_WEEK;
        });

        it("should revert when market Item ID invalid: ", async () => {
            await mtvsManager
                .connect(user1)
                .createNFT(
                    isSellOnMarket,
                    NFT_TYPE721,
                    1,
                    "uri",
                    parseEther("1"),
                    startTime,
                    endTime,
                    token.address,
                    rootHash
                );

            marketItemId = await mkpManager.getCurrentMarketItem();
            marketItem = await mkpManager.getMarketItemIdToMarketItem(marketItemId);

            await skipTime(endTime - startTime + 10);
            const newStartTime = (await getCurrentTime()) + 1000;
            const newEndTime = (await getCurrentTime()) + ONE_WEEK + 1000;

            await expect(
                orderManager.connect(user1).sellAvailableInMarketplace(0, 1, 1, newStartTime, newEndTime, token.address)
            ).to.be.revertedWith("ERROR: market ID is not exist !");
        });
        it("should revert when price equal to zero: ", async () => {
            await mtvsManager
                .connect(user1)
                .createNFT(isSellOnMarket, typeNft, amount, uri, price, startTime, endTime, token.address, rootHash);

            await skipTime(endTime - startTime + 10);
            const newStartTime = (await getCurrentTime()) + 1000;
            const newEndTime = (await getCurrentTime()) + ONE_WEEK + 1000;

            await expect(
                orderManager.sellAvailableInMarketplace(1, 0, 1, newStartTime, newEndTime, token.address)
            ).to.be.revertedWith("Invalid amount");
        });
        it("should revert when caller is not seller: ", async () => {
            await mtvsManager
                .connect(user1)
                .createNFT(isSellOnMarket, typeNft, amount, uri, price, startTime, endTime, token.address, rootHash);

            await skipTime(endTime - startTime + 10);
            const newStartTime = (await getCurrentTime()) + 1000;
            const newEndTime = (await getCurrentTime()) + ONE_WEEK + 1000;

            await expect(
                orderManager.sellAvailableInMarketplace(1, price + 1000, 1, newStartTime, newEndTime, token.address)
            ).to.be.revertedWith("You are not the seller");
        });
        it("should sellAvailableInMarketplace success and return marketItemId: ", async () => {
            await mtvsManager
                .connect(user1)
                .createNFT(isSellOnMarket, typeNft, amount, uri, price, startTime, endTime, token.address, rootHash);

            await skipTime(endTime - startTime + 10);
            newStartTime = (await getCurrentTime()) + 1000;
            newEndTime = (await getCurrentTime()) + ONE_WEEK + 1000;

            const marketItemId1 = await mkpManager.getCurrentMarketItem();
            await orderManager
                .connect(user1)
                .sellAvailableInMarketplace(marketItemId1, 10005, amount, newStartTime, newEndTime, token.address);
            const data_ERC721 = await mkpManager.fetchMarketItemsByMarketID(marketItemId1);
            expect(data_ERC721.price).to.equal(10005);

            // ERC1155
            startTime = (await getCurrentTime()) + 10;
            endTime = (await getCurrentTime()) + ONE_WEEK;

            await mtvsManager
                .connect(user1)
                .createNFT(isSellOnMarket, NFT_TYPE1155, 1000, uri, price, startTime, endTime, token.address, rootHash);

            await skipTime(endTime - startTime + 10);
            newStartTime = (await getCurrentTime()) + 1000;
            newEndTime = (await getCurrentTime()) + ONE_WEEK + 1000;

            const marketItemId2 = await mkpManager.getCurrentMarketItem();
            await orderManager
                .connect(user1)
                .sellAvailableInMarketplace(marketItemId2, 100056, 100, newStartTime, newEndTime, token.address);
            const data_ERC1155 = await mkpManager.fetchMarketItemsByMarketID(marketItemId2);

            expect(data_ERC1155.price).to.equal(100056);
            expect(data_ERC1155.amount).to.equal(100);
        });
    });

    describe("sell function:", async () => {
        beforeEach(async () => {
            await token.transfer(user1.address, parseEther("1000"));
            await token.connect(user1).approve(nftTest.address, MAX_UINT_256);

            await nftTest.connect(user1).buy("this_uri");
            await nftTest.connect(user1).approve(mkpManager.address, 1);

            nftAddress = nftTest.address;
            tokenId = 1;
            amount = 1;
            price = parseEther("1");
            startTime = (await getCurrentTime()) + 10;
            endTime = (await getCurrentTime()) + ONE_WEEK;
            paymentToken = token.address;
        });

        it("should revert when not own token id", async () => {
            await expect(
                orderManager
                    .connect(user1)
                    .sell(nftAddress, 2, amount, price, startTime, endTime, paymentToken, rootHash)
            ).to.be.revertedWith("ERC721: invalid token ID");
        });
        it("should revert when nft contract equal to zero address: ", async () => {
            await expect(
                orderManager
                    .connect(user1)
                    .sell(ADDRESS_ZERO, tokenId, 0, price, startTime, endTime, paymentToken, rootHash)
            ).to.be.revertedWith("Invalid amount");
        });
        it("should revert when gross sale value equal to zero: ", async () => {
            const current = await getCurrentTime();
            await expect(
                orderManager.sell(nftAddress, tokenId, amount, 0, startTime, endTime, paymentToken, rootHash)
            ).to.be.revertedWith("Invalid amount");
        });
        it("should sell success : ", async () => {
            await orderManager
                .connect(user1)
                .sell(nftAddress, tokenId, amount, price, startTime, endTime, paymentToken, rootHash);

            const marketItemId = await mkpManager.getCurrentMarketItem();
            const marketItem = await mkpManager.getMarketItemIdToMarketItem(marketItemId);
            expect(marketItem.price).to.equal(parseEther("1"));
        });
    });

    describe("cancelSell function:", async () => {
        beforeEach(async () => {
            await token.transfer(user1.address, parseEther("1000"));
            await token.connect(user1).approve(nftTest.address, MAX_UINT_256);

            await nftTest.connect(user1).buy("this_uri");
            await nftTest.connect(user1).approve(mkpManager.address, 1);

            await orderManager
                .connect(user1)
                .sell(
                    nftTest.address,
                    1,
                    1,
                    parseEther("1"),
                    (await getCurrentTime()) + 10,
                    (await getCurrentTime()) + ONE_WEEK,
                    token.address,
                    rootHash
                );

            marketItemId = await mkpManager.getCurrentMarketItem();
            marketItem = await mkpManager.getMarketItemIdToMarketItem(marketItemId);
        });

        it("should revert when market item ID not exist: ", async () => {
            await expect(orderManager.connect(user1).cancelSell(2)).to.be.revertedWith(
                "ERROR: market ID is not exist !"
            );
        });
        it("should revert when caller is not seller: ", async () => {
            await expect(orderManager.cancelSell(1)).to.be.revertedWith("You are not the seller");
        });
        it("should cancel sell success: ", async () => {
            expect(marketItem.status).to.equal(0);
            await expect(() => orderManager.connect(user1).cancelSell(1)).to.changeTokenBalance(nftTest, user1, 1);

            marketItemId = await mkpManager.getCurrentMarketItem();
            marketItem = await mkpManager.getMarketItemIdToMarketItem(marketItemId);
            expect(marketItem.status).to.equal(2);
        });
    });

    describe("buy function:", async () => {
        beforeEach(async () => {
            await token.transfer(user1.address, parseEther("1000"));
            await token.transfer(user2.address, parseEther("1000"));
            await token.connect(user1).approve(nftTest.address, MAX_UINT_256);
            await token.connect(user2).approve(orderManager.address, MAX_UINT_256);

            await nftTest.connect(user1).buy("this_uri");
            await nftTest.connect(user1).approve(mkpManager.address, 1);

            await orderManager
                .connect(user1)
                .sell(
                    nftTest.address,
                    1,
                    1,
                    parseEther("1"),
                    (await getCurrentTime()) + 10,
                    (await getCurrentTime()) + ONE_WEEK,
                    token.address,
                    rootHash
                );

            marketItemId = await mkpManager.getCurrentMarketItem();
            marketItem = await mkpManager.getMarketItemIdToMarketItem(marketItemId);
        });

        it("should revert when market ID not exist: ", async () => {
            await expect(orderManager.connect(user2).buy(0, [])).to.be.revertedWith("ERROR: market ID is not exist !");
            await expect(orderManager.connect(user2).buy(123, [])).to.be.revertedWith(
                "ERROR: market ID is not exist !"
            );
        });

        it("should buy success: ", async () => {
            await skipTime(10);
            await metaCitizen.mint(user2.address);
            await orderManager.connect(user2).buy(marketItemId, merkleTree.getHexProof(generateLeaf(user2.address)));

            marketItemId = await mkpManager.getCurrentMarketItem();
            marketItem = await mkpManager.getMarketItemIdToMarketItem(marketItemId);
            expect(marketItem.status).to.equal(1);
        });
    });

    describe("makeWalletOrder function", async () => {
        beforeEach(async () => {
            await token.transfer(user1.address, parseEther("1000"));
            await token.transfer(user2.address, parseEther("1000"));
            await token.connect(user1).approve(nftTest.address, MAX_UINT_256);
            await token.connect(user1).approve(orderManager.address, MAX_UINT_256);
            await token.connect(user2).approve(orderManager.address, MAX_UINT_256);

            await nftTest.connect(user1).buy("this_uri");
            await nftTest.connect(user1).approve(mkpManager.address, 1);

            await metaCitizen.mint(user1.address);

            paymentToken = token.address;
            bidPrice = parseEther("1");
            to = user2.address;
            nftAddress = nftTest.address;
            tokenId = 1;
            amount = 1;
            endTime = (await getCurrentTime()) + ONE_WEEK;
        });

        it("should revert when invalid time", async () => {
            await expect(
                orderManager.connect(user1).makeWalletOrder(paymentToken, bidPrice, to, nftAddress, 1, 1, 0)
            ).to.be.revertedWith("Invalid order time");
        });

        it("should revert when payment token is not allowed", async () => {
            await expect(
                orderManager.connect(user1).makeWalletOrder(user1.address, bidPrice, to, nftAddress, 1, 1, endTime)
            ).to.be.revertedWith("Payment token is not supported");
        });

        it("should make offer in wallet success", async () => {
            await expect(() =>
                orderManager.connect(user1).makeWalletOrder(paymentToken, bidPrice, to, nftAddress, 1, 1, endTime)
            ).to.changeTokenBalance(token, user1, bidPrice.mul(-1));
            const [walletOrder, orderInfo] = await orderManager.getOrderByWalletOrderId(1);
            expect(walletOrder.owner).to.equal(user1.address);
            expect(walletOrder.to).to.equal(to);
            expect(orderInfo.expiredTime).to.equal(endTime);
        });

        it("should replace make offer before with token", async () => {
            await expect(() =>
                orderManager.connect(user1).makeWalletOrder(paymentToken, bidPrice, to, nftAddress, 1, 1, endTime)
            ).to.changeTokenBalance(token, user1, bidPrice.mul(-1));

            await expect(() =>
                orderManager
                    .connect(user1)
                    .makeWalletOrder(paymentToken, multiply(bidPrice, 2), to, nftAddress, 1, 1, endTime)
            ).to.changeTokenBalance(token, user1, bidPrice.mul(-1));

            await expect(() =>
                orderManager.connect(user1).makeWalletOrder(paymentToken, bidPrice, to, nftAddress, 1, 1, endTime)
            ).to.changeTokenBalance(token, user1, bidPrice);

            const [walletOrder, orderInfo] = await orderManager.getOrderByWalletOrderId(1);
            expect(walletOrder.owner).to.equal(user1.address);
            expect(walletOrder.to).to.equal(to);
            expect(orderInfo.expiredTime).to.equal(endTime);
            expect(orderInfo.bidPrice).to.equal(bidPrice);
        });
    });

    describe("makeMarketItemOrder function", async () => {
        beforeEach(async () => {
            await token.transfer(user1.address, parseEther("1000"));
            await token.transfer(user2.address, parseEther("1000"));
            await token.connect(user1).approve(nftTest.address, MAX_UINT_256);
            await token.connect(user1).approve(orderManager.address, MAX_UINT_256);

            await nftTest.connect(user1).buy("this_uri");
            await nftTest.connect(user1).approve(mkpManager.address, 1);

            await metaCitizen.mint(user1.address);

            nftAddress = nftTest.address;
            tokenId = 1;
            amount = 1;
            price = parseEther("2");
            bidPrice = parseEther("1");
            startTime = (await getCurrentTime()) + 10;
            endTime = (await getCurrentTime()) + ONE_WEEK;
            paymentToken = token.address;
        });

        it("should revert when payment token is not allowed", async () => {
            await orderManager
                .connect(user1)
                .sell(nftAddress, tokenId, amount, price, startTime, endTime, paymentToken, rootHash);

            const marketItemId = await mkpManager.getCurrentMarketItem();
            await expect(
                orderManager
                    .connect(user1)
                    .makeMarketItemOrder(
                        marketItemId,
                        user1.address,
                        bidPrice,
                        endTime,
                        merkleTree.getHexProof(generateLeaf(user1.address))
                    )
            ).to.be.revertedWith("Payment token is not supported");
        });

        it("should revert when not the order time", async () => {
            await orderManager
                .connect(user1)
                .sell(nftAddress, tokenId, amount, price, startTime, endTime, paymentToken, rootHash);

            const marketItemId = await mkpManager.getCurrentMarketItem();
            await expect(
                orderManager
                    .connect(user2)
                    .makeMarketItemOrder(
                        marketItemId,
                        paymentToken,
                        bidPrice,
                        endTime,
                        merkleTree.getHexProof(generateLeaf(user2.address))
                    )
            ).to.revertedWith("Not the order time");
        });

        it("should make offer in marketplace success", async () => {
            await orderManager
                .connect(user1)
                .sell(nftAddress, tokenId, amount, price, startTime, endTime, paymentToken, rootHash);

            await skipTime(10);
            const marketItemId = await mkpManager.getCurrentMarketItem();
            await token.connect(user2).approve(orderManager.address, MAX_UINT_256);
            await metaCitizen.mint(user2.address);
            await expect(() =>
                orderManager
                    .connect(user2)
                    .makeMarketItemOrder(
                        marketItemId,
                        paymentToken,
                        bidPrice,
                        endTime,
                        merkleTree.getHexProof(generateLeaf(user2.address))
                    )
            ).to.changeTokenBalance(token, user2, bidPrice.mul(-1));

            const offerInfo = await orderManager.marketItemOrderOfOwners(marketItemId, user2.address);
            expect(offerInfo.bidPrice).to.equal(bidPrice);
        });

        it("should make offer with native success", async () => {
            await orderManager
                .connect(user1)
                .sell(nftAddress, tokenId, amount, price, startTime, endTime, ADDRESS_ZERO, rootHash);

            await skipTime(10);
            const marketItemId = await mkpManager.getCurrentMarketItem();
            await metaCitizen.mint(user2.address);
            await expect(() =>
                orderManager
                    .connect(user2)
                    .makeMarketItemOrder(
                        marketItemId,
                        ADDRESS_ZERO,
                        bidPrice,
                        endTime,
                        merkleTree.getHexProof(generateLeaf(user2.address)),
                        { value: bidPrice }
                    )
            ).to.changeEtherBalance(user2, bidPrice.mul(-1));

            const offerInfo = await orderManager.marketItemOrderOfOwners(marketItemId, user2.address);
            expect(offerInfo.bidPrice).to.equal(bidPrice);
        });

        it("should replace make offer before with native success", async () => {
            await orderManager
                .connect(user1)
                .sell(nftAddress, tokenId, amount, price, startTime, endTime, ADDRESS_ZERO, rootHash);

            await skipTime(10);
            const marketItemId = await mkpManager.getCurrentMarketItem();
            await metaCitizen.mint(user2.address);
            await expect(() =>
                orderManager
                    .connect(user2)
                    .makeMarketItemOrder(
                        marketItemId,
                        ADDRESS_ZERO,
                        multiply(bidPrice, 2),
                        endTime,
                        merkleTree.getHexProof(generateLeaf(user2.address)),
                        {
                            value: multiply(bidPrice, 2),
                        }
                    )
            ).to.changeEtherBalance(user2, multiply(bidPrice, -2));

            await expect(() =>
                orderManager
                    .connect(user2)
                    .makeMarketItemOrder(
                        marketItemId,
                        ADDRESS_ZERO,
                        bidPrice,
                        endTime,
                        merkleTree.getHexProof(generateLeaf(user2.address)),
                        { value: 0 }
                    )
            ).to.changeEtherBalance(user2, bidPrice);
        });
    });

    describe("acceptWalletOrder function", async () => {
        beforeEach(async () => {
            await token.transfer(user1.address, parseEther("1000"));
            await token.transfer(user2.address, parseEther("1000"));
            await token.connect(user1).approve(nftTest.address, MAX_UINT_256);
            await token.connect(user1).approve(orderManager.address, MAX_UINT_256);
            await token.connect(user2).approve(orderManager.address, MAX_UINT_256);

            await nftTest.connect(user1).buy("this_uri");
            await nftTest.connect(user1).approve(orderManager.address, 1);

            await metaCitizen.mint(user1.address);

            nftAddress = nftTest.address;
            tokenId = 1;
            amount = 1;
            to = user1.address;
            bidPrice = parseEther("1");
            startTime = (await getCurrentTime()) + 10;
            endTime = (await getCurrentTime()) + ONE_WEEK;
            paymentToken = token.address;

            await metaCitizen.mint(user2.address);
            await expect(() =>
                orderManager.connect(user2).makeWalletOrder(paymentToken, bidPrice, to, nftAddress, 1, 1, endTime)
            ).to.changeTokenBalance(token, user2, bidPrice.mul(-1));
        });

        it("should revert when caller is not owner asset", async () => {
            await expect(orderManager.connect(user2).acceptWalletOrder(1)).to.be.revertedWith("Not the seller");
        });

        it("should accept offer success", async () => {
            await expect(() => orderManager.connect(user1).acceptWalletOrder(1)).to.changeTokenBalance(
                token,
                user1,
                bidPrice
                    .mul(975)
                    .div(1000)
                    .mul(975)
                    .div(1000)
            );
        });
    });

    describe("acceptMarketItemOrder function", async () => {
        beforeEach(async () => {
            await token.transfer(user1.address, parseEther("1000"));
            await token.transfer(user2.address, parseEther("1000"));
            await token.connect(user1).approve(nftTest.address, MAX_UINT_256);
            await token.connect(user1).approve(orderManager.address, MAX_UINT_256);

            await nftTest.connect(user1).buy("this_uri");
            await nftTest.connect(user1).approve(mkpManager.address, 1);

            await metaCitizen.mint(user1.address);

            nftAddress = nftTest.address;
            tokenId = 1;
            amount = 1;
            price = parseEther("2");
            bidPrice = parseEther("1");
            startTime = (await getCurrentTime()) + 10;
            endTime = (await getCurrentTime()) + ONE_WEEK;
            paymentToken = token.address;

            await orderManager
                .connect(user1)
                .sell(nftAddress, tokenId, amount, price, startTime, endTime, paymentToken, rootHash);

            await skipTime(10);
            const marketItemId = await mkpManager.getCurrentMarketItem();
            await token.connect(user2).approve(orderManager.address, MAX_UINT_256);
            await metaCitizen.mint(user2.address);
            await expect(() =>
                orderManager
                    .connect(user2)
                    .makeMarketItemOrder(
                        marketItemId,
                        paymentToken,
                        bidPrice,
                        endTime,
                        merkleTree.getHexProof(generateLeaf(user2.address))
                    )
            ).to.changeTokenBalance(token, user2, bidPrice.mul(-1));
        });

        it("should revert when caller is not owner asset", async () => {
            await expect(orderManager.connect(user2).acceptMarketItemOrder(1)).to.be.revertedWith("Not the seller");
        });
        it("should accept offer in marketplace success ", async () => {
            await expect(() => orderManager.connect(user1).acceptMarketItemOrder(1)).to.changeTokenBalance(
                token,
                user1,
                bidPrice
                    .mul(975)
                    .div(1000)
                    .mul(975)
                    .div(1000)
            );

            marketItemId = await mkpManager.getCurrentMarketItem();
            marketItem = await mkpManager.getMarketItemIdToMarketItem(marketItemId);
            expect(marketItem.status).to.equal(1);
        });
    });

    describe("cancelWalletOrder function", async () => {
        beforeEach(async () => {
            await token.transfer(user1.address, parseEther("1000"));
            await token.transfer(user2.address, parseEther("1000"));
            await token.connect(user1).approve(nftTest.address, MAX_UINT_256);
            await token.connect(user1).approve(orderManager.address, MAX_UINT_256);
            await token.connect(user2).approve(orderManager.address, MAX_UINT_256);

            await nftTest.connect(user1).buy("this_uri");
            await nftTest.connect(user1).approve(orderManager.address, 1);

            await metaCitizen.mint(user2.address);

            nftAddress = nftTest.address;
            tokenId = 1;
            amount = 1;
            to = user1.address;
            bidPrice = parseEther("1");
            startTime = (await getCurrentTime()) + 10;
            endTime = (await getCurrentTime()) + ONE_WEEK;
            paymentToken = token.address;

            await expect(() =>
                orderManager.connect(user2).makeWalletOrder(paymentToken, bidPrice, to, nftAddress, 1, 1, endTime)
            ).to.changeTokenBalance(token, user2, bidPrice.mul(-1));
            const [walletOrder, orderInfo] = await orderManager.getOrderByWalletOrderId(1);
            expect(walletOrder.owner).to.equal(user2.address);
            expect(walletOrder.to).to.equal(to);
            expect(orderInfo.expiredTime).to.equal(endTime);
        });

        it("should revert when invalid buyer", async () => {
            await expect(orderManager.connect(user1).cancelWalletOrder(1)).to.be.revertedWith("Not the owner of offer");
        });
        it("should refund bid amount success", async () => {
            await expect(() => orderManager.connect(user2).cancelWalletOrder(1)).to.changeTokenBalance(
                token,
                user2,
                bidPrice
            );
        });
    });
});
