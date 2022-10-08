const { expect } = require("chai");
const { upgrades, ethers } = require("hardhat");
const { MaxUint256, AddressZero } = ethers.constants;
const { multiply, add, subtract } = require("js-big-decimal");
const { getCurrentTime, skipTime } = require("../utils");
const { MerkleTree } = require("merkletreejs");
const keccak256 = require("keccak256");

describe("Marketplace Manager:", () => {
    beforeEach(async () => {
        TOTAL_SUPPLY = ethers.utils.parseEther("1000");
        PRICE = ethers.utils.parseEther("1");
        ONE_ETHER = ethers.utils.parseEther("1");
        ONE_WEEK = 604800;
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
            AddressZero,
            AddressZero,
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

        await admin.setPermittedPaymentToken(token.address, true);
        await admin.setPermittedPaymentToken(AddressZero, true);

        await orderManager.setPause(false);
        await mtvsManager.setPause(false);
        await mkpManager.setPause(false);

        await mkpManager.setOrder(orderManager.address);
        const leaves = [user1.address, user2.address].map(value => keccak256(value));
        merkleTree = new MerkleTree(leaves, keccak256, { sort: true });

        rootHash = merkleTree.getHexRoot();
    });

    describe("Deployment:", async () => {
        it("Should revert when invalid admin contract address", async () => {
            await expect(upgrades.deployProxy(MkpManager, [AddressZero])).to.revertedWith(
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

    describe("getListingFee function:", async () => {
        it("should return tuple listingFee: ", async () => {
            expect(await mkpManager.getListingFee(100000)).to.equal(2500);
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

    describe("sellAvailableInMarketplace function:", async () => {
        it("should revert when market Item ID invalid: ", async () => {
            let typeNft = 0; // ERC721
            let amount = 1;
            let uri = "this_uri";
            let price = 1000;
            let startTime = 0;
            let endTime = 0;

            await mtvsManager
                .connect(user1)
                .createNFT(typeNft, amount, uri, price, startTime, endTime, token.address, rootHash);

            await expect(
                orderManager.connect(user1).sellAvailableInMarketplace(0, 1, 1, ONE_WEEK, ONE_WEEK, token.address)
            ).to.be.revertedWith("ERROR: sender is not owner this NFT");
        });
        it("should revert when price equal to zero: ", async () => {
            await token.mint(user1.address, ONE_ETHER);
            await token.mint(owner.address, ONE_ETHER);
            await token.connect(user1).approve(mtvsManager.address, MaxUint256);

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
            await token.approve(user1.address, MaxUint256);
            await token.connect(user1).approve(mtvsManager.address, MaxUint256);

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
            await token.approve(user1.address, MaxUint256);
            await token.connect(user1).approve(mtvsManager.address, MaxUint256);

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
                orderManager.sell(AddressZero, 0, 100, 100, current, add(current, ONE_WEEK), token.address, rootHash)
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

            await token.connect(user1).approve(tokenMintERC721.address, MaxUint256);

            const current = await getCurrentTime();

            await expect(
                orderManager
                    .connect(user1)
                    .sell(treasury.address, 1, 1, 1000, current, add(current, ONE_WEEK), token.address, rootHash)
            ).to.be.revertedWith("ERROR: NFT address is compatible !");
        });
        it("should sell success : ", async () => {
            await token.mint(user1.address, ONE_ETHER);

            await token.connect(user1).approve(nftTest.address, MaxUint256);

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

            await token.connect(user1).approve(nftTest.address, MaxUint256);

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

            await token.connect(user1).approve(mkpManager.address, MaxUint256);
            await token.connect(user1).approve(nftTest.address, MaxUint256);

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

            await token.connect(user1).approve(tokenMintERC721.address, MaxUint256);
            await token.connect(user2).approve(orderManager.address, MaxUint256);
            await token.connect(user1).approve(nftTest.address, MaxUint256);

            await token.connect(user2).approve(treasury.address, MaxUint256);

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

            await token.connect(user1).approve(nftTest.address, MaxUint256);

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
            await token.connect(user1).approve(nftTest.address, MaxUint256);

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

            await token.connect(user1).approve(nftTest.address, MaxUint256);

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

            await token.connect(user1).approve(nftTest.address, MaxUint256);

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

            await token.connect(user1).approve(nftTest.address, MaxUint256);

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

            await token.connect(user1).approve(nftTest.address, MaxUint256);

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
                    AddressZero,
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

            await token.connect(user1).approve(nftTest.address, MaxUint256);

            await nftTest.connect(user1).buy("this_uri");

            await nftTest.connect(user1).approve(orderManager.address, 1);
            const current = await getCurrentTime();

            await orderManager
                .connect(user1)
                .sell(nftTest.address, 1, 1, 1000, add(current, 100), add(current, ONE_WEEK), AddressZero, rootHash);

            await token.mint(user2.address, ONE_ETHER);
            await token.connect(user2).approve(mkpManager.address, ONE_ETHER);

            await orderManager.connect(user2).makeOffer(1, AddressZero, ONE_ETHER, add(current, ONE_WEEK), {
                value: ONE_ETHER.toString(),
            });

            await orderManager.connect(user2).makeOffer(1, AddressZero, ONE_ETHER.mul(2), add(current, ONE_WEEK), {
                value: ONE_ETHER.toString(),
            });

            await orderManager.connect(user2).makeOffer(1, AddressZero, ONE_ETHER, add(current, ONE_WEEK), {
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
            await token.connect(user2).approve(mtvsManager.address, MaxUint256);
            await token.connect(user2).approve(nftTest.address, MaxUint256);

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
            await token.connect(user2).approve(mtvsManager.address, MaxUint256);
            await token.connect(user2).approve(nftTest.address, MaxUint256);

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
            await token.connect(user2).approve(mtvsManager.address, MaxUint256);
            await token.connect(user2).approve(nftTest.address, MaxUint256);

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
            await token.connect(user2).approve(mtvsManager.address, MaxUint256);
            await token.connect(user2).approve(nftTest.address, MaxUint256);

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
            await token.connect(user2).approve(mtvsManager.address, MaxUint256);
            await token.connect(user2).approve(nftTest.address, MaxUint256);

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
            await token.connect(user2).approve(mtvsManager.address, MaxUint256);
            await token.connect(user2).approve(nftTest.address, MaxUint256);

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

    describe("getLatestMarketItemByTokenId function:", async () => {
        it("should return zero market item: ", async () => {
            const data = await mkpManager.getLatestMarketItemByTokenId(tokenMintERC721.address, 1);

            expect(data[0].marketItemId).to.equal(0);
            expect(data[1]).to.equal(false);
        });
        it("should return latest market item: ", async () => {
            await token.mint(user1.address, multiply(1000, ONE_ETHER));
            await token.mint(user2.address, multiply(1000, ONE_ETHER));

            await token.connect(user1).approve(tokenMintERC721.address, MaxUint256);
            await token.connect(user2).approve(tokenMintERC1155.address, MaxUint256);

            await token.connect(user1).approve(mtvsManager.address, MaxUint256);
            await token.connect(user1).approve(nftTest.address, MaxUint256);

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

            expect(data721[0].marketItemId).to.equal(1);
            // // ERC1155
            current = await getCurrentTime();
            await mtvsManager
                .connect(user1)
                .createNFT(
                    1,
                    100,
                    "this_uri",
                    ONE_ETHER,
                    add(current, 100),
                    add(current, ONE_WEEK),
                    token.address,
                    rootHash
                );

            const marketId = await mkpManager.getCurrentMarketItem();

            const data1155 = await mkpManager.getLatestMarketItemByTokenId(tokenMintERC1155.address, 1);

            expect(data1155[0].marketItemId).to.equal(marketId);
        });
    });

    describe("fetchAvailableMarketItems function:", async () => {
        it("should return all market items in marketplace: ", async () => {
            await token.mint(user1.address, multiply(1000, ONE_ETHER));
            await token.mint(user2.address, multiply(1000, ONE_ETHER));

            await token.connect(user1).approve(tokenMintERC721.address, MaxUint256);
            await token.connect(user2).approve(tokenMintERC1155.address, MaxUint256);

            await token.connect(user1).approve(nftTest.address, MaxUint256);

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

    describe("checkStandard function:", async () => {
        it("should return type of NFT: ", async () => {
            const data_721 = await mkpManager.checkStandard(tokenMintERC721.address);
            expect(data_721).to.equal(0);
            const data_1155 = await mkpManager.checkStandard(tokenMintERC1155.address);
            expect(data_1155).to.equal(1);
        });
    });

    describe("fetchMarketItemsByMarketID function:", async () => {
        it("should return market item corresponding market ID : ", async () => {
            await token.mint(user1.address, multiply(1000, ONE_ETHER));
            await token.mint(user2.address, multiply(1000, ONE_ETHER));

            await token.connect(user1).approve(tokenMintERC721.address, MaxUint256);
            await token.connect(user2).approve(tokenMintERC1155.address, MaxUint256);

            await token.connect(user1).approve(nftTest.address, MaxUint256);

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
            // check
            const fetchId721 = await mkpManager.fetchMarketItemsByMarketID(1);
            expect(fetchId721.price.toString()).to.equal(ONE_ETHER);
        });
    });

    describe("fetchMarketItemsByAddress function:", async () => {
        it("should return market item corresponding address: ", async () => {
            await token.mint(user1.address, multiply(1000, ONE_ETHER));
            await token.mint(user2.address, multiply(1000, ONE_ETHER));

            await token.connect(user1).approve(tokenMintERC721.address, MaxUint256);
            await token.connect(user2).approve(tokenMintERC1155.address, MaxUint256);

            await token.connect(user1).approve(treasury.address, MaxUint256);
            await token.connect(user2).approve(treasury.address, MaxUint256);
            await token.connect(user1).approve(nftTest.address, MaxUint256);

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
});
