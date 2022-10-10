const { expect } = require("chai");
const { upgrades, ethers } = require("hardhat");
const { MaxUint256, AddressZero } = ethers.constants;
const { add } = require("js-big-decimal");
const { getCurrentTime, skipTime, setTime, generateMerkleTree, generateLeaf } = require("../utils");
const keccak256 = require("keccak256");
const { parseEther } = require("ethers/lib/utils");

const TOTAL_SUPPLY = parseEther("1000000000000");
const PRICE = parseEther("1");
const ONE_ETHER = parseEther("1");
const ETHER_10 = parseEther("10");
const ETHER_100 = parseEther("100");
const ONE_WEEK = 604800;
const MINT_FEE = 1000;
const BID_PRICE = ETHER_100;
const BUY_BID_PRICE = BID_PRICE.add(BID_PRICE);

const OrderStatus = {
    PENDING: 0,
    ACCEPTED: 1,
    CANCELED: 2,
};

const MARKET_ITEM_STATUS = {
    LISTING: 0,
    SOLD: 1,
    CANCELED: 2,
};

describe("OrderManager:", () => {
    beforeEach(async () => {
        [owner, user1, user2, user3] = await ethers.getSigners();

        Admin = await ethers.getContractFactory("Admin");
        admin = await upgrades.deployProxy(Admin, [owner.address]);

        Treasury = await ethers.getContractFactory("Treasury");
        treasury = await upgrades.deployProxy(Treasury, [admin.address]);

        Token = await ethers.getContractFactory("MTVS");
        token = await upgrades.deployProxy(Token, ["Metaversus Token", "MTVS", TOTAL_SUPPLY, owner.address]);

        await admin.setPermittedPaymentToken(token.address, true);
        await admin.setPermittedPaymentToken(AddressZero, true);

        MetaCitizen = await ethers.getContractFactory("MetaCitizen");
        metaCitizen = await upgrades.deployProxy(MetaCitizen, [token.address, MINT_FEE, admin.address]);

        TokenMintERC721 = await ethers.getContractFactory("TokenMintERC721");
        tokenMintERC721 = await upgrades.deployProxy(TokenMintERC721, ["NFT Metaversus", "nMTVS", 250, admin.address]);

        TokenMintERC1155 = await ethers.getContractFactory("TokenMintERC1155");
        tokenMintERC1155 = await upgrades.deployProxy(TokenMintERC1155, [250, admin.address]);

        NftTest = await ethers.getContractFactory("NftTest");
        nftTest = await upgrades.deployProxy(NftTest, ["NFT test", "NFT", token.address, 250, PRICE, admin.address]);

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
        mkpManager = await upgrades.deployProxy(MkpManager, [admin.address]);

        MTVSManager = await ethers.getContractFactory("MetaversusManager");
        mtvsManager = await upgrades.deployProxy(MTVSManager, [
            tokenMintERC721.address,
            tokenMintERC1155.address,
            token.address,
            mkpManager.address,
            collectionFactory.address,
            admin.address,
        ]);

        OrderManager = await ethers.getContractFactory("OrderManager");
        orderManager = await upgrades.deployProxy(OrderManager, [mkpManager.address, admin.address]);

        await admin.setAdmin(mtvsManager.address, true);

        await mkpManager.setMetaversusManager(mtvsManager.address);
        await mkpManager.setOrderManager(orderManager.address);
        await token.connect(user1).approve(orderManager.address, MaxUint256);
        await token.transfer(user1.address, parseEther("1000"));

        await token.connect(user2).approve(orderManager.address, MaxUint256);
        await token.transfer(user2.address, parseEther("1000"));

        await mkpManager.setOrderManager(orderManager.address);

        merkleTree = await generateMerkleTree([user1.address, user2.address]);

        rootHash = merkleTree.getHexRoot();
    });

    describe("Deployment:", async () => {
        it("Should revert when invalid admin contract address", async () => {
            await expect(upgrades.deployProxy(OrderManager, [mkpManager.address, AddressZero])).to.revertedWith(
                "Invalid Admin contract"
            );
            await expect(upgrades.deployProxy(OrderManager, [mkpManager.address, user1.address])).to.revertedWith(
                "Invalid Admin contract"
            );
            await expect(upgrades.deployProxy(OrderManager, [mkpManager.address, treasury.address])).to.revertedWith(
                "Invalid Admin contract"
            );
        });

        it("should be ok", async () => {
            await upgrades.deployProxy(OrderManager, [mkpManager.address, admin.address]);

            expect(await orderManager.marketplace()).to.equal(mkpManager.address);
            expect(await orderManager.admin()).to.equal(admin.address);
        });
    });

    describe("makeWalletOrder function:", async () => {
        beforeEach(async () => {
            endTime = add(await getCurrentTime(), ONE_WEEK);

            await tokenMintERC721.mintBatch(user2.address, Array(10).fill("this_uri"));
        });

        it("should revert when contract is paused", async () => {
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
                orderManager.makeWalletOrder(
                    token.address,
                    BID_PRICE,
                    user2.address,
                    tokenMintERC721.address,
                    1,
                    1,
                    endTime
                )
            ).to.revertedWith("ERC20: insufficient allowance");
        });

        it("should be fail when invalid bid price", async () => {
            await expect(
                orderManager.makeWalletOrder(token.address, 0, user1.address, nftTest.address, 1, 1, endTime)
            ).to.revertedWith("Invalid amount");
        });

        it("should be fail when invalid amount", async () => {
            await expect(
                orderManager.makeWalletOrder(token.address, BID_PRICE, user1.address, nftTest.address, 1, 0, endTime)
            ).to.revertedWith("Invalid amount");
        });

        it("should be fail when invalid wallets", async () => {
            await expect(
                orderManager.makeWalletOrder(token.address, BID_PRICE, AddressZero, nftTest.address, 1, 1, endTime)
            ).to.revertedWith("Invalid wallets");

            await expect(
                orderManager.makeWalletOrder(token.address, BID_PRICE, nftTest.address, nftTest.address, 1, 1, endTime)
            ).to.revertedWith("Invalid wallets");
        });

        it("should be fail when invalid time", async () => {
            await expect(
                orderManager.makeWalletOrder(token.address, BID_PRICE, user1.address, nftTest.address, 1, 1, 0)
            ).to.revertedWith("Invalid order time");
        });

        it("should be fail when offer my self", async () => {
            await expect(
                orderManager
                    .connect(user1)
                    .makeWalletOrder(token.address, BID_PRICE, user1.address, nftTest.address, 1, 1, endTime)
            ).to.revertedWith("User can not offer");
        });

        it("should be fail when update payment token", async () => {
            await orderManager
                .connect(user1)
                .makeWalletOrder(token.address, BID_PRICE, user2.address, tokenMintERC721.address, 1, 1, endTime);

            await expect(
                orderManager
                    .connect(user1)
                    .makeWalletOrder(
                        AddressZero,
                        BID_PRICE.add(ONE_ETHER),
                        user2.address,
                        tokenMintERC721.address,
                        1,
                        1,
                        endTime
                    )
            ).to.revertedWith("Can not update payment token");
        });

        it("should be fail when invalid nft address", async () => {
            await expect(
                orderManager
                    .connect(user1)
                    .makeWalletOrder(AddressZero, BID_PRICE.add(ONE_ETHER), user2.address, AddressZero, 1, 1, endTime)
            ).to.revertedWith("Invalid nft address");

            await expect(
                orderManager
                    .connect(user1)
                    .makeWalletOrder(AddressZero, BID_PRICE.add(ONE_ETHER), user2.address, token.address, 1, 1, endTime)
            ).to.revertedWith("Invalid nft address");
        });

        it("should be fail when invalid token id", async () => {
            await expect(
                orderManager
                    .connect(user1)
                    .makeWalletOrder(
                        AddressZero,
                        BID_PRICE.add(ONE_ETHER),
                        user3.address,
                        tokenMintERC721.address,
                        1,
                        1,
                        endTime
                    )
            ).to.revertedWith("Invalid token id");

            await expect(
                orderManager
                    .connect(user1)
                    .makeWalletOrder(
                        AddressZero,
                        BID_PRICE.add(ONE_ETHER),
                        user2.address,
                        tokenMintERC1155.address,
                        1,
                        1,
                        endTime
                    )
            ).to.revertedWith("Invalid token id");
        });

        it("Should be ok when create new offer", async () => {
            await orderManager
                .connect(user1)
                .makeWalletOrder(token.address, BID_PRICE, user2.address, tokenMintERC721.address, 1, 1, endTime);

            const order = await orderManager.getOrderByWalletOrderId(1);

            expect(order[0].owner).to.equal(user1.address);
            expect(order[1].paymentToken).to.equal(token.address);
            expect(order[1].bidPrice).to.equal(BID_PRICE);

            expect(order[0].to).to.equal(user2.address);
            expect(order[0].nftAddress).to.equal(tokenMintERC721.address);
            expect(order[0].tokenId).to.equal(1);
            expect(order[1].expiredTime).to.equal(endTime);
        });

        it("Should be ok when update offer more than amount", async () => {
            await orderManager
                .connect(user1)
                .makeWalletOrder(token.address, BID_PRICE, user2.address, tokenMintERC721.address, 1, 1, endTime);

            let order = await orderManager.getOrderByWalletOrderId(1);

            expect(order[1].bidPrice).to.equal(BID_PRICE);

            await orderManager
                .connect(user1)
                .makeWalletOrder(
                    token.address,
                    BID_PRICE.add(ETHER_100),
                    user2.address,
                    tokenMintERC721.address,
                    1,
                    1,
                    endTime
                );

            order = await orderManager.getOrderByWalletOrderId(1);
            expect(order[1].bidPrice).to.equal(BID_PRICE.add(ETHER_100));
        });

        it("Should be ok when update offer less than amount", async () => {
            await orderManager
                .connect(user1)
                .makeWalletOrder(token.address, BID_PRICE, user2.address, tokenMintERC721.address, 1, 1, endTime);

            let order = await orderManager.getOrderByWalletOrderId(1);

            expect(order[1].bidPrice).to.equal(BID_PRICE);
            await expect(() =>
                orderManager
                    .connect(user1)
                    .makeWalletOrder(
                        token.address,
                        BID_PRICE.sub(ETHER_10),
                        user2.address,
                        tokenMintERC721.address,
                        1,
                        1,
                        endTime
                    )
            ).to.changeTokenBalance(token, user1, ETHER_10);

            order = await orderManager.getOrderByWalletOrderId(1);
            expect(order[1].bidPrice).to.equal(BID_PRICE.sub(ETHER_10));
        });

        it("Should be ok when create new offer using native", async () => {
            const eth_before = await ethers.provider.getBalance(orderManager.address);
            await expect(() =>
                orderManager
                    .connect(user1)
                    .makeWalletOrder(AddressZero, BID_PRICE, user2.address, tokenMintERC721.address, 1, 1, endTime, {
                        value: BID_PRICE,
                    })
            ).to.changeEtherBalances([user1], [BID_PRICE.mul(-1)]);

            const eth_after = await ethers.provider.getBalance(orderManager.address);

            expect(eth_after.sub(eth_before)).to.equal(BID_PRICE);

            const order = await orderManager.getOrderByWalletOrderId(1);

            expect(order[0].owner).to.equal(user1.address);
            expect(order[1].paymentToken).to.equal(AddressZero);
            expect(order[1].bidPrice).to.equal(BID_PRICE);

            expect(order[0].to).to.equal(user2.address);
            expect(order[0].nftAddress).to.equal(tokenMintERC721.address);
            expect(order[0].tokenId).to.equal(1);
            expect(order[1].expiredTime).to.equal(endTime);
        });

        it("Should be ok when update offer native more than amount", async () => {
            await expect(() =>
                orderManager
                    .connect(user1)
                    .makeWalletOrder(AddressZero, BID_PRICE, user2.address, tokenMintERC721.address, 1, 1, endTime, {
                        value: BID_PRICE,
                    })
            ).to.changeEtherBalances([user1], [BID_PRICE.mul(-1)]);

            let order = await orderManager.getOrderByWalletOrderId(1);

            expect(order[1].bidPrice).to.equal(BID_PRICE);

            await expect(() =>
                orderManager
                    .connect(user1)
                    .makeWalletOrder(
                        AddressZero,
                        BID_PRICE.add(ONE_ETHER),
                        user2.address,
                        tokenMintERC721.address,
                        1,
                        1,
                        endTime,
                        { value: ONE_ETHER }
                    )
            ).to.changeEtherBalances([user1], [ONE_ETHER.mul(-1)]);

            order = await orderManager.getOrderByWalletOrderId(1);
            expect(order[1].bidPrice).to.equal(BID_PRICE.add(ONE_ETHER));
        });

        it("Should be ok when update offer native less than amount", async () => {
            await expect(() =>
                orderManager
                    .connect(user1)
                    .makeWalletOrder(AddressZero, BID_PRICE, user2.address, tokenMintERC721.address, 1, 1, endTime, {
                        value: BID_PRICE,
                    })
            ).to.changeEtherBalances([user1], [BID_PRICE.mul(-1)]);

            let order = await orderManager.getOrderByWalletOrderId(1);

            expect(order[1].bidPrice).to.equal(BID_PRICE);
            await expect(() =>
                orderManager
                    .connect(user1)
                    .makeWalletOrder(
                        AddressZero,
                        BID_PRICE.sub(ONE_ETHER),
                        user2.address,
                        tokenMintERC721.address,
                        1,
                        1,
                        endTime
                    )
            ).to.changeEtherBalance(user1, ONE_ETHER);

            order = await orderManager.getOrderByWalletOrderId(1);
            expect(order[1].bidPrice).to.equal(BID_PRICE.sub(ONE_ETHER));
        });
    });

    describe("makeMarketItemOrder function:", async () => {
        beforeEach(async () => {
            current = await getCurrentTime();
            endTime = current + ONE_WEEK;

            await mtvsManager
                .connect(user2)
                .createNFT(true, 1, 100, "this_uri", ONE_ETHER, current + 100, current + 10000, token.address, []);
        });

        it("should revert when contract is paused", async () => {
            await orderManager.setPause(true);
            expect(await orderManager.paused()).to.equal(true);
            let marketItemId = await mkpManager.getCurrentMarketItem();
            await expect(
                orderManager.connect(user2).makeMarketItemOrder(marketItemId, BUY_BID_PRICE, endTime, [])
            ).to.revertedWith("Pausable: paused");
        });

        it("should revert when invalid market id", async () => {
            let marketItemId = await mkpManager.getCurrentMarketItem();
            await expect(
                orderManager.connect(user2).makeMarketItemOrder(marketItemId.add(1), BUY_BID_PRICE, endTime, [])
            ).to.revertedWith("Market ID is not exist");
        });

        it("should revert when invalid price", async () => {
            let marketItemId = await mkpManager.getCurrentMarketItem();
            await expect(orderManager.connect(user2).makeMarketItemOrder(marketItemId, 0, endTime, [])).to.revertedWith(
                "Invalid amount"
            );
        });

        it("should revert when invalid order time", async () => {
            let marketItemId = await mkpManager.getCurrentMarketItem();
            await expect(
                orderManager.connect(user2).makeMarketItemOrder(marketItemId, BUY_BID_PRICE, 0, [])
            ).to.revertedWith("Invalid order time");
        });

        it("should revert when Market Item is not available", async () => {
            let marketItemId = await mkpManager.getCurrentMarketItem();

            await orderManager.connect(user2).cancelSell(marketItemId);

            await expect(
                orderManager.connect(user2).makeMarketItemOrder(marketItemId, BUY_BID_PRICE, endTime, [])
            ).to.revertedWith("Market Item is not available");
        });

        it("should revert when Not the order time", async () => {
            await mtvsManager
                .connect(user2)
                .createNFT(true, 1, 100, "this_uri", ONE_ETHER, current + 100, current + 86400, token.address, []);

            let marketItemId = await mkpManager.getCurrentMarketItem();

            await expect(
                orderManager.connect(user2).makeMarketItemOrder(marketItemId, BUY_BID_PRICE, endTime, [])
            ).to.revertedWith("Not the order time");
        });

        it("should be revert when offer my self", async () => {
            let marketItemId = await mkpManager.getCurrentMarketItem();
            const marketItem = await mkpManager.getMarketItemIdToMarketItem(marketItemId);
            const time = Number(marketItem.endTime.sub(marketItem.startTime).div(2)) + current;

            await setTime(Number(marketItem.startTime.add(100)));

            await expect(
                orderManager.connect(user2).makeMarketItemOrder(marketItemId, BUY_BID_PRICE, time, [])
            ).to.revertedWith("User can not offer");
        });

        it("should be revert when is not owned MetaCItizen", async () => {
            const startTime = await getCurrentTime();
            const endTime = add(await getCurrentTime(), ONE_WEEK);

            await token.transfer(user1.address, ONE_ETHER);
            await token.connect(user1).approve(nftTest.address, MaxUint256);

            await nftTest.connect(user1).buy("this_uri");
            await nftTest.connect(user1).approve(mkpManager.address, 1);

            merkleTree = await generateMerkleTree([user1.address, user2.address]);

            await orderManager
                .connect(user1)
                .sell(nftTest.address, 1, 1, 1000, startTime + 10, endTime, token.address, merkleTree.getHexRoot());

            await skipTime(100);
            await expect(
                orderManager
                    .connect(user2)
                    .makeMarketItemOrder(2, BUY_BID_PRICE, endTime, merkleTree.getHexProof(generateLeaf(user2.address)))
            ).to.revertedWith("Require own MetaCitizen NFT");
        });

        it("Should be ok when create buy offer", async () => {
            await metaCitizen.mint(user1.address);
            const startTime = await getCurrentTime();
            const endTime = add(await getCurrentTime(), ONE_WEEK);

            await token.transfer(user1.address, ONE_ETHER);
            await token.connect(user1).approve(nftTest.address, MaxUint256);

            await nftTest.connect(user1).buy("this_uri");
            await nftTest.connect(user1).approve(mkpManager.address, 1);

            merkleTree = await generateMerkleTree([user1.address, user2.address]);

            rootHash = merkleTree.getHexRoot();

            await orderManager
                .connect(user1)
                .sell(nftTest.address, 1, 1, 1000, startTime + 10, endTime, token.address, rootHash);

            await metaCitizen.mint(user2.address);
            const leaf = keccak256(user2.address);
            const proof = merkleTree.getHexProof(leaf);

            await skipTime(100);
            let marketItemId = await mkpManager.getCurrentMarketItem();
            await orderManager.connect(user2).makeMarketItemOrder(marketItemId, BUY_BID_PRICE, endTime, proof);

            const currentOrderId = await orderManager.getCurrentMarketItemOrderId();
            const order = await orderManager.getOrderByMarketItemOrderId(currentOrderId);

            expect(order[0].owner).to.equal(user2.address);
            expect(order[1].paymentToken).to.equal(token.address);
            expect(order[1].bidPrice).to.equal(BUY_BID_PRICE);
            expect(order[0].marketItemId).to.equal(marketItemId);

            await orderManager.connect(user2).cancelOrder(false, currentOrderId);
            await orderManager.connect(user2).makeMarketItemOrder(marketItemId, BUY_BID_PRICE, endTime, proof);
            expect(await orderManager.getCurrentMarketItemOrderId()).to.equal(currentOrderId.add(1));
        });

        it("Should be ok when update buy offer more than amount", async () => {
            const startTime = await getCurrentTime();
            const endTime = add(await getCurrentTime(), ONE_WEEK);

            await token.transfer(user1.address, ONE_ETHER);
            await token.connect(user1).approve(nftTest.address, MaxUint256);

            await nftTest.connect(user1).buy("this_uri");
            await nftTest.connect(user1).approve(mkpManager.address, 1);
            await metaCitizen.mint(user2.address);

            merkleTree = await generateMerkleTree([user1.address, user2.address]);

            rootHash = merkleTree.getHexRoot();
            const leaf = keccak256(user2.address);
            const proof = merkleTree.getHexProof(leaf);

            await orderManager
                .connect(user1)
                .sell(nftTest.address, 1, 1, 1000, startTime + 10, endTime, token.address, rootHash);

            await skipTime(100);
            let marketItemId = await mkpManager.getCurrentMarketItem();
            await orderManager.connect(user2).makeMarketItemOrder(marketItemId, BUY_BID_PRICE, endTime, proof);

            let order = await orderManager.getOrderByMarketItemOrderId(1);
            expect(order[1].bidPrice).to.equal(BUY_BID_PRICE);

            await orderManager
                .connect(user2)
                .makeMarketItemOrder(marketItemId, BUY_BID_PRICE.add(ETHER_100), endTime, proof);

            order = await orderManager.getOrderByMarketItemOrderId(1);
            expect(order[1].bidPrice).to.equal(BUY_BID_PRICE.add(ETHER_100));
        });

        it("Should be ok when update buy offer less than amount", async () => {
            const startTime = await getCurrentTime();
            const endTime = add(await getCurrentTime(), ONE_WEEK);

            await token.transfer(user1.address, ONE_ETHER);
            await token.connect(user1).approve(nftTest.address, MaxUint256);

            await nftTest.connect(user1).buy("this_uri");
            await nftTest.connect(user1).approve(mkpManager.address, 1);
            await metaCitizen.mint(user2.address);

            merkleTree = await generateMerkleTree([user1.address, user2.address]);

            rootHash = merkleTree.getHexRoot();
            const leaf = keccak256(user2.address);
            const proof = merkleTree.getHexProof(leaf);

            await orderManager
                .connect(user1)
                .sell(nftTest.address, 1, 1, 1000, startTime + 10, endTime, token.address, rootHash);

            await skipTime(100);
            let marketItemId = await mkpManager.getCurrentMarketItem();
            await orderManager.connect(user2).makeMarketItemOrder(marketItemId, BUY_BID_PRICE, endTime, proof);

            let order = await orderManager.getOrderByMarketItemOrderId(1);
            expect(order[1].bidPrice).to.equal(BUY_BID_PRICE);

            await orderManager
                .connect(user2)
                .makeMarketItemOrder(marketItemId, BUY_BID_PRICE.sub(ETHER_10), endTime, proof);

            order = await orderManager.getOrderByMarketItemOrderId(1);
            expect(order[1].bidPrice).to.equal(BUY_BID_PRICE.sub(ETHER_10));
        });

        it("Should be ok when create buy offer native", async () => {
            await metaCitizen.mint(user1.address);
            const startTime = await getCurrentTime();
            const endTime = add(await getCurrentTime(), ONE_WEEK);

            await token.transfer(user1.address, ONE_ETHER);
            await token.connect(user1).approve(nftTest.address, MaxUint256);

            await nftTest.connect(user1).buy("this_uri");
            await nftTest.connect(user1).approve(mkpManager.address, 1);

            merkleTree = await generateMerkleTree([user1.address, user2.address]);

            rootHash = merkleTree.getHexRoot();

            await orderManager
                .connect(user1)
                .sell(nftTest.address, 1, 1, 1000, startTime + 10, endTime, AddressZero, rootHash);

            await metaCitizen.mint(user2.address);
            const leaf = keccak256(user2.address);
            const proof = merkleTree.getHexProof(leaf);

            await skipTime(100);
            let marketItemId = await mkpManager.getCurrentMarketItem();

            const balance_before = await ethers.provider.getBalance(orderManager.address);

            await expect(() =>
                orderManager
                    .connect(user2)
                    .makeMarketItemOrder(marketItemId, BUY_BID_PRICE, endTime, proof, { value: BUY_BID_PRICE })
            ).to.changeEtherBalance(user2, BUY_BID_PRICE.mul(-1));

            const balance_after = await ethers.provider.getBalance(orderManager.address);
            expect(balance_after.sub(balance_before)).to.equal(BUY_BID_PRICE);

            let currentOrderId = await orderManager.getCurrentMarketItemOrderId();
            let order = await orderManager.getOrderByMarketItemOrderId(currentOrderId);

            expect(order[0].owner).to.equal(user2.address);
            expect(order[1].paymentToken).to.equal(AddressZero);
            expect(order[1].bidPrice).to.equal(BUY_BID_PRICE);
            expect(order[0].marketItemId).to.equal(marketItemId);

            await orderManager.connect(user2).cancelOrder(false, currentOrderId);

            order = await orderManager.getOrderByMarketItemOrderId(currentOrderId);

            expect(order[0].owner).to.equal(user2.address);
            expect(order[0].marketItemId).to.equal(marketItemId);
            expect(order[1].paymentToken).to.equal(AddressZero);
            expect(order[1].bidPrice).to.equal(BUY_BID_PRICE);
            expect(order[1].status).to.equal(OrderStatus.CANCELED);

            await orderManager
                .connect(user2)
                .makeMarketItemOrder(marketItemId, BUY_BID_PRICE, endTime, proof, { value: BUY_BID_PRICE });
            expect(await orderManager.getCurrentMarketItemOrderId()).to.equal(currentOrderId.add(1));

            currentOrderId = await orderManager.getCurrentMarketItemOrderId();
            order = await orderManager.getOrderByMarketItemOrderId(currentOrderId);

            expect(order[0].owner).to.equal(user2.address);
            expect(order[0].marketItemId).to.equal(marketItemId);
            expect(order[1].paymentToken).to.equal(AddressZero);
            expect(order[1].bidPrice).to.equal(BUY_BID_PRICE);
            expect(order[1].status).to.equal(OrderStatus.PENDING);

            order = await orderManager.getOrderByMarketItemOrderId(currentOrderId.sub(1));
            expect(order[1].status).to.equal(OrderStatus.CANCELED);
        });

        it("Should be ok when update buy offer more than amount native", async () => {
            const startTime = await getCurrentTime();
            const endTime = add(await getCurrentTime(), ONE_WEEK);

            await token.transfer(user1.address, ONE_ETHER);
            await token.connect(user1).approve(nftTest.address, MaxUint256);

            await nftTest.connect(user1).buy("this_uri");
            await nftTest.connect(user1).approve(mkpManager.address, 1);
            await metaCitizen.mint(user2.address);

            merkleTree = await generateMerkleTree([user1.address, user2.address]);

            rootHash = merkleTree.getHexRoot();
            const leaf = keccak256(user2.address);
            const proof = merkleTree.getHexProof(leaf);

            await orderManager
                .connect(user1)
                .sell(nftTest.address, 1, 1, 1000, startTime + 10, endTime, AddressZero, rootHash);

            await skipTime(100);
            let marketItemId = await mkpManager.getCurrentMarketItem();
            await expect(() =>
                orderManager
                    .connect(user2)
                    .makeMarketItemOrder(marketItemId, BUY_BID_PRICE, endTime, proof, { value: BUY_BID_PRICE })
            ).to.changeEtherBalance(user2, BUY_BID_PRICE.mul(-1));

            let order = await orderManager.getOrderByMarketItemOrderId(1);
            expect(order[1].bidPrice).to.equal(BUY_BID_PRICE);

            await expect(() =>
                orderManager
                    .connect(user2)
                    .makeMarketItemOrder(marketItemId, BUY_BID_PRICE.add(ETHER_100), endTime, proof, {
                        value: ETHER_100,
                    })
            ).to.changeEtherBalance(user2, ETHER_100.mul(-1));

            order = await orderManager.getOrderByMarketItemOrderId(1);
            expect(order[1].bidPrice).to.equal(BUY_BID_PRICE.add(ETHER_100));
        });

        it("Should be ok when update buy offer less than amount native", async () => {
            const startTime = await getCurrentTime();
            const endTime = add(await getCurrentTime(), ONE_WEEK);

            await token.transfer(user1.address, ONE_ETHER);
            await token.connect(user1).approve(nftTest.address, MaxUint256);

            await nftTest.connect(user1).buy("this_uri");
            await nftTest.connect(user1).approve(mkpManager.address, 1);
            await metaCitizen.mint(user2.address);

            merkleTree = await generateMerkleTree([user1.address, user2.address]);

            rootHash = merkleTree.getHexRoot();
            const leaf = keccak256(user2.address);
            const proof = merkleTree.getHexProof(leaf);

            await orderManager
                .connect(user1)
                .sell(nftTest.address, 1, 1, 1000, startTime + 10, endTime, AddressZero, rootHash);

            await skipTime(100);
            let marketItemId = await mkpManager.getCurrentMarketItem();
            await expect(() =>
                orderManager
                    .connect(user2)
                    .makeMarketItemOrder(marketItemId, BUY_BID_PRICE, endTime, proof, { value: BUY_BID_PRICE })
            ).to.changeEtherBalance(user2, BUY_BID_PRICE.mul(-1));

            let order = await orderManager.getOrderByMarketItemOrderId(1);
            expect(order[1].bidPrice).to.equal(BUY_BID_PRICE);

            const balance_before = await ethers.provider.getBalance(orderManager.address);
            await expect(() =>
                orderManager
                    .connect(user2)
                    .makeMarketItemOrder(marketItemId, BUY_BID_PRICE.sub(ETHER_10), endTime, proof)
            ).to.changeEtherBalance(user2, ETHER_10);

            const balance_after = await ethers.provider.getBalance(orderManager.address);
            expect(balance_before.sub(balance_after)).to.equal(ETHER_10);

            order = await orderManager.getOrderByMarketItemOrderId(1);
            expect(order[1].bidPrice).to.equal(BUY_BID_PRICE.sub(ETHER_10));
        });
    });

    describe("acceptWalletOrder function:", async () => {
        beforeEach(async () => {
            await metaCitizen.mint(user2.address);
            const startTime = await getCurrentTime();
            const endTime = add(await getCurrentTime(), ONE_WEEK);

            await token.transfer(user1.address, ONE_ETHER);
            await token.connect(user1).approve(nftTest.address, MaxUint256);

            await nftTest.connect(user1).buy("this_uri");

            await orderManager
                .connect(user2)
                .makeWalletOrder(token.address, BID_PRICE, user1.address, nftTest.address, 1, 1, endTime);
        });

        it("should revert when contract is paused", async () => {
            await orderManager.setPause(true);
            expect(await orderManager.paused()).to.equal(true);

            await expect(orderManager.connect(user1).acceptOrder(true, 1)).to.revertedWith("Pausable: paused");
        });

        it("should be fail when Invalid seller of asset", async () => {
            await expect(orderManager.connect(user3).acceptOrder(true, 1)).to.revertedWith("Not the seller");
        });

        it("should be fail when Invalid order id", async () => {
            await expect(orderManager.connect(user3).acceptOrder(true, 0)).to.revertedWith(
                "Wallet order ID is not exist"
            );
        });

        it("should be fail when Order is not available", async () => {
            await orderManager.connect(user2).cancelOrder(true, 1);
            await expect(orderManager.connect(user1).acceptOrder(true, 1)).to.revertedWith("Order is not available");
        });

        it("should be fail when Overtime", async () => {
            await skipTime(ONE_WEEK);
            await expect(orderManager.connect(user1).acceptOrder(true, 1)).to.revertedWith("Order is expired");
        });

        it("Should be ok", async () => {
            await nftTest.connect(user1).approve(orderManager.address, 1);

            let currentWalletOrderId = await orderManager.getCurrentWalletOrderId();
            let orderInfo = await orderManager.getOrderByWalletOrderId(currentWalletOrderId);
            let listingFee = await mkpManager.getListingFee(orderInfo[1].bidPrice);

            // pay listing fee
            let netSaleValue = orderInfo[1].bidPrice.sub(listingFee);

            const isRoyalty = await mkpManager.isRoyalty(nftTest.address);
            let royaltiesAmount;

            if (isRoyalty) {
                const royaltyInfo = await mkpManager.getRoyaltyInfo(nftTest.address, 1, netSaleValue);

                expect(royaltyInfo[0]).to.equal(treasury.address);

                // Deduce royalties from sale value
                royaltiesAmount = royaltyInfo[1];
                netSaleValue = netSaleValue.sub(royaltiesAmount);
            }

            // listingFee to treasury
            const balance_treasury_before = await token.balanceOf(treasury.address);

            await expect(() => orderManager.connect(user1).acceptOrder(true, 1)).to.changeTokenBalance(
                token,
                user1,
                netSaleValue
            );
            expect(await nftTest.ownerOf(1)).to.equal(user2.address);

            const balance_treasury_after = await token.balanceOf(treasury.address);

            expect(balance_treasury_after.sub(balance_treasury_before)).to.equal(listingFee.add(royaltiesAmount));
        });
    });

    describe("acceptMarketItemOrder function:", async () => {
        beforeEach(async () => {
            await metaCitizen.mint(user2.address);
            const startTime = await getCurrentTime();
            const endTime = add(await getCurrentTime(), ONE_WEEK);

            await token.transfer(user1.address, ONE_ETHER);
            await token.connect(user1).approve(nftTest.address, MaxUint256);

            await nftTest.connect(user1).buy("this_uri");
            await nftTest.connect(user1).approve(mkpManager.address, 1);

            merkleTree = await generateMerkleTree([user1.address, user2.address]);

            const leaf = keccak256(user2.address);
            const proof = merkleTree.getHexProof(leaf);

            rootHash = merkleTree.getHexRoot();

            await orderManager
                .connect(user1)
                .sell(nftTest.address, 1, 1, 1000, startTime + 10, endTime, token.address, rootHash);

            await skipTime(10);
            const marketItemId = await mkpManager.getCurrentMarketItem();
            await orderManager.connect(user2).makeMarketItemOrder(marketItemId, BUY_BID_PRICE, endTime, proof);
        });

        it("should revert when contract is paused", async () => {
            await orderManager.setPause(true);
            expect(await orderManager.paused()).to.equal(true);

            await expect(orderManager.connect(user1).acceptOrder(false, 1)).to.revertedWith("Pausable: paused");
        });

        it("should be fail when Market item order ID is not exist", async () => {
            await expect(orderManager.connect(user3).acceptOrder(false, 0)).to.revertedWith(
                "Market item order ID is not exist"
            );
        });

        it("should be fail when not the seller", async () => {
            await expect(orderManager.connect(user3).acceptOrder(false, 1)).to.revertedWith("Not the seller");
        });

        it("should be fail when Market Item is not available", async () => {
            let marketItemId = await mkpManager.getCurrentMarketItem();
            await orderManager.connect(user1).cancelSell(marketItemId);
            await expect(orderManager.connect(user1).acceptOrder(false, 1)).to.revertedWith(
                "Market Item is not available"
            );
        });

        it("should be fail when Order is not available", async () => {
            await orderManager.connect(user2).cancelOrder(false, 1);
            await expect(orderManager.connect(user1).acceptOrder(false, 1)).to.revertedWith("Order is not available");
        });

        it("should be fail when Overtime", async () => {
            await skipTime(ONE_WEEK);
            await expect(orderManager.connect(user1).acceptOrder(false, 1)).to.revertedWith("Order is expired");
        });

        it("Should be ok", async () => {
            let currentMarketItemOrderId = await orderManager.getCurrentMarketItemOrderId();
            let orderInfo = await orderManager.getOrderByMarketItemOrderId(currentMarketItemOrderId);
            let listingFee = await mkpManager.getListingFee(orderInfo[1].bidPrice);

            // pay listing fee
            let netSaleValue = orderInfo[1].bidPrice.sub(listingFee);

            const isRoyalty = await mkpManager.isRoyalty(nftTest.address);
            let royaltiesAmount;

            if (isRoyalty) {
                const royaltyInfo = await mkpManager.getRoyaltyInfo(nftTest.address, 1, netSaleValue);

                expect(royaltyInfo[0]).to.equal(treasury.address);

                // Deduce royalties from sale value
                royaltiesAmount = royaltyInfo[1];
                netSaleValue = netSaleValue.sub(royaltiesAmount);
            }

            // listingFee to treasury
            const balance_treasury_before = await token.balanceOf(treasury.address);

            await expect(() => orderManager.connect(user1).acceptOrder(false, 1)).to.changeTokenBalance(
                token,
                user1,
                netSaleValue
            );
            expect(await nftTest.ownerOf(1)).to.equal(user2.address);

            const balance_treasury_after = await token.balanceOf(treasury.address);

            expect(balance_treasury_after.sub(balance_treasury_before)).to.equal(listingFee.add(royaltiesAmount));
        });
    });

    describe("Sell function:", async () => {
        beforeEach(async () => {
            startTime = await getCurrentTime();
            endTime = add(await getCurrentTime(), ONE_WEEK);

            merkleTree = await generateMerkleTree([user1.address, user2.address]);

            rootHash = merkleTree.getHexRoot();
        });

        it("should revert when contract is paused", async () => {
            await orderManager.setPause(true);
            expect(await orderManager.paused()).to.equal(true);

            await expect(
                orderManager.sell(AddressZero, 0, 100, 100, startTime, endTime, token.address, rootHash)
            ).to.revertedWith("Pausable: paused");
        });

        it("should revert when nft contract is not permitted: ", async () => {
            await expect(
                orderManager.sell(AddressZero, 0, 100, 100, startTime, endTime, token.address, rootHash)
            ).to.be.revertedWith("Token is not existed");

            await expect(
                orderManager.sell(token.address, 0, 100, 100, startTime, endTime, token.address, rootHash)
            ).to.be.revertedWith("Token is not existed");
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

        it("should revert when Invalid amount: ", async () => {
            await tokenMintERC721.mint(owner.address, "");
            await expect(
                orderManager.sell(tokenMintERC721.address, 1, 2, ONE_ETHER, startTime, endTime, token.address, rootHash)
            ).to.be.revertedWith("Invalid amount");

            await expect(
                orderManager.sell(tokenMintERC721.address, 1, 0, ONE_ETHER, startTime, endTime, token.address, rootHash)
            ).to.be.revertedWith("Invalid amount");
        });

        it("should sell success and check private collection: ", async () => {
            await token.transfer(user1.address, ONE_ETHER);
            await token.connect(user1).approve(nftTest.address, MaxUint256);

            await nftTest.connect(user1).buy("this_uri");
            await nftTest.connect(user1).approve(mkpManager.address, 1);

            await expect(() =>
                orderManager
                    .connect(user1)
                    .sell(nftTest.address, 1, 1, 1000, startTime + 10, endTime, token.address, rootHash)
            ).to.changeTokenBalance(nftTest, user1, -1);

            const leaf = keccak256(user1.address);
            const proof = merkleTree.getHexProof(leaf);

            let marketItemId = await mkpManager.getCurrentMarketItem();
            expect(await mkpManager.verify(marketItemId.toNumber(), proof, user1.address)).to.equal(true);
            expect(await nftTest.ownerOf(1)).to.equal(mkpManager.address);

            marketItemId = await mkpManager.getCurrentMarketItem();
            expect(await mkpManager.isPrivate(marketItemId)).to.be.true;
        });
    });

    describe("cancelWalletOrder function:", async () => {
        beforeEach(async () => {
            const current = await getCurrentTime();

            await token.transfer(user1.address, ONE_ETHER);

            await mtvsManager
                .connect(user1)
                .createNFT(false, 1, 100, "this_uri", ONE_ETHER, current + 100, current + 10000, token.address, []);

            merkleTree = await generateMerkleTree([user1.address, user2.address]);

            await orderManager
                .connect(user2)
                .makeWalletOrder(
                    token.address,
                    BID_PRICE,
                    user1.address,
                    tokenMintERC1155.address,
                    1,
                    1,
                    current + 100000
                );

            await orderManager
                .connect(user3)
                .makeWalletOrder(
                    AddressZero,
                    BID_PRICE,
                    user1.address,
                    tokenMintERC1155.address,
                    1,
                    1,
                    current + 100000,
                    { value: BID_PRICE }
                );
        });

        it("should revert when contract is paused", async () => {
            await orderManager.setPause(true);
            expect(await orderManager.paused()).to.equal(true);

            await expect(orderManager.cancelOrder(true, 1)).to.revertedWith("Pausable: paused");
        });

        it("should be fail when Invalid bidder", async () => {
            await expect(orderManager.connect(user1).cancelOrder(true, 1)).to.revertedWith("Not the owner of offer");
        });

        it("should be fail when Order is not available", async () => {
            await orderManager.connect(user2).cancelOrder(true, 1);
            await expect(orderManager.connect(user2).cancelOrder(true, 1)).to.revertedWith("Order is not available");
        });

        it("Should be ok", async () => {
            await expect(() => orderManager.connect(user2).cancelOrder(true, 1)).to.changeTokenBalance(
                token,
                user2,
                BID_PRICE
            );
            let order = await orderManager.getOrderByWalletOrderId(1);
            expect(order[1].status).to.equal(OrderStatus.CANCELED);

            await expect(() => orderManager.connect(user3).cancelOrder(true, 2)).to.changeEtherBalance(
                user3,
                BID_PRICE
            );
            order = await orderManager.getOrderByWalletOrderId(2);
            expect(order[1].status).to.equal(OrderStatus.CANCELED);
        });
    });

    describe("cancelMarketItemOrder function:", async () => {
        beforeEach(async () => {
            await metaCitizen.mint(user2.address);
            startTime = await getCurrentTime();
            endTime = add(await getCurrentTime(), ONE_WEEK);

            await token.transfer(user1.address, ONE_ETHER);
            await token.connect(user1).approve(nftTest.address, MaxUint256);

            await nftTest.connect(user1).buy("this_uri");
            await nftTest.connect(user1).approve(mkpManager.address, 1);

            merkleTree = await generateMerkleTree([user1.address, user2.address]);

            rootHash = merkleTree.getHexRoot();

            await orderManager
                .connect(user1)
                .sell(nftTest.address, 1, 1, 1000, startTime + 10, endTime, token.address, rootHash);

            const marketItemId = await mkpManager.getCurrentMarketItem();
            const leaf = keccak256(user2.address);
            const proof = merkleTree.getHexProof(leaf);
            await skipTime(10);
            await orderManager.connect(user2).makeMarketItemOrder(marketItemId, BUY_BID_PRICE, endTime, proof);
        });

        it("should revert when contract is paused", async () => {
            await orderManager.setPause(true);
            expect(await orderManager.paused()).to.equal(true);

            await expect(orderManager.cancelOrder(false, 1)).to.revertedWith("Pausable: paused");
        });

        it("should be fail when Invalid bidder", async () => {
            await expect(orderManager.connect(user1).cancelOrder(false, 1)).to.revertedWith("Not the owner of offer");
        });

        it("should be fail when Order is not available", async () => {
            await orderManager.connect(user2).cancelOrder(false, 1);
            await expect(orderManager.connect(user2).cancelOrder(false, 1)).to.revertedWith("Order is not available");
        });

        it("Should be ok", async () => {
            const currentMarketItemOrderId = await orderManager.getCurrentMarketItemOrderId();

            await expect(() =>
                orderManager.connect(user2).cancelOrder(false, currentMarketItemOrderId)
            ).to.changeTokenBalance(token, user2, BUY_BID_PRICE);

            const orderAfter = await orderManager.getOrderByMarketItemOrderId(currentMarketItemOrderId);

            expect(orderAfter[1].paymentToken).to.equal(token.address);
            expect(orderAfter[1].bidPrice).to.equal(BUY_BID_PRICE);
            expect(orderAfter[0].marketItemId).to.equal(1);
        });

        it("Should be ok native", async () => {
            startTime = await getCurrentTime();
            endTime = add(await getCurrentTime(), ONE_WEEK);

            await nftTest.connect(user1).buy("this_uri");
            await nftTest.connect(user1).approve(mkpManager.address, 2);

            await orderManager
                .connect(user1)
                .sell(nftTest.address, 2, 1, 1000, startTime + 10, endTime, AddressZero, rootHash);

            let marketItemId = await mkpManager.getCurrentMarketItem();
            let leaf = keccak256(user2.address);
            let proof = merkleTree.getHexProof(leaf);
            await skipTime(10);
            await orderManager
                .connect(user2)
                .makeMarketItemOrder(marketItemId, BUY_BID_PRICE, endTime, proof, { value: BUY_BID_PRICE });

            let currentMarketItemOrderId = await orderManager.getCurrentMarketItemOrderId();

            await expect(() =>
                orderManager.connect(user2).cancelOrder(false, currentMarketItemOrderId)
            ).to.changeEtherBalance(user2, BUY_BID_PRICE);

            let orderAfter = await orderManager.getOrderByMarketItemOrderId(currentMarketItemOrderId);

            expect(orderAfter[1].paymentToken).to.equal(AddressZero);
            expect(orderAfter[1].bidPrice).to.equal(BUY_BID_PRICE);
            expect(orderAfter[0].marketItemId).to.equal(currentMarketItemOrderId);

            await tokenMintERC1155.mint(user1.address, 100, "");
            await tokenMintERC1155.connect(user1).setApprovalForAll(mkpManager.address, true);

            startTime = await getCurrentTime();
            endTime = add(await getCurrentTime(), ONE_WEEK);

            await orderManager
                .connect(user1)
                .sell(tokenMintERC1155.address, 1, 10, ONE_ETHER, startTime + 10, endTime, AddressZero, rootHash);

            marketItemId = await mkpManager.getCurrentMarketItem();
            leaf = keccak256(user2.address);
            proof = merkleTree.getHexProof(leaf);
            await skipTime(10);
            await orderManager
                .connect(user2)
                .makeMarketItemOrder(marketItemId, ONE_ETHER.mul(10), endTime, proof, { value: ONE_ETHER.mul(10) });

            currentMarketItemOrderId = await orderManager.getCurrentMarketItemOrderId();

            await expect(() =>
                orderManager.connect(user2).cancelOrder(false, currentMarketItemOrderId)
            ).to.changeEtherBalance(user2, ONE_ETHER.mul(10));

            orderAfter = await orderManager.getOrderByMarketItemOrderId(currentMarketItemOrderId);

            expect(orderAfter[1].paymentToken).to.equal(AddressZero);
            expect(orderAfter[1].bidPrice).to.equal(ONE_ETHER.mul(10));
            expect(orderAfter[0].marketItemId).to.equal(currentMarketItemOrderId);
        });
    });

    describe("sellAvailableInMarketplace function:", async () => {
        beforeEach(async () => {
            await metaCitizen.mint(user2.address);
            startTime = await getCurrentTime();
            endTime = add(await getCurrentTime(), ONE_WEEK);

            merkleTree = await generateMerkleTree([user1.address, user2.address]);

            rootHash = merkleTree.getHexRoot();

            await token.transfer(user1.address, ONE_ETHER);
            await token.connect(user1).approve(nftTest.address, MaxUint256);

            await nftTest.connect(user1).buy("this_uri");
            await nftTest.connect(user1).approve(mkpManager.address, 1);

            await orderManager
                .connect(user1)
                .sell(nftTest.address, 1, 1, 1000, startTime + 10, endTime, token.address, rootHash);

            marketItemId = await mkpManager.getCurrentMarketItem();
        });

        it("should revert when contract is paused", async () => {
            await orderManager.setPause(true);
            expect(await orderManager.paused()).to.equal(true);

            await expect(orderManager.sellAvailableInMarketplace(1, PRICE, startTime + 10, endTime)).to.revertedWith(
                "Pausable: paused"
            );
        });

        it("should be fail when market item is not free", async () => {
            await expect(
                orderManager
                    .connect(user1)
                    .sellAvailableInMarketplace(marketItemId, PRICE.add(ETHER_100), startTime, endTime)
            ).to.revertedWith("Not expired yet");
        });

        it("should be fail when sender is not owner this NFT", async () => {
            await skipTime(ONE_WEEK);
            await expect(
                orderManager
                    .connect(user2)
                    .sellAvailableInMarketplace(marketItemId, PRICE.add(ETHER_100), startTime, endTime)
            ).to.revertedWith("You are not the seller");
        });

        it("should be fail when Market Item is not available", async () => {
            let marketItemId = await mkpManager.getCurrentMarketItem();
            await orderManager.connect(user1).cancelSell(marketItemId);

            await expect(
                orderManager
                    .connect(user2)
                    .sellAvailableInMarketplace(marketItemId, PRICE.add(ETHER_100), startTime, endTime)
            ).to.revertedWith("Market Item is not available");
        });

        it("should be fail when Market ID is not exist", async () => {
            await expect(
                orderManager.connect(user2).sellAvailableInMarketplace(0, PRICE.add(ETHER_100), startTime, endTime)
            ).to.revertedWith("Market ID is not exist");

            await expect(
                orderManager.connect(user2).sellAvailableInMarketplace(100, PRICE.add(ETHER_100), startTime, endTime)
            ).to.revertedWith("Market ID is not exist");
        });

        it("should be fail when Invalid amount", async () => {
            await skipTime(ONE_WEEK);
            await expect(
                orderManager.connect(user2).sellAvailableInMarketplace(marketItemId, 0, startTime, endTime)
            ).to.revertedWith("Invalid amount");
        });

        it("should be fail when Invalid end time", async () => {
            await skipTime(ONE_WEEK);
            await expect(
                orderManager.connect(user1).sellAvailableInMarketplace(marketItemId, ONE_ETHER, startTime, endTime)
            ).to.revertedWith("Invalid end time");
        });

        it("should be ok", async () => {
            await skipTime(ONE_WEEK);

            const newStartTime = await getCurrentTime();
            const newEndTime = add(await getCurrentTime(), ONE_WEEK * 2);
            await orderManager
                .connect(user1)
                .sellAvailableInMarketplace(marketItemId, PRICE.add(ETHER_100), newStartTime, newEndTime);

            const marketItem = await mkpManager.getMarketItemIdToMarketItem(marketItemId);
            expect(marketItem.price).to.equal(PRICE.add(ETHER_100));
            expect(marketItem.amount).to.equal(1);
            expect(marketItem.status).to.equal(MARKET_ITEM_STATUS.LISTING);
            expect(marketItem.startTime).to.equal(newStartTime);
            expect(marketItem.endTime).to.equal(newEndTime);
            expect(marketItem.paymentToken).to.equal(token.address);
        });

        it("should update amount when soldAvailable ERC1155", async () => {
            let current = await getCurrentTime();

            await mtvsManager
                .connect(user2)
                .createNFT(false, 1, 1000, "this_uri", ONE_ETHER, current + 100, current + 10000, token.address, []);

            await tokenMintERC1155.connect(user2).setApprovalForAll(mkpManager.address, true);
            await orderManager
                .connect(user2)
                .sell(tokenMintERC1155.address, 1, 100, ONE_ETHER, current + 10, current + 10000, token.address, []);

            const marketItemId = await mkpManager.getCurrentMarketItem();
            let marketItem = await mkpManager.getMarketItemIdToMarketItem(marketItemId);
            expect(marketItem.amount).to.equal(100);
            // Start sell available
            await skipTime(100000);
            current = await getCurrentTime();
            await orderManager
                .connect(user2)
                .sellAvailableInMarketplace(marketItemId, PRICE.add(ETHER_100), current + 10, current + 10000);
            marketItem = await mkpManager.getMarketItemIdToMarketItem(marketItemId);
            expect(marketItem.amount).to.equal(100);
            expect(marketItem.price).to.equal(PRICE.add(ETHER_100));
            expect(marketItem.status).to.equal(MARKET_ITEM_STATUS.LISTING);
            expect(marketItem.startTime).to.equal(current + 10);
            expect(marketItem.endTime).to.equal(current + 10000);
            expect(marketItem.paymentToken).to.equal(token.address);

            await skipTime(100000);
            current = await getCurrentTime();
            await orderManager
                .connect(user2)
                .sellAvailableInMarketplace(marketItemId, ETHER_100, current + 10, current + 10000);
            marketItem = await mkpManager.getMarketItemIdToMarketItem(marketItemId);
            expect(marketItem.amount).to.equal(100);
            expect(marketItem.price).to.equal(ETHER_100);
            expect(marketItem.status).to.equal(MARKET_ITEM_STATUS.LISTING);
            expect(marketItem.startTime).to.equal(current + 10);
            expect(marketItem.endTime).to.equal(current + 10000);
            expect(marketItem.paymentToken).to.equal(token.address);
        });
    });

    describe("cancelSell function:", async () => {
        beforeEach(async () => {
            startTime = await getCurrentTime();
            endTime = add(await getCurrentTime(), ONE_WEEK);

            merkleTree = await generateMerkleTree([user1.address, user2.address]);

            rootHash = merkleTree.getHexRoot();

            await token.transfer(user1.address, ONE_ETHER);
            await token.connect(user1).approve(nftTest.address, MaxUint256);

            await nftTest.connect(user1).buy("this_uri");
            await nftTest.connect(user1).approve(mkpManager.address, 1);

            await orderManager
                .connect(user1)
                .sell(nftTest.address, 1, 1, 1000, startTime + 10, endTime, token.address, rootHash);

            marketItemId = await mkpManager.getCurrentMarketItem();
        });

        it("should revert when contract is paused", async () => {
            await orderManager.setPause(true);
            expect(await orderManager.paused()).to.equal(true);

            await expect(orderManager.cancelSell(marketItemId)).to.revertedWith("Pausable: paused");
        });

        it("should be fail when not the seller !", async () => {
            await expect(orderManager.connect(user2).cancelSell(marketItemId)).to.revertedWith(
                "You are not the seller"
            );
        });

        it("should be fail when Market Item is not available", async () => {
            await orderManager.connect(user1).cancelSell(marketItemId);
            await expect(orderManager.connect(user1).cancelSell(marketItemId)).to.revertedWith(
                "Market Item is not available"
            );
        });

        it("should be fail when Market ID is not exist", async () => {
            await expect(orderManager.connect(user1).cancelSell(marketItemId + 1)).to.revertedWith(
                "Market ID is not exist"
            );

            await expect(orderManager.connect(user1).cancelSell(0)).to.revertedWith("Market ID is not exist");
        });

        it("should be ok", async () => {
            await expect(() => orderManager.connect(user1).cancelSell(marketItemId)).to.changeTokenBalance(
                nftTest,
                user1,
                1
            );

            let marketItem = await mkpManager.getMarketItemIdToMarketItem(marketItemId);
            expect(marketItem.price).to.equal(1000);
            expect(marketItem.status).to.equal(MARKET_ITEM_STATUS.CANCELED);
            expect(marketItem.startTime).to.equal(startTime + 10);
            expect(marketItem.endTime).to.equal(endTime);
            expect(marketItem.paymentToken).to.equal(token.address);
            expect(await nftTest.ownerOf(1)).to.equal(user1.address);

            startTime = await getCurrentTime();
            endTime = add(await getCurrentTime(), ONE_WEEK);

            await mtvsManager
                .connect(user2)
                .createNFT(true, 1, 1000, "this_uri", ONE_ETHER, startTime + 100, endTime, token.address, []);

            marketItemId = await mkpManager.getCurrentMarketItem();
            marketItem = await mkpManager.getMarketItemIdToMarketItem(marketItemId);
            expect(marketItem.amount).to.equal(1000);
            expect(marketItem.price).to.equal(ONE_ETHER);
            expect(marketItem.status).to.equal(MARKET_ITEM_STATUS.LISTING);
            expect(marketItem.startTime).to.equal(startTime + 100);
            expect(marketItem.endTime).to.equal(endTime);
            expect(marketItem.paymentToken).to.equal(token.address);

            const balance_before = await tokenMintERC1155.balanceOf(user2.address, 1);

            await orderManager.connect(user2).cancelSell(marketItemId);

            marketItemId = await mkpManager.getCurrentMarketItem();
            marketItem = await mkpManager.getMarketItemIdToMarketItem(marketItemId);
            expect(marketItem.amount).to.equal(1000);
            expect(marketItem.price).to.equal(ONE_ETHER);
            expect(marketItem.status).to.equal(MARKET_ITEM_STATUS.CANCELED);
            expect(marketItem.startTime).to.equal(startTime + 100);
            expect(marketItem.endTime).to.equal(endTime);
            expect(marketItem.paymentToken).to.equal(token.address);

            const balance_after = await tokenMintERC1155.balanceOf(user2.address, 1);
            expect(balance_after.sub(balance_before)).to.equal(1000);
        });
    });

    describe("buy function:", async () => {
        beforeEach(async () => {
            startTime = await getCurrentTime();
            endTime = add(await getCurrentTime(), ONE_WEEK);

            merkleTree = await generateMerkleTree([user1.address, user2.address]);

            rootHash = merkleTree.getHexRoot();

            await token.transfer(user1.address, ONE_ETHER);
            await token.connect(user1).approve(nftTest.address, MaxUint256);

            await nftTest.connect(user1).buy("this_uri");
            await nftTest.connect(user1).approve(mkpManager.address, 1);

            await orderManager
                .connect(user1)
                .sell(nftTest.address, 1, 1, ONE_ETHER, startTime + 10, endTime, token.address, rootHash);

            marketItemId = await mkpManager.getCurrentMarketItem();
        });

        it("should revert when contract is paused", async () => {
            await orderManager.setPause(true);
            expect(await orderManager.paused()).to.equal(true);

            await expect(orderManager.buy(marketItemId, [])).to.revertedWith("Pausable: paused");
        });

        it("should be fail when Market ID is not exist", async () => {
            await expect(orderManager.connect(user1).buy(marketItemId + 1, [])).to.revertedWith(
                "Market ID is not exist"
            );

            await expect(orderManager.connect(user1).buy(0, [])).to.revertedWith("Market ID is not exist");
        });

        it("should be fail when Market Item is not available", async () => {
            await orderManager.connect(user1).cancelSell(marketItemId);
            await expect(orderManager.connect(user1).buy(marketItemId, [])).to.revertedWith(
                "Market Item is not available"
            );
        });

        it("should be fail when not allow to buy yourself !", async () => {
            const leaf = keccak256(user1.address);
            const proof = merkleTree.getHexProof(leaf);
            await expect(orderManager.connect(user1).buy(marketItemId, proof)).to.revertedWith(
                "Can not buy your own NFT"
            );
        });

        it("should be fail when NFT is not selling !", async () => {
            await skipTime(ONE_WEEK);
            const leaf = keccak256(user2.address);
            const proof = merkleTree.getHexProof(leaf);
            await expect(orderManager.connect(user2).buy(marketItemId, proof)).to.revertedWith(
                "Market Item is not selling"
            );
        });

        it("should be fail when Sender is not in whitelist or not own meta citizen NFT", async () => {
            await skipTime(100);
            const leaf = keccak256(user3.address);
            const proof = merkleTree.getHexProof(leaf);
            await expect(orderManager.connect(user2).buy(marketItemId, proof)).to.revertedWith(
                "Sender is not in whitelist or not own meta citizen NFT"
            );
        });

        it("should be ok", async () => {
            await metaCitizen.mint(user2.address);
            const leaf = keccak256(user2.address);
            const proof = merkleTree.getHexProof(leaf);
            await skipTime(100);

            let marketItem = await mkpManager.getMarketItemIdToMarketItem(marketItemId);
            let listingFee = await mkpManager.getListingFee(marketItem.price);

            // pay listing fee
            let netSaleValue = marketItem.price.sub(listingFee);

            const isRoyalty = await mkpManager.isRoyalty(nftTest.address);
            let royaltiesAmount;

            if (isRoyalty) {
                const royaltyInfo = await mkpManager.getRoyaltyInfo(nftTest.address, 1, netSaleValue);

                expect(royaltyInfo[0]).to.equal(treasury.address);

                // Deduce royalties from sale value
                royaltiesAmount = royaltyInfo[1];
                netSaleValue = netSaleValue.sub(royaltiesAmount);
            }

            // listingFee to treasury
            const balance_treasury_before = await token.balanceOf(treasury.address);

            await expect(() => orderManager.connect(user2).buy(marketItemId, proof)).to.changeTokenBalances(
                token,
                [user1, user2],
                [netSaleValue, ONE_ETHER.mul(-1)]
            );

            marketItem = await mkpManager.getMarketItemIdToMarketItem(marketItemId);
            expect(marketItem.status).to.equal(MARKET_ITEM_STATUS.SOLD);
            expect(marketItem.buyer).to.equal(user2.address);
            expect(await nftTest.ownerOf(1)).to.equal(user2.address);

            const balance_treasury_after = await token.balanceOf(treasury.address);
            expect(balance_treasury_after.sub(balance_treasury_before)).to.equal(listingFee.add(royaltiesAmount));
        });

        it("should be ok native", async () => {
            await nftTest.connect(user1).buy("this_uri");
            await nftTest.connect(user1).approve(mkpManager.address, 2);

            await orderManager
                .connect(user1)
                .sell(nftTest.address, 2, 1, ONE_ETHER, startTime + 10, endTime, AddressZero, rootHash);

            marketItemId = await mkpManager.getCurrentMarketItem();

            await metaCitizen.mint(user2.address);
            const leaf = keccak256(user2.address);
            const proof = merkleTree.getHexProof(leaf);
            await skipTime(100);

            let marketItem = await mkpManager.getMarketItemIdToMarketItem(marketItemId);
            let listingFee = await mkpManager.getListingFee(marketItem.price);

            // pay listing fee
            let netSaleValue = marketItem.price.sub(listingFee);

            const isRoyalty = await mkpManager.isRoyalty(nftTest.address);
            let royaltiesAmount;

            if (isRoyalty) {
                const royaltyInfo = await mkpManager.getRoyaltyInfo(nftTest.address, 1, netSaleValue);

                expect(royaltyInfo[0]).to.equal(treasury.address);

                // Deduce royalties from sale value
                royaltiesAmount = royaltyInfo[1];
                netSaleValue = netSaleValue.sub(royaltiesAmount);
            }

            // listingFee to treasury
            const balance_treasury_before = await ethers.provider.getBalance(treasury.address);

            await expect(() =>
                orderManager.connect(user2).buy(marketItemId, proof, { value: ONE_ETHER })
            ).to.changeEtherBalances([user1, user2], [netSaleValue, ONE_ETHER.mul(-1)]);

            marketItem = await mkpManager.getMarketItemIdToMarketItem(marketItemId);
            expect(marketItem.status).to.equal(MARKET_ITEM_STATUS.SOLD);
            expect(marketItem.buyer).to.equal(user2.address);
            expect(await nftTest.ownerOf(2)).to.equal(user2.address);

            const balance_treasury_after = await ethers.provider.getBalance(treasury.address);
            expect(balance_treasury_after.sub(balance_treasury_before)).to.equal(listingFee.add(royaltiesAmount));
        });

        it("should be ok 1155", async () => {
            await tokenMintERC1155.mint(user1.address, 100, "");
            await tokenMintERC1155.connect(user1).setApprovalForAll(mkpManager.address, true);

            await orderManager
                .connect(user1)
                .sell(tokenMintERC1155.address, 1, 10, ONE_ETHER, startTime + 10, endTime, AddressZero, rootHash);

            marketItemId = await mkpManager.getCurrentMarketItem();

            await metaCitizen.mint(user2.address);
            const leaf = keccak256(user2.address);
            const proof = merkleTree.getHexProof(leaf);
            await skipTime(100);

            let marketItem = await mkpManager.getMarketItemIdToMarketItem(marketItemId);
            let listingFee = await mkpManager.getListingFee(marketItem.price);

            // pay listing fee
            let netSaleValue = marketItem.price.sub(listingFee);

            const isRoyalty = await mkpManager.isRoyalty(nftTest.address);
            let royaltiesAmount;

            if (isRoyalty) {
                const royaltyInfo = await mkpManager.getRoyaltyInfo(nftTest.address, 1, netSaleValue);

                expect(royaltyInfo[0]).to.equal(treasury.address);

                // Deduce royalties from sale value
                royaltiesAmount = royaltyInfo[1];
                netSaleValue = netSaleValue.sub(royaltiesAmount);
            }

            // listingFee to treasury
            const balance_treasury_before = await ethers.provider.getBalance(treasury.address);

            await expect(() =>
                orderManager.connect(user2).buy(marketItemId, proof, { value: ONE_ETHER })
            ).to.changeEtherBalances([user1, user2], [netSaleValue, ONE_ETHER.mul(-1)]);

            marketItem = await mkpManager.getMarketItemIdToMarketItem(marketItemId);
            expect(marketItem.status).to.equal(MARKET_ITEM_STATUS.SOLD);
            expect(marketItem.buyer).to.equal(user2.address);
            expect(await tokenMintERC1155.balanceOf(user2.address, 1)).to.equal(10);

            const balance_treasury_after = await ethers.provider.getBalance(treasury.address);
            expect(balance_treasury_after.sub(balance_treasury_before)).to.equal(listingFee.add(royaltiesAmount));
        });
    });
});
