const { expect } = require("chai");
const { upgrades, ethers } = require("hardhat");
const { MaxUint256, AddressZero } = ethers.constants;
const { multiply, add, subtract } = require("js-big-decimal");
const { getCurrentTime, skipTime, generateMerkleTree, generateLeaf } = require("../utils");
const { MerkleTree } = require("merkletreejs");
const keccak256 = require("keccak256");
const { parseEther } = ethers.utils;
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
            user1.address,
            "Metaversus Token",
            "MTVS",
            TOTAL_SUPPLY,
            treasury.address,
            admin.address,
        ]);
        fakeToken = await upgrades.deployProxy(Token, [
            user1.address,
            "Fake Metaversus Token",
            "FMTVS",
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
            AddressZero,
            AddressZero,
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
            await expect(upgrades.deployProxy(MkpManager, [treasury.address, AddressZero])).to.revertedWith(
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
            await token.mint(user1.address, multiply(1000, ONE_ETHER));
            await token.mint(user2.address, multiply(1000, ONE_ETHER));

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
            await token.mint(user1.address, multiply(1000, ONE_ETHER));
            await token.mint(user2.address, multiply(1000, ONE_ETHER));

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
            await token.mint(user1.address, parseEther("1000"));
            await token.mint(user2.address, parseEther("1000"));

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
            await token.mint(user1.address, parseEther("1000"));
            await token.mint(user2.address, parseEther("1000"));

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
            await token.mint(user1.address, ONE_ETHER);
            await token.mint(owner.address, ONE_ETHER);
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
            ).to.be.revertedWith("You are not the seller");
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
            await token.mint(user1.address, parseEther("1000"));
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
                    .sell(ZERO_ADDRESS, tokenId, 0, price, startTime, endTime, paymentToken, rootHash)
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
            await token.mint(user1.address, parseEther("1000"));
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
            await expect(orderManager.connect(user1).cancelSell(2)).to.be.revertedWith("You are not the seller");
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
            await token.mint(user1.address, parseEther("1000"));
            await token.mint(user2.address, parseEther("1000"));
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
            await expect(orderManager.connect(user2).buy(0, [])).to.be.revertedWith("Market Item is not selling");
            await expect(orderManager.connect(user2).buy(123, [])).to.be.revertedWith("Market Item is not selling");
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
            await token.mint(user1.address, parseEther("1000"));
            await token.mint(user2.address, parseEther("1000"));
            await token.connect(user1).approve(nftTest.address, MAX_UINT_256);
            await token.connect(user1).approve(orderManager.address, MAX_UINT_256);

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

        it("should revert when not owned metacitizen token", async () => {
            await expect(
                orderManager
                    .connect(user2)
                    .makeWalletOrder(paymentToken, bidPrice, user1.address, nftAddress, 1, 1, endTime)
            ).to.be.revertedWith("Require own MetaCitizen NFT");
        });

        it("should revert when invalid time", async () => {
            await expect(
                orderManager.connect(user1).makeWalletOrder(paymentToken, bidPrice, to, nftAddress, 1, 1, 0)
            ).to.be.revertedWith("Invalid order time");
        });

        it("should revert when payment token is not allowed", async () => {
            await expect(
                orderManager.connect(user1).makeWalletOrder(fakeToken.address, bidPrice, to, nftAddress, 1, 1, endTime)
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
            throw "not implement yet";
            // await expect(() =>
            //     orderManager.connect(user1).makeWalletOrder(paymentToken, bidPrice, to, nftAddress, 1, 1, endTime)
            // ).to.changeTokenBalance(token, user1, bidPrice.mul(-1));

            // await expect(() =>
            //     orderManager
            //         .connect(user1)
            //         .makeWalletOrder(paymentToken, multiply(bidPrice, 2), to, nftAddress, 1, 1, endTime)
            // ).to.changeTokenBalance(token, user1, bidPrice.mul(-1));

            // await expect(() =>
            //     orderManager.connect(user1).makeWalletOrder(paymentToken, bidPrice, to, nftAddress, 1, 1, endTime)
            // ).to.changeTokenBalance(token, user1, bidPrice);

            // const [walletOrder, orderInfo] = await orderManager.getOrderByWalletOrderId(1);
            // expect(walletOrder.owner).to.equal(user1.address);
            // expect(walletOrder.to).to.equal(to);
            // expect(orderInfo.expiredTime).to.equal(endTime);
            // expect(orderInfo.amount).to.equal(bidPrice);
        });
    });

    describe("makeMaketItemOrder function", async () => {
        beforeEach(async () => {
            await token.mint(user1.address, parseEther("1000"));
            await token.mint(user2.address, parseEther("1000"));
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
                orderManager.makeMarketItemOrder(marketItemId, fakeToken.address, bidPrice, endTime)
            ).to.be.revertedWith("Payment token is not supported");
        });

        it("should revert when not has metacitizen", async () => {
            await orderManager
                .connect(user1)
                .sell(nftAddress, tokenId, amount, price, startTime, endTime, paymentToken, rootHash);

            const marketItemId = await mkpManager.getCurrentMarketItem();
            await expect(
                orderManager.connect(user2).makeMarketItemOrder(marketItemId, paymentToken, bidPrice, endTime)
            ).to.revertedWith("Require own MetaCitizen NFT");
        });

        it("should revert when not the order time", async () => {
            await orderManager
                .connect(user1)
                .sell(nftAddress, tokenId, amount, price, startTime, endTime, paymentToken, rootHash);

            const marketItemId = await mkpManager.getCurrentMarketItem();
            await expect(
                orderManager.connect(user2).makeMarketItemOrder(marketItemId, paymentToken, bidPrice, endTime)
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
                orderManager.connect(user2).makeMarketItemOrder(marketItemId, paymentToken, bidPrice, endTime)
            ).to.changeTokenBalance(token, user2, bidPrice.mul(-1));

            const offerInfo = await orderManager.marketItemOrderOfOwners(marketItemId, user2.address);
            expect(offerInfo.bidPrice).to.equal(bidPrice);
        });

        it("should make offer with native success", async () => {
            await orderManager
                .connect(user1)
                .sell(nftAddress, tokenId, amount, price, startTime, endTime, ZERO_ADDRESS, rootHash);

            await skipTime(10);
            const marketItemId = await mkpManager.getCurrentMarketItem();
            await metaCitizen.mint(user2.address);
            await expect(() =>
                orderManager
                    .connect(user2)
                    .makeMarketItemOrder(marketItemId, ZERO_ADDRESS, bidPrice, endTime, { value: bidPrice })
            ).to.changeEtherBalance(user2, bidPrice.mul(-1));

            const offerInfo = await orderManager.marketItemOrderOfOwners(marketItemId, user2.address);
            expect(offerInfo.bidPrice).to.equal(bidPrice);
        });

        it("should replace make offer before with native success", async () => {
            await orderManager
                .connect(user1)
                .sell(nftAddress, tokenId, amount, price, startTime, endTime, ZERO_ADDRESS, rootHash);

            await skipTime(10);
            const marketItemId = await mkpManager.getCurrentMarketItem();
            await metaCitizen.mint(user2.address);
            await expect(() =>
                orderManager
                    .connect(user2)
                    .makeMarketItemOrder(marketItemId, ZERO_ADDRESS, multiply(bidPrice, 2), endTime, {
                        value: multiply(bidPrice, 2),
                    })
            ).to.changeEtherBalance(user2, multiply(bidPrice, -2));

            await expect(() =>
                orderManager
                    .connect(user2)
                    .makeMarketItemOrder(marketItemId, ZERO_ADDRESS, bidPrice, endTime, { value: bidPrice })
            ).to.changeEtherBalance(user2, bidPrice);

            const offerInfo = await orderManager.marketItemOrderOfOwners(marketItemId, user2.address);
            expect(offerInfo.bidPrice).to.equal(bidPrice);
        });
    });

    describe("acceptWalletOrder function", async () => {
        beforeEach(async () => {
            await token.mint(user1.address, parseEther("1000"));
            await token.mint(user2.address, parseEther("1000"));
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
            );
        });
    });

    describe("acceptMarketItemOrder function", async () => {
        beforeEach(async () => {
            await token.mint(user1.address, parseEther("1000"));
            await token.mint(user2.address, parseEther("1000"));
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
                orderManager.connect(user2).makeMarketItemOrder(marketItemId, paymentToken, bidPrice, endTime)
            ).to.changeTokenBalance(token, user2, bidPrice.mul(-1));

            const offerInfo = await orderManager.marketItemOrderOfOwners(marketItemId, user2.address);
        });

        it("should revert when caller is not owner asset", async () => {
            await expect(orderManager.connect(user2).acceptMarketItemOrder(1)).to.be.revertedWith("Not the seller");
        });
        it("should accept offer in marketplace success ", async () => {
            throw "not implement yet";
            // await expect(() => orderManager.connect(user1).acceptMarketItemOrder(1)).to.changeTokenBalance(
            //     token,
            //     user1,
            //     bidPrice
            // );

            // marketItemId = await mkpManager.getCurrentMarketItem();
            // marketItem = await mkpManager.getMarketItemIdToMarketItem(marketItemId);
            // expect(marketItem.status).to.equal(1);
        });
    });

    describe("cancelWalletOrder function", async () => {
        beforeEach(async () => {
            await token.mint(user1.address, parseEther("1000"));
            await token.mint(user2.address, parseEther("1000"));
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
            await expect(orderManager.connect(user1).cancelWalletOrder(1)).to.be.revertedWith("Not the buyer");
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
