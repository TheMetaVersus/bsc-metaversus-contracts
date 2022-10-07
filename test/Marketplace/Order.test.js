const { constants } = require("@openzeppelin/test-helpers");
const { expect } = require("chai");
const { upgrades, ethers } = require("hardhat");
const { add } = require("js-big-decimal");
const { getCurrentTime, skipTime } = require("../utils");
const { MerkleTree } = require("merkletreejs");
const keccak256 = require("keccak256");
const { parseEther } = require("ethers/lib/utils");

const TOTAL_SUPPLY = parseEther("1000");
const PRICE = parseEther("1");
const ONE_ETHER = parseEther("1");
const ONE_WEEK = 604800;
const MINT_FEE = 1000;
const BID_PRICE = parseEther("100");
const BUY_BID_PRICE = add(BID_PRICE, parseEther("100"));

describe.only("OrderManager:", () => {
    beforeEach(async () => {
        [owner, user1, user2, user3] = await ethers.getSigners();

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

        TemplateERC721 = await ethers.getContractFactory("TokenERC721");
        templateERC721 = await TemplateERC721.deploy();
        await templateERC721.deployed();

        TemplateERC1155 = await ethers.getContractFactory("TokenERC1155");
        templateERC1155 = await TemplateERC1155.deploy();
        await templateERC1155.deployed();

        CollectionFactory = await ethers.getContractFactory("CollectionFactory");
        collectionFactory = await upgrades.deployProxy(CollectionFactory, [
            templateERC721.address,
            templateERC1155.address,
            admin.address,
            user1.address,
            user2.address,
        ]);

        MkpManager = await ethers.getContractFactory("MarketPlaceManager");
        mkpManager = await upgrades.deployProxy(MkpManager, [treasury.address, admin.address]);

        CollectionFactory = await ethers.getContractFactory("CollectionFactory");
        collectionFactory = await upgrades.deployProxy(CollectionFactory, [
            templateERC721.address,
            templateERC1155.address,
            admin.address,
            user1.address,
            user2.address,
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

        OrderManager = await ethers.getContractFactory("OrderManager");
        orderManager = await upgrades.deployProxy(OrderManager, [mkpManager.address, admin.address]);

        await admin.setPermittedPaymentToken(token.address, true);
        await admin.setPermittedPaymentToken(constants.ZERO_ADDRESS, true);

        await token.connect(user1).approve(orderManager.address, ethers.constants.MaxUint256);
        await token.mint(user1.address, parseEther("1000"));

        await token.connect(user2).approve(orderManager.address, ethers.constants.MaxUint256);
        await token.mint(user2.address, parseEther("1000"));

        await mkpManager.setOrder(orderManager.address);

        const leaves = [user1.address, user2.address].map(value => keccak256(value));
        merkleTree = new MerkleTree(leaves, keccak256, { sort: true });

        rootHash = merkleTree.getHexRoot();
    });

    describe("Deployment:", async () => {
        it("Should revert when invalid admin contract address", async () => {
            await expect(
                upgrades.deployProxy(OrderManager, [mkpManager.address, constants.ZERO_ADDRESS])
            ).to.revertedWith("Invalid Admin contract");
            await expect(upgrades.deployProxy(OrderManager, [mkpManager.address, user1.address])).to.revertedWith(
                "Invalid Admin contract"
            );
            await expect(upgrades.deployProxy(OrderManager, [mkpManager.address, treasury.address])).to.revertedWith(
                "Invalid Admin contract"
            );
        });

        it("Should revert when invalid MarketplaceManager contract address", async () => {
            await expect(upgrades.deployProxy(OrderManager, [constants.ZERO_ADDRESS, admin.address])).to.revertedWith(
                "Invalid MarketplaceManager contract"
            );
            await expect(upgrades.deployProxy(OrderManager, [user1.address, admin.address])).to.revertedWith(
                "Invalid MarketplaceManager contract"
            );
            await expect(upgrades.deployProxy(OrderManager, [treasury.address, admin.address])).to.revertedWith(
                "Invalid MarketplaceManager contract"
            );
        });

        it("should be ok", async () => {
            await upgrades.deployProxy(OrderManager, [mkpManager.address, admin.address]);

            expect(await orderManager.marketplace()).to.equal(mkpManager.address);
        });
    });

    describe.only("makeWalletOrder function:", async () => {
        beforeEach(async () => {
            await orderManager.setPause(false);
            endTime = add(await getCurrentTime(), ONE_WEEK);
        });

        it.only("should revert when contract is paused", async () => {
            await orderManager.setPause(true);
            expect(await orderManager.paused()).to.equal(true);

            await expect(
                orderManager
                    .connect(user1)
                    .makeWalletOrder(token.address, BID_PRICE, user1.address, nftTest.address, 1, 1, endTime)
            ).to.revertedWith("Pausable: paused");
        });

        it("should be fail when invalid payment token", async () => {
            await expect(
                orderManager.makeWalletOrder(treasury.address, BID_PRICE, user1.address, nftTest.address, 1, 1, endTime)
            ).to.revertedWith("Payment token is not supported");
        });

        it("should be fail when insufficient allowance", async () => {
            await expect(
                orderManager.makeWalletOrder(token.address, BID_PRICE, user1.address, nftTest.address, 1, 1, endTime)
            ).to.revertedWith("Token is not existed");
        });

        it("Should be ok when create new offer", async () => {
            await orderManager
                .connect(user1)
                .makeWalletOrder(token.address, BID_PRICE, user1.address, nftTest.address, 1, 1, endTime);

            const order = await mkpManager.getOrderIdToOrderInfo(1);
            expect(order.orderId).to.equal(1);
            expect(order.bidder).to.equal(user1.address);
            expect(order.paymentToken).to.equal(token.address);
            expect(order.bidPrice).to.equal(BID_PRICE);
            expect(order.marketItemId).to.equal(0);
            expect(order.walletAsset.owner).to.equal(user1.address);
            expect(order.walletAsset.nftAddress).to.equal(nftTest.address);
            expect(order.walletAsset.tokenId).to.equal(1);
        });

        it("Should be ok when update offer", async () => {
            await orderManager
                .connect(user1)
                .makeWalletOrder(token.address, BID_PRICE, user1.address, nftTest.address, 1, 1, endTime);

            let order = await mkpManager.getOrderIdToOrderInfo(1);
            expect(order.bidPrice).to.equal(BID_PRICE);

            await orderManager
                .connect(user1)
                .makeWalletOrder(
                    token.address,
                    add(BID_PRICE, parseEther("100")),
                    user1.address,
                    nftTest.address,
                    1,
                    1,
                    endTime
                );

            order = await mkpManager.getOrderIdToOrderInfo(1);
            expect(order.bidPrice).to.equal(add(BID_PRICE, parseEther("100")));
        });
    });

    describe("makeOffer function:", async () => {
        beforeEach(async () => {
            await orderManager.setPause(false);
            endTime = add(await getCurrentTime(), ONE_WEEK);

            await orderManager
                .connect(user1)
                .makeOfferWalletAsset(token.address, BID_PRICE, user1.address, nftTest.address, 1, 1, endTime);

            order = await mkpManager.getOrderIdToOrderInfo(1);
        });

        it("should revert when contract is paused", async () => {
            await orderManager.setPause(true);
            expect(await orderManager.paused()).to.equal(true);

            await expect(
                orderManager.connect(user2).makeOffer(order.marketItemId, token.address, BUY_BID_PRICE, endTime)
            ).to.revertedWith("Pausable: paused");
        });

        it("should be fail when invalid payment token", async () => {
            await expect(
                orderManager.makeOffer(order.marketItemId, treasury.address, BUY_BID_PRICE, endTime)
            ).to.revertedWith("ERROR: payment token is not supported !");
        });

        it("Should be ok when create buy offer", async () => {
            const startTime = await getCurrentTime();
            const endTime = add(await getCurrentTime(), ONE_WEEK);

            await token.mint(user1.address, ONE_ETHER);
            await token.connect(user1).approve(nftTest.address, ethers.constants.MaxUint256);

            await nftTest.connect(user1).buy("this_uri");
            await nftTest.connect(user1).approve(orderManager.address, 1);

            const leaves = [user1.address, user2.address].map(value => keccak256(value));
            merkleTree = new MerkleTree(leaves, keccak256, { sort: true });

            rootHash = merkleTree.getHexRoot();

            await orderManager
                .connect(user1)
                .sell(nftTest.address, 1, 1, 1000, startTime, endTime, token.address, rootHash);

            await orderManager.connect(user2).makeOffer(1, token.address, BUY_BID_PRICE, endTime);

            const buyOrder = await mkpManager.getOrderIdToOrderInfo(2);
            expect(buyOrder.orderId).to.equal(2);
            expect(buyOrder.bidder).to.equal(user2.address);
            expect(buyOrder.paymentToken).to.equal(token.address);
            expect(buyOrder.bidPrice).to.equal(BUY_BID_PRICE);
            expect(buyOrder.marketItemId).to.equal(buyOrder.marketItemId);
        });

        it("Should be ok when update buy offer", async () => {
            const startTime = await getCurrentTime();
            const endTime = add(await getCurrentTime(), ONE_WEEK);

            await token.mint(user1.address, ONE_ETHER);
            await token.connect(user1).approve(nftTest.address, ethers.constants.MaxUint256);

            await nftTest.connect(user1).buy("this_uri");
            await nftTest.connect(user1).approve(orderManager.address, 1);

            const leaves = [user1.address, user2.address].map(value => keccak256(value));
            merkleTree = new MerkleTree(leaves, keccak256, { sort: true });

            rootHash = merkleTree.getHexRoot();

            await orderManager
                .connect(user1)
                .sell(nftTest.address, 1, 1, 1000, startTime, endTime, token.address, rootHash);

            await orderManager.connect(user2).makeOffer(1, token.address, BUY_BID_PRICE, endTime);

            let buyOrder = await mkpManager.getOrderIdToOrderInfo(2);
            expect(buyOrder.bidPrice).to.equal(BUY_BID_PRICE);

            await orderManager
                .connect(user2)
                .makeOffer(1, token.address, add(BUY_BID_PRICE, parseEther("100")), endTime);

            buyOrder = await mkpManager.getOrderIdToOrderInfo(2);
            expect(buyOrder.bidPrice).to.equal(add(BUY_BID_PRICE, parseEther("100")));
        });
    });

    describe("acceptOffer function:", async () => {
        beforeEach(async () => {
            await orderManager.setPause(false);

            const startTime = await getCurrentTime();
            const endTime = add(await getCurrentTime(), ONE_WEEK);

            await token.mint(user1.address, ONE_ETHER);
            await token.connect(user1).approve(nftTest.address, ethers.constants.MaxUint256);

            await nftTest.connect(user1).buy("this_uri");
            await nftTest.connect(user1).approve(orderManager.address, 1);

            const leaves = [user1.address, user2.address].map(value => keccak256(value));
            merkleTree = new MerkleTree(leaves, keccak256, { sort: true });

            rootHash = merkleTree.getHexRoot();

            await orderManager
                .connect(user1)
                .sell(nftTest.address, 1, 1, 1000, startTime, endTime, token.address, rootHash);

            const marketItemId = await mkpManager.getCurrentMarketItem();
            await orderManager.connect(user2).makeOffer(marketItemId, token.address, BUY_BID_PRICE, endTime);

            order = await mkpManager.getOrderIdToOrderInfo(1);
        });

        it("should revert when contract is paused", async () => {
            await orderManager.setPause(true);
            expect(await orderManager.paused()).to.equal(true);

            await expect(orderManager.connect(user1).acceptOffer(1)).to.revertedWith("Pausable: paused");
        });

        it("should be fail when Invalid seller of asset", async () => {
            await expect(orderManager.connect(user2).acceptOffer(order.orderId)).to.revertedWith(
                "ERROR: Invalid seller of asset !"
            );
        });

        it("should be fail when Overtime", async () => {
            await skipTime(ONE_WEEK);
            await expect(orderManager.connect(user1).acceptOffer(order.orderId)).to.revertedWith("ERROR: Overtime !");
        });

        it("Should be ok", async () => {
            await orderManager.connect(user1).acceptOffer(order.orderId);
            expect(await nftTest.ownerOf(1)).to.equal(user2.address);
        });
    });

    describe("Sell function:", async () => {
        beforeEach(async () => {
            await orderManager.setPause(false);
            startTime = await getCurrentTime();
            endTime = add(await getCurrentTime(), ONE_WEEK);

            const leaves = [user1.address, user2.address].map(value => keccak256(value));
            merkleTree = new MerkleTree(leaves, keccak256, { sort: true });

            rootHash = merkleTree.getHexRoot();
        });

        it("should revert when contract is paused", async () => {
            await orderManager.setPause(true);
            expect(await orderManager.paused()).to.equal(true);

            await expect(
                orderManager.sell(constants.ZERO_ADDRESS, 0, 100, 100, startTime, endTime, token.address, rootHash)
            ).to.revertedWith("Pausable: paused");
        });

        it("should revert when nft contract is not permitted: ", async () => {
            await expect(
                orderManager.sell(constants.ZERO_ADDRESS, 0, 100, 100, startTime, endTime, token.address, rootHash)
            ).to.be.revertedWith("ERROR: NFT address is compatible !");
        });

        it("should revert when amount equal to zero: ", async () => {
            await expect(
                orderManager.sell(tokenMintERC721.address, 0, 0, 100, startTime, endTime, token.address, rootHash)
            ).to.be.revertedWith("Invalid amount");
        });
        it("should revert when gross sale value equal to zero: ", async () => {
            await expect(
                orderManager.sell(tokenMintERC721.address, 0, 100, 0, startTime, endTime, token.address, rootHash)
            ).to.be.revertedWith("Invalid amount");
        });
        it("should revert ERROR: NFT address is compatible !", async () => {
            await token.mint(user1.address, ONE_ETHER);

            await token.connect(user1).approve(tokenMintERC721.address, ethers.constants.MaxUint256);

            const current = await getCurrentTime();

            await expect(
                orderManager
                    .connect(user1)
                    .sell(treasury.address, 1, 1, 1000, current, add(current, ONE_WEEK), token.address, rootHash)
            ).to.be.revertedWith("ERROR: NFT address is compatible !");
        });
        it("should sell success and check private collection: ", async () => {
            await token.mint(user1.address, ONE_ETHER);
            await token.connect(user1).approve(nftTest.address, ethers.constants.MaxUint256);

            await nftTest.connect(user1).buy("this_uri");
            await nftTest.connect(user1).approve(orderManager.address, 1);

            await orderManager
                .connect(user1)
                .sell(nftTest.address, 1, 1, 1000, startTime, endTime, token.address, rootHash);

            const leaf = keccak256(user1.address);
            const proof = merkleTree.getHexProof(leaf);

            const marketItemId = await mkpManager.getCurrentMarketItem();
            expect(await mkpManager.verify(marketItemId.toNumber(), proof, user1.address)).to.equal(true);
            expect(await nftTest.ownerOf(1)).to.equal(mkpManager.address);
        });
    });

    describe("refundBidAmount function:", async () => {
        beforeEach(async () => {
            await orderManager.setPause(false);

            const startTime = await getCurrentTime();
            const endTime = add(await getCurrentTime(), ONE_WEEK);

            await token.mint(user1.address, ONE_ETHER);
            await token.connect(user1).approve(nftTest.address, ethers.constants.MaxUint256);

            await nftTest.connect(user1).buy("this_uri");
            await nftTest.connect(user1).approve(orderManager.address, 1);

            const leaves = [user1.address, user2.address].map(value => keccak256(value));
            merkleTree = new MerkleTree(leaves, keccak256, { sort: true });

            rootHash = merkleTree.getHexRoot();

            await orderManager
                .connect(user1)
                .sell(nftTest.address, 1, 1, 1000, startTime, endTime, token.address, rootHash);

            const marketItemId = await mkpManager.getCurrentMarketItem();
            await orderManager.connect(user2).makeOffer(marketItemId, token.address, BUY_BID_PRICE, endTime);

            order = await mkpManager.getOrderIdToOrderInfo(1);
        });

        it("should revert when contract is paused", async () => {
            await orderManager.setPause(true);
            expect(await orderManager.paused()).to.equal(true);

            await expect(orderManager.refundBidAmount(order.orderId)).to.revertedWith("Pausable: paused");
        });

        it("should be fail when Invalid bidder", async () => {
            await expect(orderManager.connect(user1).refundBidAmount(order.orderId)).to.revertedWith(
                "ERROR: Invalid bidder !"
            );
        });

        it("Should be ok", async () => {
            await orderManager.connect(user2).refundBidAmount(order.orderId);

            const orderAfter = await mkpManager.getOrderIdToOrderInfo(1);
            expect(orderAfter.orderId).to.equal(0);
            expect(orderAfter.bidder).to.equal(constants.ZERO_ADDRESS);
            expect(orderAfter.paymentToken).to.equal(constants.ZERO_ADDRESS);
            expect(orderAfter.bidPrice).to.equal(0);
            expect(orderAfter.marketItemId).to.equal(0);
        });
    });

    describe("sellAvailableInMarketplace function:", async () => {
        beforeEach(async () => {
            await orderManager.setPause(false);
            startTime = await getCurrentTime();
            endTime = add(await getCurrentTime(), ONE_WEEK);

            const leaves = [user1.address, user2.address].map(value => keccak256(value));
            merkleTree = new MerkleTree(leaves, keccak256, { sort: true });

            rootHash = merkleTree.getHexRoot();

            await token.mint(user1.address, ONE_ETHER);
            await token.connect(user1).approve(nftTest.address, ethers.constants.MaxUint256);

            await nftTest.connect(user1).buy("this_uri");
            await nftTest.connect(user1).approve(orderManager.address, 1);

            await orderManager
                .connect(user1)
                .sell(nftTest.address, 1, 1, 1000, startTime, endTime, token.address, rootHash);

            marketItemId = await mkpManager.getCurrentMarketItem();
        });

        it("should revert when contract is paused", async () => {
            await orderManager.setPause(true);
            expect(await orderManager.paused()).to.equal(true);

            await expect(
                orderManager.sellAvailableInMarketplace(1, PRICE, 1000, startTime, endTime, token.address)
            ).to.revertedWith("Pausable: paused");
        });

        it("should be fail when market item is not free", async () => {
            await expect(
                orderManager
                    .connect(user1)
                    .sellAvailableInMarketplace(
                        marketItemId,
                        add(PRICE, parseEther("100")),
                        1000,
                        startTime,
                        endTime,
                        token.address
                    )
            ).to.revertedWith("ERROR: market item is not free !");
        });

        it("should be fail when sender is not owner this NFT", async () => {
            await skipTime(ONE_WEEK);
            await expect(
                orderManager
                    .connect(user2)
                    .sellAvailableInMarketplace(
                        marketItemId,
                        add(PRICE, parseEther("100")),
                        1000,
                        startTime,
                        endTime,
                        token.address
                    )
            ).to.revertedWith("ERROR: sender is not owner this NFT");
        });

        it("should be ok", async () => {
            await skipTime(ONE_WEEK);

            const newStartTime = await getCurrentTime();
            const newEndTime = add(await getCurrentTime(), ONE_WEEK * 2);
            await orderManager
                .connect(user1)
                .sellAvailableInMarketplace(
                    marketItemId,
                    add(PRICE, parseEther("100")),
                    1000,
                    newStartTime,
                    newEndTime,
                    token.address
                );

            const marketItem = await mkpManager.getMarketItemIdToMarketItem(marketItemId);
            expect((marketItem.price = 1000));
            expect((marketItem.status = 0));
            expect((marketItem.startTime = newStartTime));
            expect((marketItem.endTime = newEndTime));
            expect((marketItem.paymentToken = token.address));
        });
    });

    describe("cancelSell function:", async () => {
        beforeEach(async () => {
            await orderManager.setPause(false);
            startTime = await getCurrentTime();
            endTime = add(await getCurrentTime(), ONE_WEEK);

            const leaves = [user1.address, user2.address].map(value => keccak256(value));
            merkleTree = new MerkleTree(leaves, keccak256, { sort: true });

            rootHash = merkleTree.getHexRoot();

            await token.mint(user1.address, ONE_ETHER);
            await token.connect(user1).approve(nftTest.address, ethers.constants.MaxUint256);

            await nftTest.connect(user1).buy("this_uri");
            await nftTest.connect(user1).approve(orderManager.address, 1);

            await orderManager
                .connect(user1)
                .sell(nftTest.address, 1, 1, 1000, startTime, endTime, token.address, rootHash);

            marketItemId = await mkpManager.getCurrentMarketItem();
        });

        it("should revert when contract is paused", async () => {
            await orderManager.setPause(true);
            expect(await orderManager.paused()).to.equal(true);

            await expect(orderManager.cancelSell(marketItemId)).to.revertedWith("Pausable: paused");
        });

        it("should be fail when not the seller !", async () => {
            await expect(orderManager.connect(user1).cancelSell(marketItemId + 1)).to.revertedWith(
                "ERROR: you are not the seller !"
            );
        });

        it("should be ok", async () => {
            await orderManager.connect(user1).cancelSell(marketItemId);

            const marketItem = await mkpManager.getMarketItemIdToMarketItem(marketItemId);
            expect((marketItem.price = 0));
            expect((marketItem.status = 0));
            expect((marketItem.startTime = 0));
            expect((marketItem.endTime = 0));
            expect((marketItem.paymentToken = constants.ZERO_ADDRESS));
            expect(await nftTest.ownerOf(1)).to.equal(user1.address);
        });
    });

    describe("buy function:", async () => {
        beforeEach(async () => {
            await orderManager.setPause(false);
            startTime = await getCurrentTime();
            endTime = add(await getCurrentTime(), ONE_WEEK);

            const leaves = [user1.address, user2.address].map(value => keccak256(value));
            merkleTree = new MerkleTree(leaves, keccak256, { sort: true });

            rootHash = merkleTree.getHexRoot();

            await token.mint(user1.address, ONE_ETHER);
            await token.connect(user1).approve(nftTest.address, ethers.constants.MaxUint256);

            await nftTest.connect(user1).buy("this_uri");
            await nftTest.connect(user1).approve(orderManager.address, 1);

            await orderManager
                .connect(user1)
                .sell(nftTest.address, 1, 1, 1000, startTime, endTime, token.address, rootHash);

            marketItemId = await mkpManager.getCurrentMarketItem();
        });

        it("should revert when contract is paused", async () => {
            await orderManager.setPause(true);
            expect(await orderManager.paused()).to.equal(true);

            await expect(orderManager.buy(marketItemId, [])).to.revertedWith("Pausable: paused");
        });

        it("should be fail when not allow to buy yourself !", async () => {
            const leaf = keccak256(user1.address);
            const proof = merkleTree.getHexProof(leaf);
            await expect(orderManager.connect(user1).buy(marketItemId, proof)).to.revertedWith(
                "ERROR: Not allow to buy yourself"
            );
        });

        it("should be fail when NFT is not selling !", async () => {
            await skipTime(ONE_WEEK);
            const leaf = keccak256(user2.address);
            const proof = merkleTree.getHexProof(leaf);
            await expect(orderManager.connect(user2).buy(marketItemId, proof)).to.revertedWith(
                "ERROR: NFT is not selling"
            );
        });

        it("should be ok", async () => {
            const leaf = keccak256(user2.address);
            const proof = merkleTree.getHexProof(leaf);
            await orderManager.connect(user2).buy(marketItemId, proof);

            const marketItem = await mkpManager.getMarketItemIdToMarketItem(marketItemId);
            expect((marketItem.status = 2));
            expect(await nftTest.ownerOf(1)).to.equal(user2.address);
        });
    });
});
