const { expect } = require("chai");
const { upgrades, ethers } = require("hardhat");
const {
    BalanceTracker: BT,
    generateMerkleTree,
    ADDRESS_ZERO,
    MAX_UINT256,
    getCurrentTime,
    skipTime,
    generateLeaf,
} = require("../utils");
const { parseEther, formatBytes32String } = ethers.utils;

const TOTAL_SUPPLY = parseEther("1000000000000");
const PRICE = parseEther("1");
const ONE_ETHER = parseEther("1");
const ONE_WEEK = 604800;
const MINT_FEE = 1000;
const NFT_TYPE721 = 0;
const NFT_TYPE1155 = 1;

// Local storage
const INFO = {};

describe.only("Marketplace Manager flow test for ERC721 token:", () => {
    before(async () => {
        [owner, user1, user2, user3, user4, user5, user6] = await ethers.getSigners();

        Admin = await ethers.getContractFactory("Admin");
        admin = await upgrades.deployProxy(Admin, [owner.address]);

        Token = await ethers.getContractFactory("MTVS");
        token = await upgrades.deployProxy(Token, ["Metaversus Token", "MTVS", TOTAL_SUPPLY, owner.address]);

        await admin.setPermittedPaymentToken(token.address, true);
        await admin.setPermittedPaymentToken(ADDRESS_ZERO, true);

        Treasury = await ethers.getContractFactory("Treasury");
        treasury = await upgrades.deployProxy(Treasury, [admin.address]);

        MetaCitizen = await ethers.getContractFactory("MetaCitizen");
        metaCitizen = await upgrades.deployProxy(MetaCitizen, [token.address, MINT_FEE, admin.address]);

        TokenMintERC721 = await ethers.getContractFactory("TokenMintERC721");
        tokenMintERC721 = await upgrades.deployProxy(TokenMintERC721, ["NFT Metaversus", "nMTVS", 250, admin.address]);

        TokenMintERC1155 = await ethers.getContractFactory("TokenMintERC1155");
        tokenMintERC1155 = await upgrades.deployProxy(TokenMintERC1155, [250, admin.address]);

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

        await admin.setAdmin(user1.address, true);
        await admin.setAdmin(mtvsManager.address, true);

        await orderManager.setPause(false);
        await mtvsManager.setPause(false);
        await mkpManager.setPause(false);

        await mkpManager.setMetaversusManager(mtvsManager.address);
        await mkpManager.setOrderManager(orderManager.address);

        await token.transfer(user1.address, parseEther("1000"));
        await token.transfer(user2.address, parseEther("1000"));
        await token.transfer(user3.address, parseEther("1000"));
        await token.transfer(user4.address, parseEther("1000"));
        await token.transfer(user5.address, parseEther("1000"));
        await token.transfer(user6.address, parseEther("1000"));

        INFO.owner = { address: owner.address };
        INFO.user1 = { address: user1.address };
        INFO.user2 = { address: user2.address };
        INFO.user3 = { address: user3.address };
        INFO.user4 = { address: user4.address };
        INFO.user5 = { address: user5.address };
        INFO.user6 = { address: user6.address };
        INFO.treasury = { address: treasury.address };

        orderManagerBT = new BT(orderManager.address, [token.address]);
        treasuryBT = new BT(treasury.address, [token.address]);
        ownerBT = new BT(owner.address, [token.address]);
        user1BT = new BT(user1.address, [token.address]);
        user2BT = new BT(user2.address, [token.address]);
        user3BT = new BT(user3.address, [token.address]);
        user4BT = new BT(user4.address, [token.address]);
        user5BT = new BT(user5.address, [token.address]);
        user6BT = new BT(user6.address, [token.address]);

        flowBegin = "begin";

        await orderManagerBT.takeSnapshot(flowBegin);
        await treasuryBT.takeSnapshot(flowBegin);
        await ownerBT.takeSnapshot(flowBegin);
        await user1BT.takeSnapshot(flowBegin);
        await user2BT.takeSnapshot(flowBegin);
        await user3BT.takeSnapshot(flowBegin);
        await user4BT.takeSnapshot(flowBegin);
        await user5BT.takeSnapshot(flowBegin);
        await user6BT.takeSnapshot(flowBegin);
    });

    describe("User1 mint token1(NFT721 - Public) -> user2, user3 make offer token1 -> user1 accept offer of user2 -> user3 cancel offer", () => {
        before(async () => {
            ownerBT.resetTotalFee();
            user1BT.resetTotalFee();
            user2BT.resetTotalFee();
            user3BT.resetTotalFee();
            user4BT.resetTotalFee();
            user5BT.resetTotalFee();
            user6BT.resetTotalFee();
        });

        it("User1 mint token1(NFT721)", async () => {
            INFO.user1 = {
                ...INFO.user1,
                nft_address: tokenMintERC721.address,
                amount: 1,
                token_uri: "token1_uri",
            };

            await BT.updateFee(tokenMintERC721.connect(owner).mint(INFO.user1.address, INFO.user1.token_uri));
            INFO.user1.token_id = await tokenMintERC721.getTokenCounter();
        });

        it("user2, user3 make offer token1", async () => {
            // User2 make offer
            INFO.user2 = {
                ...INFO.user2,
                payment_token: token.address,
                bid_price: parseEther("1"),
                end_time: (await getCurrentTime()) + ONE_WEEK,
            };
            await BT.updateFee(token.connect(user2).approve(orderManager.address, MAX_UINT256));
            await BT.expect(() =>
                orderManager
                    .connect(user2)
                    .makeWalletOrder(
                        INFO.user2.payment_token,
                        INFO.user2.bid_price,
                        INFO.user1.address,
                        INFO.user1.nft_address,
                        INFO.user1.token_id,
                        INFO.user1.amount,
                        INFO.user2.end_time
                    )
            ).changeTokenBalance(token, user2, INFO.user2.bid_price.mul(-1));
            INFO.user2.order_id = 1;

            // User3 make offer
            INFO.user3 = {
                ...INFO.user3,
                payment_token: token.address,
                bid_price: parseEther("1.5"),
                end_time: (await getCurrentTime()) + ONE_WEEK,
            };
            await BT.updateFee(token.connect(user3).approve(orderManager.address, MAX_UINT256));
            await BT.expect(() =>
                orderManager
                    .connect(user3)
                    .makeWalletOrder(
                        INFO.user3.payment_token,
                        INFO.user3.bid_price,
                        INFO.user1.address,
                        INFO.user1.nft_address,
                        INFO.user1.token_id,
                        INFO.user1.amount,
                        INFO.user3.end_time
                    )
            ).changeTokenBalance(token, user3, INFO.user3.bid_price.mul(-1));
            INFO.user3.order_id = 2;
        });

        it("user1 accept offer of user2", async () => {
            await BT.updateFee(tokenMintERC721.connect(user1).approve(orderManager.address, INFO.user1.token_id));
            await BT.expect(() =>
                orderManager.connect(user1).acceptWalletOrder(INFO.user2.order_id)
            ).changeTokenBalance(
                token,
                user1,
                INFO.user2.bid_price
                    .mul(975)
                    .div(1000)
                    .mul(975)
                    .div(1000)
            );
        });

        it("user3 cancel offer", async () => {
            await BT.expect(() =>
                orderManager.connect(user3).cancelWalletOrder(INFO.user3.order_id)
            ).changeTokenBalance(token, user3, INFO.user3.bid_price);
        });

        it("Check balance after flowNFT721_", async () => {
            flowNFT721_1 = "flowNFT721_1";

            await orderManagerBT.takeSnapshot(flowNFT721_1);
            await user1BT.takeSnapshot(flowNFT721_1);
            await user2BT.takeSnapshot(flowNFT721_1);
            await user3BT.takeSnapshot(flowNFT721_1);
            await treasuryBT.takeSnapshot(flowNFT721_1);

            const orderManagerDiff = orderManagerBT.diff(flowBegin, flowNFT721_1);
            const user1Diff = user1BT.diff(flowBegin, flowNFT721_1);
            const user2Diff = user2BT.diff(flowBegin, flowNFT721_1);
            const user3Diff = user3BT.diff(flowBegin, flowNFT721_1);
            const treasuryDiff = treasuryBT.diff(flowBegin, flowNFT721_1);

            expect(orderManagerDiff[ADDRESS_ZERO].delta.mul(-1)).to.equal(orderManagerBT.totalFee);
            expect(user1Diff[ADDRESS_ZERO].delta.mul(-1)).to.equal(user1BT.totalFee);
            expect(user2Diff[ADDRESS_ZERO].delta.mul(-1)).to.equal(user2BT.totalFee);
            expect(user3Diff[ADDRESS_ZERO].delta.mul(-1)).to.equal(user3BT.totalFee);
            expect(treasuryDiff[ADDRESS_ZERO].delta.mul(-1)).to.equal(treasuryBT.totalFee);

            expect(orderManagerDiff[token.address].delta).to.equal(INFO.user2.bid_price.mul(25).div(1000));
            expect(user1Diff[token.address].delta).to.equal(
                INFO.user2.bid_price
                    .mul(975)
                    .div(1000)
                    .mul(975)
                    .div(1000)
            );
            expect(user2Diff[token.address].delta).to.equal(INFO.user2.bid_price.mul(-1));
            expect(user3Diff[token.address].delta).to.equal(0);
            expect(treasuryDiff[token.address].delta).to.equal(
                INFO.user2.bid_price
                    .mul(975)
                    .div(1000)
                    .mul(25)
                    .div(1000)
            );
        });
    });

    describe("User1 mint token2(NFT721 - Public) -> user2, user3 make offer token2 -> cancel all offers", () => {
        before(async () => {
            ownerBT.resetTotalFee();
            user1BT.resetTotalFee();
            user2BT.resetTotalFee();
            user3BT.resetTotalFee();
            user4BT.resetTotalFee();
            user5BT.resetTotalFee();
            user6BT.resetTotalFee();
        });

        it("User1 mint token2(NFT721)", async () => {
            INFO.user1 = {
                ...INFO.user1,
                nft_address: tokenMintERC721.address,
                amount: 1,
                token_uri: "token2_uri",
            };
            await BT.updateFee(tokenMintERC721.connect(owner).mint(INFO.user1.address, INFO.user1.token_uri));
            INFO.user1.token_id = await tokenMintERC721.getTokenCounter();
        });

        it("user2, user3 make offer token2", async () => {
            // User2 make offer
            INFO.user2 = {
                ...INFO.user2,
                payment_token: token.address,
                bid_price: parseEther("1"),
                end_time: (await getCurrentTime()) + ONE_WEEK,
            };
            await BT.updateFee(token.connect(user2).approve(orderManager.address, MAX_UINT256));
            await BT.expect(() =>
                orderManager
                    .connect(user2)
                    .makeWalletOrder(
                        INFO.user2.payment_token,
                        INFO.user2.bid_price,
                        INFO.user1.address,
                        INFO.user1.nft_address,
                        INFO.user1.token_id,
                        INFO.user1.amount,
                        INFO.user2.end_time
                    )
            ).changeTokenBalance(token, user2, INFO.user2.bid_price.mul(-1));
            INFO.user2.order_id = 3;

            // User3 make offer
            INFO.user3 = {
                ...INFO.user3,
                payment_token: token.address,
                bid_price: parseEther("1.5"),
                end_time: (await getCurrentTime()) + ONE_WEEK,
            };
            await BT.updateFee(token.connect(user3).approve(orderManager.address, MAX_UINT256));
            await BT.expect(() =>
                orderManager
                    .connect(user3)
                    .makeWalletOrder(
                        INFO.user3.payment_token,
                        INFO.user3.bid_price,
                        INFO.user1.address,
                        INFO.user1.nft_address,
                        INFO.user1.token_id,
                        INFO.user1.amount,
                        INFO.user3.end_time
                    )
            ).changeTokenBalance(token, user3, INFO.user3.bid_price.mul(-1));
            INFO.user3.order_id = 4;
        });

        it("cancel all offers", async () => {
            await BT.expect(() =>
                orderManager.connect(user2).cancelWalletOrder(INFO.user2.order_id)
            ).changeTokenBalance(token, user2, INFO.user2.bid_price);

            await BT.expect(() =>
                orderManager.connect(user3).cancelWalletOrder(INFO.user3.order_id)
            ).changeTokenBalance(token, user3, INFO.user3.bid_price);
        });

        it("Check balance after flowNFT721_", async () => {
            flowNFT721_2 = "flowNFT721_2";

            await orderManagerBT.takeSnapshot(flowNFT721_2);
            await user1BT.takeSnapshot(flowNFT721_2);
            await user2BT.takeSnapshot(flowNFT721_2);
            await user3BT.takeSnapshot(flowNFT721_2);
            await treasuryBT.takeSnapshot(flowNFT721_2);

            const orderManagerDiff = orderManagerBT.diff(flowNFT721_1, flowNFT721_2);
            const user1Diff = user1BT.diff(flowNFT721_1, flowNFT721_2);
            const user2Diff = user2BT.diff(flowNFT721_1, flowNFT721_2);
            const user3Diff = user3BT.diff(flowNFT721_1, flowNFT721_2);
            const treasuryDiff = treasuryBT.diff(flowNFT721_1, flowNFT721_2);

            expect(orderManagerDiff[ADDRESS_ZERO].delta.mul(-1)).to.equal(orderManagerBT.totalFee);
            expect(user1Diff[ADDRESS_ZERO].delta.mul(-1)).to.equal(user1BT.totalFee);
            expect(user2Diff[ADDRESS_ZERO].delta.mul(-1)).to.equal(user2BT.totalFee);
            expect(user3Diff[ADDRESS_ZERO].delta.mul(-1)).to.equal(user3BT.totalFee);
            expect(treasuryDiff[ADDRESS_ZERO].delta.mul(-1)).to.equal(treasuryBT.totalFee);

            expect(orderManagerDiff[token.address].delta).to.equal(0);
            expect(user1Diff[token.address].delta).to.equal(0);
            expect(user2Diff[token.address].delta).to.equal(0);
            expect(user3Diff[token.address].delta).to.equal(0);
            expect(treasuryDiff[token.address].delta).to.equal(0);
        });
    });

    describe("User1 mint token3(NFT721 - Private) -> user2, user3, user4 make offer token3 -> user1 create sell (user1 can't accept previous offers) -> waiting until MarketItem is expired => user1 cancel MarketItem -> user1 accept user2 offer", () => {
        before(async () => {
            ownerBT.resetTotalFee();
            user1BT.resetTotalFee();
            user2BT.resetTotalFee();
            user3BT.resetTotalFee();
            user4BT.resetTotalFee();
            user5BT.resetTotalFee();
            user6BT.resetTotalFee();
        });

        it("User1 mint token3(NFT721)", async () => {
            INFO.user1 = {
                ...INFO.user1,
                payment_token: token.address,
                nft_address: tokenMintERC721.address,
                amount: 1,
                token_uri: "token3_uri",
            };
            await BT.updateFee(tokenMintERC721.connect(owner).mint(INFO.user1.address, INFO.user1.token_uri));
            INFO.user1.token_id = await tokenMintERC721.getTokenCounter();
        });

        it("user2, user3, user4 make offer token3", async () => {
            // User2 make offer
            INFO.user2 = {
                ...INFO.user2,
                payment_token: token.address,
                bid_price: parseEther("1"),
                end_time: (await getCurrentTime()) + ONE_WEEK * 2,
            };
            await BT.updateFee(token.connect(user2).approve(orderManager.address, MAX_UINT256));
            await BT.expect(() =>
                orderManager
                    .connect(user2)
                    .makeWalletOrder(
                        INFO.user2.payment_token,
                        INFO.user2.bid_price,
                        INFO.user1.address,
                        INFO.user1.nft_address,
                        INFO.user1.token_id,
                        INFO.user1.amount,
                        INFO.user2.end_time
                    )
            ).changeTokenBalance(token, user2, INFO.user2.bid_price.mul(-1));
            INFO.user2.order_id = 5;

            // User3 make offer
            INFO.user3 = {
                ...INFO.user3,
                payment_token: token.address,
                bid_price: parseEther("1.5"),
                end_time: (await getCurrentTime()) + ONE_WEEK * 2,
            };
            await BT.updateFee(token.connect(user3).approve(orderManager.address, MAX_UINT256));
            await BT.expect(() =>
                orderManager
                    .connect(user3)
                    .makeWalletOrder(
                        INFO.user3.payment_token,
                        INFO.user3.bid_price,
                        INFO.user1.address,
                        INFO.user1.nft_address,
                        INFO.user1.token_id,
                        INFO.user1.amount,
                        INFO.user3.end_time
                    )
            ).changeTokenBalance(token, user3, INFO.user3.bid_price.mul(-1));
            INFO.user3.order_id = 6;

            // User4 make offer
            INFO.user4 = {
                ...INFO.user4,
                payment_token: token.address,
                bid_price: parseEther("1.7"),
                end_time: (await getCurrentTime()) + ONE_WEEK,
            };
            await BT.updateFee(token.connect(user4).approve(orderManager.address, MAX_UINT256));
            await BT.expect(() =>
                orderManager
                    .connect(user4)
                    .makeWalletOrder(
                        INFO.user4.payment_token,
                        INFO.user4.bid_price,
                        INFO.user1.address,
                        INFO.user1.nft_address,
                        INFO.user1.token_id,
                        INFO.user1.amount,
                        INFO.user4.end_time
                    )
            ).changeTokenBalance(token, user4, INFO.user4.bid_price.mul(-1));
            INFO.user4.order_id = 7;
        });

        it("user1 create sell (user1 can't accept previous offers)", async () => {
            INFO.user1 = {
                ...INFO.user1,
                sell_payment_token: token.address,
                sell_price: parseEther("3"),
                sell_start_time: (await getCurrentTime()) + 10,
                sell_end_time: (await getCurrentTime()) + ONE_WEEK,
                sell_merkle_tree: generateMerkleTree([user2.address, user3.address]),
            };

            await BT.updateFee(tokenMintERC721.connect(user1).approve(mkpManager.address, INFO.user1.token_id));
            await BT.updateFee(
                orderManager
                    .connect(user1)
                    .sell(
                        INFO.user1.nft_address,
                        INFO.user1.token_id,
                        INFO.user1.amount,
                        INFO.user1.sell_price,
                        INFO.user1.sell_start_time,
                        INFO.user1.sell_end_time,
                        INFO.user1.sell_payment_token,
                        INFO.user1.sell_merkle_tree.getHexRoot()
                    )
            );
            INFO.user1.sell_market_item_id = await mkpManager.getCurrentMarketItem();

            await BT.expect(orderManager.connect(user1).acceptWalletOrder(INFO.user2.order_id)).to.revertedWith(
                "ERC721: transfer from incorrect owner"
            );
        });

        it("waiting until MarketItem is expired => user1 cancel MarketItem", async () => {
            await skipTime(INFO.user1.sell_end_time - (await getCurrentTime()));
            await BT.updateFee(orderManager.connect(user1).cancelSell(INFO.user1.sell_market_item_id));
        });

        it("user1 accept user2 offer", async () => {
            await BT.updateFee(tokenMintERC721.connect(user1).approve(orderManager.address, INFO.user1.token_id));
            await BT.expect(() =>
                orderManager.connect(user1).acceptWalletOrder(INFO.user2.order_id)
            ).changeTokenBalance(
                token,
                user1,
                INFO.user2.bid_price
                    .mul(975)
                    .div(1000)
                    .mul(975)
                    .div(1000)
            );
        });

        it("Check balance after flowNFT721_", async () => {
            flowNFT721_3 = "flowNFT721_3";

            await orderManagerBT.takeSnapshot(flowNFT721_3);
            await user1BT.takeSnapshot(flowNFT721_3);
            await user2BT.takeSnapshot(flowNFT721_3);
            await user3BT.takeSnapshot(flowNFT721_3);
            await user4BT.takeSnapshot(flowNFT721_3);
            await treasuryBT.takeSnapshot(flowNFT721_3);

            const orderManagerDiff = orderManagerBT.diff(flowNFT721_2, flowNFT721_3);
            const user1Diff = user1BT.diff(flowNFT721_2, flowNFT721_3);
            const user2Diff = user2BT.diff(flowNFT721_2, flowNFT721_3);
            const user3Diff = user3BT.diff(flowNFT721_2, flowNFT721_3);
            const user4Diff = user4BT.diff(flowBegin, flowNFT721_3);
            const treasuryDiff = treasuryBT.diff(flowNFT721_2, flowNFT721_3);

            expect(orderManagerDiff[ADDRESS_ZERO].delta.mul(-1)).to.equal(orderManagerBT.totalFee);
            expect(user1Diff[ADDRESS_ZERO].delta.mul(-1)).to.equal(user1BT.totalFee);
            expect(user2Diff[ADDRESS_ZERO].delta.mul(-1)).to.equal(user2BT.totalFee);
            expect(user3Diff[ADDRESS_ZERO].delta.mul(-1)).to.equal(user3BT.totalFee);
            expect(user4Diff[ADDRESS_ZERO].delta.mul(-1)).to.equal(user4BT.totalFee);
            expect(treasuryDiff[ADDRESS_ZERO].delta.mul(-1)).to.equal(treasuryBT.totalFee);

            expect(orderManagerDiff[token.address].delta).to.equal(
                INFO.user3.bid_price.add(INFO.user4.bid_price).add(INFO.user2.bid_price.mul(25).div(1000))
            );
            expect(user1Diff[token.address].delta).to.equal(
                INFO.user2.bid_price
                    .mul(975)
                    .div(1000)
                    .mul(975)
                    .div(1000)
            );
            expect(user2Diff[token.address].delta).to.equal(INFO.user2.bid_price.mul(-1));
            expect(user3Diff[token.address].delta).to.equal(INFO.user3.bid_price.mul(-1));
            expect(user4Diff[token.address].delta).to.equal(INFO.user4.bid_price.mul(-1));
            expect(treasuryDiff[token.address].delta).to.equal(
                INFO.user2.bid_price
                    .mul(975)
                    .div(1000)
                    .mul(25)
                    .div(1000)
            );
        });
    });

    describe("User1 mint token4(NFT721 - Public) -> user2, user3 make offer token4 -> user1 create sell (user1 can't accept previous offers) => user4 make offer on sell => user1 accept user2(fail), user3(fail), user4(ok)", () => {
        before(async () => {
            ownerBT.resetTotalFee();
            user1BT.resetTotalFee();
            user2BT.resetTotalFee();
            user3BT.resetTotalFee();
            user4BT.resetTotalFee();
            user5BT.resetTotalFee();
            user6BT.resetTotalFee();
        });

        it("User1 mint token4(NFT721)", async () => {
            INFO.user1 = {
                ...INFO.user1,
                payment_token: token.address,
                nft_address: tokenMintERC721.address,
                amount: 1,
                token_uri: "token4_uri",
            };
            await BT.updateFee(tokenMintERC721.connect(owner).mint(INFO.user1.address, INFO.user1.token_uri));
            INFO.user1.token_id = await tokenMintERC721.getTokenCounter();
        });

        it("user2, user3 make offer token4", async () => {
            // User2 make offer
            INFO.user2 = {
                ...INFO.user2,
                payment_token: token.address,
                bid_price: parseEther("1"),
                end_time: (await getCurrentTime()) + ONE_WEEK * 2,
            };
            await BT.updateFee(token.connect(user2).approve(orderManager.address, MAX_UINT256));
            await BT.expect(() =>
                orderManager
                    .connect(user2)
                    .makeWalletOrder(
                        INFO.user2.payment_token,
                        INFO.user2.bid_price,
                        INFO.user1.address,
                        INFO.user1.nft_address,
                        INFO.user1.token_id,
                        INFO.user1.amount,
                        INFO.user2.end_time
                    )
            ).changeTokenBalance(token, user2, INFO.user2.bid_price.mul(-1));
            INFO.user2.order_id = 8;

            // User3 make offer
            INFO.user3 = {
                ...INFO.user3,
                payment_token: token.address,
                bid_price: parseEther("1.5"),
                end_time: (await getCurrentTime()) + ONE_WEEK * 2,
            };
            await BT.updateFee(token.connect(user3).approve(orderManager.address, MAX_UINT256));
            await BT.expect(() =>
                orderManager
                    .connect(user3)
                    .makeWalletOrder(
                        INFO.user3.payment_token,
                        INFO.user3.bid_price,
                        INFO.user1.address,
                        INFO.user1.nft_address,
                        INFO.user1.token_id,
                        INFO.user1.amount,
                        INFO.user3.end_time
                    )
            ).changeTokenBalance(token, user3, INFO.user3.bid_price.mul(-1));
            INFO.user3.order_id = 9;
        });

        it("user1 create sell (user1 can't accept previous offers)", async () => {
            INFO.user1 = {
                ...INFO.user1,
                sell_payment_token: token.address,
                sell_price: parseEther("3"),
                sell_start_time: (await getCurrentTime()) + 10,
                sell_end_time: (await getCurrentTime()) + ONE_WEEK,
            };

            await BT.updateFee(tokenMintERC721.connect(user1).approve(mkpManager.address, INFO.user1.token_id));
            await BT.updateFee(
                orderManager
                    .connect(user1)
                    .sell(
                        INFO.user1.nft_address,
                        INFO.user1.token_id,
                        INFO.user1.amount,
                        INFO.user1.sell_price,
                        INFO.user1.sell_start_time,
                        INFO.user1.sell_end_time,
                        INFO.user1.sell_payment_token,
                        []
                    )
            );
            INFO.user1.sell_market_item_id = await mkpManager.getCurrentMarketItem();

            await BT.expect(orderManager.connect(user1).acceptWalletOrder(INFO.user2.order_id)).to.revertedWith(
                "ERC721: transfer from incorrect owner"
            );
        });

        it("user4 make offer on sell", async () => {
            INFO.user4.bid_price = parseEther("1.5");
            INFO.user4.endTime = (await getCurrentTime()) + ONE_WEEK;
            await BT.expect(
                orderManager
                    .connect(user4)
                    .makeMarketItemOrder(
                        INFO.user1.sell_market_item_id,
                        INFO.user1.sell_payment_token,
                        INFO.user4.bid_price,
                        INFO.user4.endTime,
                        []
                    )
            ).to.revertedWith("Not the order time");

            await skipTime(10);
            await BT.updateFee(metaCitizen.mint(user4.address));
            await BT.expect(() =>
                orderManager
                    .connect(user4)
                    .makeMarketItemOrder(
                        INFO.user1.sell_market_item_id,
                        INFO.user1.sell_payment_token,
                        INFO.user4.bid_price,
                        INFO.user4.endTime,
                        []
                    )
            ).changeTokenBalance(token, user4, INFO.user4.bid_price.mul(-1));
            INFO.user4.market_item_order_id = 1;
        });

        it("user1 accept user2(fail), user3(fail), user4(ok)", async () => {
            await BT.expect(orderManager.connect(user1).acceptWalletOrder(INFO.user2.order_id)).to.revertedWith(
                "ERC721: transfer from incorrect owner"
            );
            await BT.expect(orderManager.connect(user1).acceptWalletOrder(INFO.user3.order_id)).to.revertedWith(
                "ERC721: transfer from incorrect owner"
            );
            await BT.expect(() =>
                orderManager.connect(user1).acceptMarketItemOrder(INFO.user4.market_item_order_id)
            ).changeTokenBalance(
                token,
                user1,
                INFO.user4.bid_price
                    .mul(975)
                    .div(1000)
                    .mul(975)
                    .div(1000)
            );
        });

        it("Check balance after flowNFT721_", async () => {
            flowNFT721_4 = "flowNFT721_4";

            await orderManagerBT.takeSnapshot(flowNFT721_4);
            await user1BT.takeSnapshot(flowNFT721_4);
            await user2BT.takeSnapshot(flowNFT721_4);
            await user3BT.takeSnapshot(flowNFT721_4);
            await user4BT.takeSnapshot(flowNFT721_4);
            await treasuryBT.takeSnapshot(flowNFT721_4);

            const orderManagerDiff = orderManagerBT.diff(flowNFT721_3, flowNFT721_4);
            const user1Diff = user1BT.diff(flowNFT721_3, flowNFT721_4);
            const user2Diff = user2BT.diff(flowNFT721_3, flowNFT721_4);
            const user3Diff = user3BT.diff(flowNFT721_3, flowNFT721_4);
            const user4Diff = user4BT.diff(flowNFT721_3, flowNFT721_4);
            const treasuryDiff = treasuryBT.diff(flowNFT721_3, flowNFT721_4);

            expect(orderManagerDiff[ADDRESS_ZERO].delta.mul(-1)).to.equal(orderManagerBT.totalFee);
            expect(user1Diff[ADDRESS_ZERO].delta.mul(-1)).to.equal(user1BT.totalFee);
            expect(user2Diff[ADDRESS_ZERO].delta.mul(-1)).to.equal(user2BT.totalFee);
            expect(user3Diff[ADDRESS_ZERO].delta.mul(-1)).to.equal(user3BT.totalFee);
            expect(user4Diff[ADDRESS_ZERO].delta.mul(-1)).to.equal(user4BT.totalFee);
            expect(treasuryDiff[ADDRESS_ZERO].delta.mul(-1)).to.equal(treasuryBT.totalFee);

            expect(orderManagerDiff[token.address].delta).to.equal(
                INFO.user3.bid_price.add(INFO.user2.bid_price).add(INFO.user4.bid_price.mul(25).div(1000))
            );
            expect(user1Diff[token.address].delta).to.equal(
                INFO.user4.bid_price
                    .mul(975)
                    .div(1000)
                    .mul(975)
                    .div(1000)
            );
            expect(user2Diff[token.address].delta).to.equal(INFO.user2.bid_price.mul(-1));
            expect(user3Diff[token.address].delta).to.equal(INFO.user3.bid_price.mul(-1));
            expect(user4Diff[token.address].delta).to.equal(INFO.user4.bid_price.mul(-1));
            expect(treasuryDiff[token.address].delta).to.equal(
                INFO.user4.bid_price
                    .mul(975)
                    .div(1000)
                    .mul(25)
                    .div(1000)
            );
        });
    });

    describe("User1 mint token5(NFT721 - Public) -> user1 create sell -> No one offer => sell is expired", () => {
        before(async () => {
            ownerBT.resetTotalFee();
            user1BT.resetTotalFee();
            user2BT.resetTotalFee();
            user3BT.resetTotalFee();
            user4BT.resetTotalFee();
            user5BT.resetTotalFee();
            user6BT.resetTotalFee();
        });

        it("User1 mint token5(NFT721)", async () => {
            INFO.user1 = {
                ...INFO.user1,
                payment_token: token.address,
                nft_address: tokenMintERC721.address,
                amount: 1,
                token_uri: "token5_uri",
            };
            await BT.updateFee(tokenMintERC721.connect(owner).mint(INFO.user1.address, INFO.user1.token_uri));
            INFO.user1.token_id = await tokenMintERC721.getTokenCounter();
        });

        it("user1 create sell", async () => {
            INFO.user1 = {
                ...INFO.user1,
                sell_payment_token: token.address,
                sell_price: parseEther("3"),
                sell_start_time: (await getCurrentTime()) + 10,
                sell_end_time: (await getCurrentTime()) + ONE_WEEK,
                sell_merkle_tree: generateMerkleTree([user2.address, user3.address]),
            };

            await BT.updateFee(tokenMintERC721.connect(user1).approve(mkpManager.address, INFO.user1.token_id));
            await BT.updateFee(
                orderManager
                    .connect(user1)
                    .sell(
                        INFO.user1.nft_address,
                        INFO.user1.token_id,
                        INFO.user1.amount,
                        INFO.user1.sell_price,
                        INFO.user1.sell_start_time,
                        INFO.user1.sell_end_time,
                        INFO.user1.sell_payment_token,
                        INFO.user1.sell_merkle_tree.getHexRoot()
                    )
            );
            INFO.user1.sell_market_item_id = await mkpManager.getCurrentMarketItem();
        });

        it("No one offer => sell is expired", async () => {
            await skipTime(INFO.user1.sell_end_time - INFO.user1.sell_start_time + 10);

            await BT.expect(
                orderManager
                    .connect(user4)
                    .makeMarketItemOrder(
                        INFO.user1.sell_market_item_id,
                        INFO.user1.sell_payment_token,
                        parseEther("1"),
                        (await getCurrentTime()) + ONE_WEEK,
                        []
                    )
            ).to.revertedWith("Not the order time");
        });

        it("Check balance after flowNFT721_", async () => {
            flowNFT721_5 = "flowNFT721_5";

            await orderManagerBT.takeSnapshot(flowNFT721_5);
            await user1BT.takeSnapshot(flowNFT721_5);
            await user2BT.takeSnapshot(flowNFT721_5);
            await user3BT.takeSnapshot(flowNFT721_5);
            await user4BT.takeSnapshot(flowNFT721_5);
            await treasuryBT.takeSnapshot(flowNFT721_5);

            const orderManagerDiff = orderManagerBT.diff(flowNFT721_4, flowNFT721_5);
            const user1Diff = user1BT.diff(flowNFT721_4, flowNFT721_5);
            const user2Diff = user2BT.diff(flowNFT721_4, flowNFT721_5);
            const user3Diff = user3BT.diff(flowNFT721_4, flowNFT721_5);
            const user4Diff = user4BT.diff(flowNFT721_4, flowNFT721_5);
            const treasuryDiff = treasuryBT.diff(flowNFT721_4, flowNFT721_5);

            expect(orderManagerDiff[ADDRESS_ZERO].delta.mul(-1)).to.equal(orderManagerBT.totalFee);
            expect(user1Diff[ADDRESS_ZERO].delta.mul(-1)).to.equal(user1BT.totalFee);
            expect(user2Diff[ADDRESS_ZERO].delta.mul(-1)).to.equal(user2BT.totalFee);
            expect(user3Diff[ADDRESS_ZERO].delta.mul(-1)).to.equal(user3BT.totalFee);
            expect(user4Diff[ADDRESS_ZERO].delta.mul(-1)).to.equal(user4BT.totalFee);
            expect(treasuryDiff[ADDRESS_ZERO].delta.mul(-1)).to.equal(treasuryBT.totalFee);

            expect(orderManagerDiff[token.address].delta).to.equal(0);
            expect(user1Diff[token.address].delta).to.equal(0);
            expect(user2Diff[token.address].delta).to.equal(0);
            expect(user3Diff[token.address].delta).to.equal(0);
            expect(user4Diff[token.address].delta).to.equal(0);
            expect(treasuryDiff[token.address].delta).to.equal(0);
        });
    });

    describe("User1 mint token6(NFT721 - Private) -> user2, user3, user4 make offers -> user2 cancel offer -> user1 create sell (Native coin) -> user5, user6(not in white list) make offer on sell -> user 1 accept user5's offer", () => {
        before(async () => {
            ownerBT.resetTotalFee();
            user1BT.resetTotalFee();
            user2BT.resetTotalFee();
            user3BT.resetTotalFee();
            user4BT.resetTotalFee();
            user5BT.resetTotalFee();
            user6BT.resetTotalFee();
        });

        it("User1 mint token6(NFT721)", async () => {
            INFO.user1 = {
                ...INFO.user1,
                payment_token: token.address,
                nft_address: tokenMintERC721.address,
                amount: 1,
                token_uri: "token6_uri",
            };
            await BT.updateFee(tokenMintERC721.connect(owner).mint(INFO.user1.address, INFO.user1.token_uri));
            INFO.user1.token_id = await tokenMintERC721.getTokenCounter();
        });

        it("user2, user3, user4 make offer token6", async () => {
            // User2 make offer
            INFO.user2 = {
                ...INFO.user2,
                payment_token: token.address,
                bid_price: parseEther("1"),
                end_time: (await getCurrentTime()) + ONE_WEEK * 2,
            };
            await BT.updateFee(token.connect(user2).approve(orderManager.address, MAX_UINT256));
            await BT.expect(() =>
                orderManager
                    .connect(user2)
                    .makeWalletOrder(
                        INFO.user2.payment_token,
                        INFO.user2.bid_price,
                        INFO.user1.address,
                        INFO.user1.nft_address,
                        INFO.user1.token_id,
                        INFO.user1.amount,
                        INFO.user2.end_time
                    )
            ).changeTokenBalance(token, user2, INFO.user2.bid_price.mul(-1));
            INFO.user2.order_id = 10;

            // User3 make offer
            INFO.user3 = {
                ...INFO.user3,
                payment_token: token.address,
                bid_price: parseEther("1.5"),
                end_time: (await getCurrentTime()) + ONE_WEEK * 2,
            };
            await BT.updateFee(token.connect(user3).approve(orderManager.address, MAX_UINT256));
            await BT.expect(() =>
                orderManager
                    .connect(user3)
                    .makeWalletOrder(
                        INFO.user3.payment_token,
                        INFO.user3.bid_price,
                        INFO.user1.address,
                        INFO.user1.nft_address,
                        INFO.user1.token_id,
                        INFO.user1.amount,
                        INFO.user3.end_time
                    )
            ).changeTokenBalance(token, user3, INFO.user3.bid_price.mul(-1));
            INFO.user3.order_id = 11;

            // User4 make offer
            INFO.user4 = {
                ...INFO.user4,
                payment_token: token.address,
                bid_price: parseEther("1.7"),
                end_time: (await getCurrentTime()) + ONE_WEEK,
            };
            await BT.updateFee(token.connect(user4).approve(orderManager.address, MAX_UINT256));
            await BT.expect(() =>
                orderManager
                    .connect(user4)
                    .makeWalletOrder(
                        INFO.user4.payment_token,
                        INFO.user4.bid_price,
                        INFO.user1.address,
                        INFO.user1.nft_address,
                        INFO.user1.token_id,
                        INFO.user1.amount,
                        INFO.user4.end_time
                    )
            ).changeTokenBalance(token, user4, INFO.user4.bid_price.mul(-1));
            INFO.user4.order_id = 12;
        });

        it("user 2 cancel offer", async () => {
            await BT.expect(() =>
                orderManager.connect(user2).cancelWalletOrder(INFO.user2.order_id)
            ).changeTokenBalance(token, user2, INFO.user2.bid_price);
        });

        it("user1 create sell (Native coin)", async () => {
            INFO.user1 = {
                ...INFO.user1,
                sell_payment_token: ADDRESS_ZERO,
                sell_price: parseEther("3"),
                sell_start_time: (await getCurrentTime()) + 10,
                sell_end_time: (await getCurrentTime()) + ONE_WEEK,
                sell_merkle_tree: generateMerkleTree([user5.address]),
            };

            await BT.updateFee(tokenMintERC721.connect(user1).approve(mkpManager.address, INFO.user1.token_id));
            await BT.updateFee(
                orderManager
                    .connect(user1)
                    .sell(
                        INFO.user1.nft_address,
                        INFO.user1.token_id,
                        INFO.user1.amount,
                        INFO.user1.sell_price,
                        INFO.user1.sell_start_time,
                        INFO.user1.sell_end_time,
                        INFO.user1.sell_payment_token,
                        INFO.user1.sell_merkle_tree.getHexRoot()
                    )
            );
            INFO.user1.sell_market_item_id = await mkpManager.getCurrentMarketItem();
        });

        it("user 5, user 6 make offer on sell", async () => {
            // User5 make offer
            INFO.user5 = {
                ...INFO.user5,
                payment_token: ADDRESS_ZERO,
                bid_price: parseEther("1"),
                end_time: (await getCurrentTime()) + ONE_WEEK * 2,
            };
            await BT.updateFee(token.connect(user5).approve(orderManager.address, MAX_UINT256));
            await BT.updateFee(metaCitizen.mint(user5.address));
            await BT.expect(
                orderManager
                    .connect(user5)
                    .makeMarketItemOrder(
                        INFO.user1.sell_market_item_id,
                        INFO.user5.payment_token,
                        INFO.user5.bid_price,
                        INFO.user5.end_time,
                        INFO.user1.sell_merkle_tree.getHexProof(generateLeaf(user5.address)),
                        { value: INFO.user5.bid_price }
                    )
            ).to.revertedWith("Not the order time");

            await skipTime(10);
            await BT.expect(() =>
                orderManager
                    .connect(user5)
                    .makeMarketItemOrder(
                        INFO.user1.sell_market_item_id,
                        INFO.user5.payment_token,
                        INFO.user5.bid_price,
                        INFO.user5.end_time,
                        INFO.user1.sell_merkle_tree.getHexProof(generateLeaf(user5.address)),
                        { value: INFO.user5.bid_price }
                    )
            ).changeEtherBalance(user5, INFO.user5.bid_price.mul(-1));
            INFO.user5.market_item_order_id = 2;

            // User5 make offer
            INFO.user6 = {
                ...INFO.user6,
                payment_token: ADDRESS_ZERO,
                bid_price: parseEther("1"),
                end_time: (await getCurrentTime()) + ONE_WEEK * 2,
            };
            await BT.updateFee(token.connect(user6).approve(orderManager.address, MAX_UINT256));
            await BT.updateFee(metaCitizen.mint(user6.address));
            await BT.expect(
                orderManager
                    .connect(user6)
                    .makeMarketItemOrder(
                        INFO.user1.sell_market_item_id,
                        INFO.user6.payment_token,
                        INFO.user6.bid_price,
                        INFO.user6.end_time,
                        INFO.user1.sell_merkle_tree.getHexProof(generateLeaf(user6.address)),
                        { value: INFO.user6.bid_price }
                    )
            ).to.revertedWith("Require own MetaCitizen NFT");
        });

        it("user 1 accept user5's offer", async () => {
            await BT.expect(() =>
                orderManager.connect(user1).acceptMarketItemOrder(INFO.user5.market_item_order_id)
            ).changeEtherBalance(
                user1,
                INFO.user5.bid_price
                    .mul(975)
                    .div(1000)
                    .mul(975)
                    .div(1000)
            );
        });

        it("Check balance after flowNFT721_", async () => {
            flowNFT721_6 = "flowNFT721_6";

            await orderManagerBT.takeSnapshot(flowNFT721_6);
            await user1BT.takeSnapshot(flowNFT721_6);
            await user2BT.takeSnapshot(flowNFT721_6);
            await user3BT.takeSnapshot(flowNFT721_6);
            await user4BT.takeSnapshot(flowNFT721_6);
            await user5BT.takeSnapshot(flowNFT721_6);
            await user6BT.takeSnapshot(flowNFT721_6);
            await treasuryBT.takeSnapshot(flowNFT721_6);

            const orderManagerDiff = orderManagerBT.diff(flowNFT721_5, flowNFT721_6);
            const user1Diff = user1BT.diff(flowNFT721_5, flowNFT721_6);
            const user2Diff = user2BT.diff(flowNFT721_5, flowNFT721_6);
            const user3Diff = user3BT.diff(flowNFT721_5, flowNFT721_6);
            const user4Diff = user4BT.diff(flowNFT721_5, flowNFT721_6);
            const user5Diff = user5BT.diff(flowBegin, flowNFT721_6);
            const user6Diff = user6BT.diff(flowBegin, flowNFT721_6);
            const treasuryDiff = treasuryBT.diff(flowNFT721_5, flowNFT721_6);

            expect(orderManagerDiff[ADDRESS_ZERO].delta.mul(-1)).to.equal(
                orderManagerBT.totalFee.sub(INFO.user5.bid_price.mul(25).div(1000))
            );
            expect(user1Diff[ADDRESS_ZERO].delta.mul(-1)).to.equal(
                user1BT.totalFee.add(
                    orderManagerBT.totalFee.sub(
                        INFO.user5.bid_price
                            .mul(975)
                            .div(1000)
                            .mul(975)
                            .div(1000)
                    )
                )
            );
            expect(user2Diff[ADDRESS_ZERO].delta.mul(-1)).to.equal(user2BT.totalFee);
            expect(user3Diff[ADDRESS_ZERO].delta.mul(-1)).to.equal(user3BT.totalFee);
            expect(user4Diff[ADDRESS_ZERO].delta.mul(-1)).to.equal(user4BT.totalFee);
            expect(user5Diff[ADDRESS_ZERO].delta.mul(-1)).to.equal(user5BT.totalFee.add(INFO.user5.bid_price));
            expect(user6Diff[ADDRESS_ZERO].delta.mul(-1)).to.equal(user6BT.totalFee);
            expect(treasuryDiff[ADDRESS_ZERO].delta.mul(-1)).to.equal(
                treasuryBT.totalFee.sub(
                    INFO.user5.bid_price
                        .mul(975)
                        .div(1000)
                        .mul(25)
                        .div(1000)
                )
            );

            expect(orderManagerDiff[token.address].delta).to.equal(INFO.user3.bid_price.add(INFO.user4.bid_price));
            expect(user1Diff[token.address].delta).to.equal(0);
            expect(user2Diff[token.address].delta).to.equal(0);
            expect(user3Diff[token.address].delta).to.equal(INFO.user3.bid_price.mul(-1));
            expect(user4Diff[token.address].delta).to.equal(INFO.user4.bid_price.mul(-1));
            expect(user5Diff[token.address].delta).to.equal(0);
            expect(user6Diff[token.address].delta).to.equal(0);
            expect(treasuryDiff[token.address].delta).to.equal(0);
        });
    });

    describe("User1 mint token7(NFT721 - Public) -> user2, user3, user4 make offers -> user1 create sell -> user 5, user 6 make offers on sell -> user1 cancel sell -> user 1 accept user2's offer", () => {
        before(async () => {
            ownerBT.resetTotalFee();
            user1BT.resetTotalFee();
            user2BT.resetTotalFee();
            user3BT.resetTotalFee();
            user4BT.resetTotalFee();
            user5BT.resetTotalFee();
            user6BT.resetTotalFee();
        });

        it("User1 mint token7(NFT721)", async () => {
            INFO.user1 = {
                ...INFO.user1,
                payment_token: token.address,
                nft_address: tokenMintERC721.address,
                amount: 1,
                token_uri: "token7_uri",
            };
            await BT.updateFee(tokenMintERC721.connect(owner).mint(INFO.user1.address, INFO.user1.token_uri));
            INFO.user1.token_id = await tokenMintERC721.getTokenCounter();
        });

        it("user2, user3, user4 make offer token7", async () => {
            // User2 make offer
            INFO.user2 = {
                ...INFO.user2,
                payment_token: token.address,
                bid_price: parseEther("1"),
                end_time: (await getCurrentTime()) + ONE_WEEK * 2,
            };
            await BT.updateFee(token.connect(user2).approve(orderManager.address, MAX_UINT256));
            await BT.expect(() =>
                orderManager
                    .connect(user2)
                    .makeWalletOrder(
                        INFO.user2.payment_token,
                        INFO.user2.bid_price,
                        INFO.user1.address,
                        INFO.user1.nft_address,
                        INFO.user1.token_id,
                        INFO.user1.amount,
                        INFO.user2.end_time
                    )
            ).changeTokenBalance(token, user2, INFO.user2.bid_price.mul(-1));
            INFO.user2.order_id = 13;

            // User3 make offer
            INFO.user3 = {
                ...INFO.user3,
                payment_token: token.address,
                bid_price: parseEther("1.5"),
                end_time: (await getCurrentTime()) + ONE_WEEK * 2,
            };
            await BT.updateFee(token.connect(user3).approve(orderManager.address, MAX_UINT256));
            await BT.expect(() =>
                orderManager
                    .connect(user3)
                    .makeWalletOrder(
                        INFO.user3.payment_token,
                        INFO.user3.bid_price,
                        INFO.user1.address,
                        INFO.user1.nft_address,
                        INFO.user1.token_id,
                        INFO.user1.amount,
                        INFO.user3.end_time
                    )
            ).changeTokenBalance(token, user3, INFO.user3.bid_price.mul(-1));
            INFO.user3.order_id = 14;

            // User4 make offer
            INFO.user4 = {
                ...INFO.user4,
                payment_token: token.address,
                bid_price: parseEther("1.7"),
                end_time: (await getCurrentTime()) + ONE_WEEK,
            };
            await BT.updateFee(token.connect(user4).approve(orderManager.address, MAX_UINT256));
            await BT.expect(() =>
                orderManager
                    .connect(user4)
                    .makeWalletOrder(
                        INFO.user4.payment_token,
                        INFO.user4.bid_price,
                        INFO.user1.address,
                        INFO.user1.nft_address,
                        INFO.user1.token_id,
                        INFO.user1.amount,
                        INFO.user4.end_time
                    )
            ).changeTokenBalance(token, user4, INFO.user4.bid_price.mul(-1));
            INFO.user4.order_id = 15;
        });

        it("user1 create sell", async () => {
            INFO.user1 = {
                ...INFO.user1,
                sell_payment_token: token.address,
                sell_price: parseEther("3"),
                sell_start_time: (await getCurrentTime()) + 10,
                sell_end_time: (await getCurrentTime()) + ONE_WEEK,
            };

            await BT.updateFee(tokenMintERC721.connect(user1).approve(mkpManager.address, INFO.user1.token_id));
            await BT.updateFee(
                orderManager
                    .connect(user1)
                    .sell(
                        INFO.user1.nft_address,
                        INFO.user1.token_id,
                        INFO.user1.amount,
                        INFO.user1.sell_price,
                        INFO.user1.sell_start_time,
                        INFO.user1.sell_end_time,
                        INFO.user1.sell_payment_token,
                        []
                    )
            );
            INFO.user1.sell_market_item_id = await mkpManager.getCurrentMarketItem();
        });

        it("user 5, user 6 make offers on sell", async () => {
            INFO.user5.bid_price = parseEther("1.5");
            INFO.user5.end_time = (await getCurrentTime()) + ONE_WEEK;
            await BT.expect(
                orderManager
                    .connect(user5)
                    .makeMarketItemOrder(
                        INFO.user1.sell_market_item_id,
                        INFO.user1.sell_payment_token,
                        INFO.user5.bid_price,
                        INFO.user5.end_time,
                        []
                    )
            ).to.revertedWith("Not the order time");

            await skipTime(10);
            await BT.expect(metaCitizen.mint(user5.address)).to.revertedWith("Already have one");
            await BT.expect(() =>
                orderManager
                    .connect(user5)
                    .makeMarketItemOrder(
                        INFO.user1.sell_market_item_id,
                        INFO.user1.sell_payment_token,
                        INFO.user5.bid_price,
                        INFO.user5.end_time,
                        []
                    )
            ).changeTokenBalance(token, user5, INFO.user5.bid_price.mul(-1));
            INFO.user5.market_item_order_id = 3;

            // User 6 make order
            INFO.user6.bid_price = parseEther("1.5");
            INFO.user6.end_time = (await getCurrentTime()) + ONE_WEEK;
            await BT.expect(metaCitizen.mint(user6.address)).to.revertedWith("Already have one");
            await BT.expect(() =>
                orderManager
                    .connect(user6)
                    .makeMarketItemOrder(
                        INFO.user1.sell_market_item_id,
                        INFO.user1.sell_payment_token,
                        INFO.user6.bid_price,
                        INFO.user6.end_time,
                        []
                    )
            ).changeTokenBalance(token, user6, INFO.user6.bid_price.mul(-1));
            INFO.user6.market_item_order_id = 4;
        });

        it("user1 cancel sell", async () => {
            await BT.updateFee(orderManager.connect(user1).cancelSell(INFO.user1.sell_market_item_id));
        });

        it("user 1 accept user2's offer", async () => {
            await BT.updateFee(tokenMintERC721.connect(user1).approve(orderManager.address, INFO.user1.token_id));
            await BT.expect(() =>
                orderManager.connect(user1).acceptWalletOrder(INFO.user2.order_id)
            ).changeTokenBalance(
                token,
                user1,
                INFO.user2.bid_price
                    .mul(975)
                    .div(1000)
                    .mul(975)
                    .div(1000)
            );
        });

        it("Check balance after flowNFT721_", async () => {
            flowNFT721_7 = "flowNFT721_7";

            await orderManagerBT.takeSnapshot(flowNFT721_7);
            await user1BT.takeSnapshot(flowNFT721_7);
            await user2BT.takeSnapshot(flowNFT721_7);
            await user3BT.takeSnapshot(flowNFT721_7);
            await user4BT.takeSnapshot(flowNFT721_7);
            await user5BT.takeSnapshot(flowNFT721_7);
            await user6BT.takeSnapshot(flowNFT721_7);
            await treasuryBT.takeSnapshot(flowNFT721_7);

            const orderManagerDiff = orderManagerBT.diff(flowNFT721_6, flowNFT721_7);
            const user1Diff = user1BT.diff(flowNFT721_6, flowNFT721_7);
            const user2Diff = user2BT.diff(flowNFT721_6, flowNFT721_7);
            const user3Diff = user3BT.diff(flowNFT721_6, flowNFT721_7);
            const user4Diff = user4BT.diff(flowNFT721_6, flowNFT721_7);
            const user5Diff = user5BT.diff(flowNFT721_6, flowNFT721_7);
            const user6Diff = user6BT.diff(flowNFT721_6, flowNFT721_7);
            const treasuryDiff = treasuryBT.diff(flowNFT721_6, flowNFT721_7);

            expect(orderManagerDiff[ADDRESS_ZERO].delta.mul(-1)).to.equal(orderManagerBT.totalFee);
            expect(user1Diff[ADDRESS_ZERO].delta.mul(-1)).to.equal(user1BT.totalFee);
            expect(user2Diff[ADDRESS_ZERO].delta.mul(-1)).to.equal(user2BT.totalFee);
            expect(user3Diff[ADDRESS_ZERO].delta.mul(-1)).to.equal(user3BT.totalFee);
            expect(user4Diff[ADDRESS_ZERO].delta.mul(-1)).to.equal(user4BT.totalFee);
            expect(user5Diff[ADDRESS_ZERO].delta.mul(-1)).to.equal(user5BT.totalFee);
            expect(user6Diff[ADDRESS_ZERO].delta.mul(-1)).to.equal(user6BT.totalFee);
            expect(treasuryDiff[ADDRESS_ZERO].delta.mul(-1)).to.equal(treasuryBT.totalFee);

            expect(orderManagerDiff[token.address].delta).to.equal(
                INFO.user3.bid_price
                    .add(INFO.user4.bid_price)
                    .add(INFO.user5.bid_price)
                    .add(INFO.user6.bid_price)
                    .add(INFO.user2.bid_price.mul(25).div(1000))
            );
            expect(user1Diff[token.address].delta).to.equal(
                INFO.user2.bid_price
                    .mul(975)
                    .div(1000)
                    .mul(975)
                    .div(1000)
            );
            expect(user2Diff[token.address].delta).to.equal(INFO.user2.bid_price.mul(-1));
            expect(user3Diff[token.address].delta).to.equal(INFO.user3.bid_price.mul(-1));
            expect(user4Diff[token.address].delta).to.equal(INFO.user4.bid_price.mul(-1));
            expect(user5Diff[token.address].delta).to.equal(INFO.user5.bid_price.mul(-1));
            expect(user6Diff[token.address].delta).to.equal(INFO.user6.bid_price.mul(-1));
            expect(treasuryDiff[token.address].delta).to.equal(
                INFO.user2.bid_price
                    .mul(975)
                    .div(1000)
                    .mul(25)
                    .div(1000)
            );
        });
    });

    describe("User1 mint token8(NFT721 - Public) -> user1 create sell -> user2, user3, user4 make offers on sell -> all cancel offers", () => {
        before(async () => {
            ownerBT.resetTotalFee();
            user1BT.resetTotalFee();
            user2BT.resetTotalFee();
            user3BT.resetTotalFee();
            user4BT.resetTotalFee();
            user5BT.resetTotalFee();
            user6BT.resetTotalFee();
        });

        it("User1 mint token8(NFT721)", async () => {
            INFO.user1 = {
                ...INFO.user1,
                payment_token: token.address,
                nft_address: tokenMintERC721.address,
                amount: 1,
                token_uri: "token8_uri",
            };
            await BT.updateFee(tokenMintERC721.connect(owner).mint(INFO.user1.address, INFO.user1.token_uri));
            INFO.user1.token_id = await tokenMintERC721.getTokenCounter();
        });

        it("user1 create sell", async () => {
            INFO.user1 = {
                ...INFO.user1,
                sell_payment_token: token.address,
                sell_price: parseEther("3"),
                sell_start_time: (await getCurrentTime()) + 10,
                sell_end_time: (await getCurrentTime()) + ONE_WEEK,
            };

            await BT.updateFee(tokenMintERC721.connect(user1).approve(mkpManager.address, INFO.user1.token_id));
            await BT.updateFee(
                orderManager
                    .connect(user1)
                    .sell(
                        INFO.user1.nft_address,
                        INFO.user1.token_id,
                        INFO.user1.amount,
                        INFO.user1.sell_price,
                        INFO.user1.sell_start_time,
                        INFO.user1.sell_end_time,
                        INFO.user1.sell_payment_token,
                        []
                    )
            );
            INFO.user1.sell_market_item_id = await mkpManager.getCurrentMarketItem();
        });

        it("user2, user3, user4 make offers on sell", async () => {
            // User 2 make order
            INFO.user2.bid_price = parseEther("1.5");
            INFO.user2.end_time = (await getCurrentTime()) + ONE_WEEK;
            await BT.expect(
                orderManager
                    .connect(user2)
                    .makeMarketItemOrder(
                        INFO.user1.sell_market_item_id,
                        INFO.user1.sell_payment_token,
                        INFO.user2.bid_price,
                        INFO.user2.end_time,
                        []
                    )
            ).to.revertedWith("Not the order time");

            await skipTime(10);
            await BT.updateFee(metaCitizen.mint(user2.address));
            await BT.expect(() =>
                orderManager
                    .connect(user2)
                    .makeMarketItemOrder(
                        INFO.user1.sell_market_item_id,
                        INFO.user1.sell_payment_token,
                        INFO.user2.bid_price,
                        INFO.user2.end_time,
                        []
                    )
            ).changeTokenBalance(token, user2, INFO.user2.bid_price.mul(-1));
            INFO.user2.market_item_order_id = 5;

            // User 3 make order
            INFO.user3.bid_price = parseEther("1.5");
            INFO.user3.end_time = (await getCurrentTime()) + ONE_WEEK;
            await BT.updateFee(metaCitizen.mint(user3.address));
            await BT.expect(() =>
                orderManager
                    .connect(user3)
                    .makeMarketItemOrder(
                        INFO.user1.sell_market_item_id,
                        INFO.user1.sell_payment_token,
                        INFO.user3.bid_price,
                        INFO.user3.end_time,
                        []
                    )
            ).changeTokenBalance(token, user3, INFO.user3.bid_price.mul(-1));
            INFO.user3.market_item_order_id = 6;

            // User 4 make order
            INFO.user4.bid_price = parseEther("1.7");
            INFO.user4.end_time = (await getCurrentTime()) + ONE_WEEK;
            await BT.expect(metaCitizen.mint(user4.address)).to.revertedWith("Already have one");
            await BT.expect(() =>
                orderManager
                    .connect(user4)
                    .makeMarketItemOrder(
                        INFO.user1.sell_market_item_id,
                        INFO.user1.sell_payment_token,
                        INFO.user4.bid_price,
                        INFO.user4.end_time,
                        []
                    )
            ).changeTokenBalance(token, user4, INFO.user4.bid_price.mul(-1));
            INFO.user4.market_item_order_id = 7;
        });

        it("all cancel offers", async () => {
            await BT.updateFee(orderManager.connect(user2).cancelMarketItemOrder(INFO.user2.market_item_order_id));
            await BT.updateFee(orderManager.connect(user3).cancelMarketItemOrder(INFO.user3.market_item_order_id));
            await BT.updateFee(orderManager.connect(user4).cancelMarketItemOrder(INFO.user4.market_item_order_id));
        });

        it("Check balance after flowNFT721_", async () => {
            flowNFT721_8 = "flowNFT721_8";

            await orderManagerBT.takeSnapshot(flowNFT721_8);
            await user1BT.takeSnapshot(flowNFT721_8);
            await user2BT.takeSnapshot(flowNFT721_8);
            await user3BT.takeSnapshot(flowNFT721_8);
            await user4BT.takeSnapshot(flowNFT721_8);
            await user5BT.takeSnapshot(flowNFT721_8);
            await user6BT.takeSnapshot(flowNFT721_8);
            await treasuryBT.takeSnapshot(flowNFT721_8);

            const orderManagerDiff = orderManagerBT.diff(flowNFT721_7, flowNFT721_8);
            const user1Diff = user1BT.diff(flowNFT721_7, flowNFT721_8);
            const user2Diff = user2BT.diff(flowNFT721_7, flowNFT721_8);
            const user3Diff = user3BT.diff(flowNFT721_7, flowNFT721_8);
            const user4Diff = user4BT.diff(flowNFT721_7, flowNFT721_8);
            const user5Diff = user5BT.diff(flowNFT721_7, flowNFT721_8);
            const user6Diff = user6BT.diff(flowNFT721_7, flowNFT721_8);
            const treasuryDiff = treasuryBT.diff(flowNFT721_7, flowNFT721_8);

            expect(orderManagerDiff[ADDRESS_ZERO].delta.mul(-1)).to.equal(orderManagerBT.totalFee);
            expect(user1Diff[ADDRESS_ZERO].delta.mul(-1)).to.equal(user1BT.totalFee);
            expect(user2Diff[ADDRESS_ZERO].delta.mul(-1)).to.equal(user2BT.totalFee);
            expect(user3Diff[ADDRESS_ZERO].delta.mul(-1)).to.equal(user3BT.totalFee);
            expect(user4Diff[ADDRESS_ZERO].delta.mul(-1)).to.equal(user4BT.totalFee);
            expect(user5Diff[ADDRESS_ZERO].delta.mul(-1)).to.equal(user5BT.totalFee);
            expect(user6Diff[ADDRESS_ZERO].delta.mul(-1)).to.equal(user6BT.totalFee);
            expect(treasuryDiff[ADDRESS_ZERO].delta.mul(-1)).to.equal(treasuryBT.totalFee);

            expect(orderManagerDiff[token.address].delta).to.equal(0);
            expect(user1Diff[token.address].delta).to.equal(0);
            expect(user2Diff[token.address].delta).to.equal(0);
            expect(user3Diff[token.address].delta).to.equal(0);
            expect(user4Diff[token.address].delta).to.equal(0);
            expect(user5Diff[token.address].delta).to.equal(0);
            expect(user6Diff[token.address].delta).to.equal(0);
            expect(treasuryDiff[token.address].delta).to.equal(0);
        });
    });

    describe("User1 mint MetaCitizen token -> user1 create sell with Meta Citizen NFT (Must be fail)", () => {
        before(async () => {
            ownerBT.resetTotalFee();
            user1BT.resetTotalFee();
            user2BT.resetTotalFee();
            user3BT.resetTotalFee();
            user4BT.resetTotalFee();
            user5BT.resetTotalFee();
            user6BT.resetTotalFee();
        });

        it("user1 create sell with Meta Citizen NFT", async () => {
            INFO.user1 = {
                ...INFO.user1,
                payment_token: token.address,
                nft_address: metaCitizen.address,
                amount: 1,
                token_uri: "token8_uri",
            };
            await BT.updateFee(metaCitizen.mint(user1.address));
            INFO.user1.token_id = await metaCitizen.getTokenCounter();
        });

        it("user1 create sell with Meta Citizen NFT (Must be fail)", async () => {
            INFO.user1 = {
                ...INFO.user1,
                sell_payment_token: token.address,
                sell_price: parseEther("2"),
                sell_start_time: (await getCurrentTime()) + 10,
                sell_end_time: (await getCurrentTime()) + ONE_WEEK,
            };

            await BT.updateFee(metaCitizen.connect(user1).approve(mkpManager.address, INFO.user1.token_id));
            await BT.expect(
                orderManager
                    .connect(user1)
                    .sell(
                        INFO.user1.nft_address,
                        INFO.user1.token_id,
                        INFO.user1.amount,
                        INFO.user1.sell_price,
                        INFO.user1.sell_start_time,
                        INFO.user1.sell_end_time,
                        INFO.user1.sell_payment_token,
                        []
                    )
            ).to.revertedWith("Can not be transfered");
        });

        it("Check balance after flowNFT721_", async () => {
            flowNFT721_9 = "flowNFT721_9";

            await orderManagerBT.takeSnapshot(flowNFT721_9);
            await user1BT.takeSnapshot(flowNFT721_9);
            await user2BT.takeSnapshot(flowNFT721_9);
            await user3BT.takeSnapshot(flowNFT721_9);
            await user4BT.takeSnapshot(flowNFT721_9);
            await user5BT.takeSnapshot(flowNFT721_9);
            await user6BT.takeSnapshot(flowNFT721_9);
            await treasuryBT.takeSnapshot(flowNFT721_9);

            const orderManagerDiff = orderManagerBT.diff(flowNFT721_8, flowNFT721_9);
            const user1Diff = user1BT.diff(flowNFT721_8, flowNFT721_9);
            const user2Diff = user2BT.diff(flowNFT721_8, flowNFT721_9);
            const user3Diff = user3BT.diff(flowNFT721_8, flowNFT721_9);
            const user4Diff = user4BT.diff(flowNFT721_8, flowNFT721_9);
            const user5Diff = user5BT.diff(flowNFT721_8, flowNFT721_9);
            const user6Diff = user6BT.diff(flowNFT721_8, flowNFT721_9);
            const treasuryDiff = treasuryBT.diff(flowNFT721_8, flowNFT721_9);

            expect(orderManagerDiff[ADDRESS_ZERO].delta.mul(-1)).to.equal(orderManagerBT.totalFee);
            expect(user1Diff[ADDRESS_ZERO].delta.mul(-1)).to.equal(user1BT.totalFee);
            expect(user2Diff[ADDRESS_ZERO].delta.mul(-1)).to.equal(user2BT.totalFee);
            expect(user3Diff[ADDRESS_ZERO].delta.mul(-1)).to.equal(user3BT.totalFee);
            expect(user4Diff[ADDRESS_ZERO].delta.mul(-1)).to.equal(user4BT.totalFee);
            expect(user5Diff[ADDRESS_ZERO].delta.mul(-1)).to.equal(user5BT.totalFee);
            expect(user6Diff[ADDRESS_ZERO].delta.mul(-1)).to.equal(user6BT.totalFee);
            expect(treasuryDiff[ADDRESS_ZERO].delta.mul(-1)).to.equal(treasuryBT.totalFee);

            expect(orderManagerDiff[token.address].delta).to.equal(0);
            expect(user1Diff[token.address].delta).to.equal(0);
            expect(user2Diff[token.address].delta).to.equal(0);
            expect(user3Diff[token.address].delta).to.equal(0);
            expect(user4Diff[token.address].delta).to.equal(0);
            expect(user5Diff[token.address].delta).to.equal(0);
            expect(user6Diff[token.address].delta).to.equal(0);
            expect(treasuryDiff[token.address].delta).to.equal(0);
        });
    });
});

describe("Marketplace Manager flow test for ERC1155 token:", () => {
    before(async () => {
        flowBegin = flowNFT721_9;
    });

    describe("User1 mint token1(NFT1155 - Public) -> user2, user3 make offer token1 -> user1 accept offer of user2 -> user3 cancel offer", () => {
        before(async () => {
            ownerBT.resetTotalFee();
            user1BT.resetTotalFee();
            user2BT.resetTotalFee();
            user3BT.resetTotalFee();
            user4BT.resetTotalFee();
            user5BT.resetTotalFee();
            user6BT.resetTotalFee();
        });

        it("User1 mint token1(NFT1155)", async () => {
            INFO.user1 = {
                ...INFO.user1,
                nft_address: tokenMintERC1155.address,
                amount: 10,
                token_uri: "token1_uri",
            };

            await BT.updateFee(
                tokenMintERC1155.connect(owner).mint(INFO.user1.address, INFO.user1.amount, INFO.user1.token_uri)
            );
            INFO.user1.token_id = await tokenMintERC1155.getTokenCounter();
        });

        it("user2, user3 make offer token1", async () => {
            // User2 make offer
            INFO.user2 = {
                ...INFO.user2,
                payment_token: token.address,
                bid_price: parseEther("1"),
                end_time: (await getCurrentTime()) + ONE_WEEK,
            };
            await BT.expect(() =>
                orderManager
                    .connect(user2)
                    .makeWalletOrder(
                        INFO.user2.payment_token,
                        INFO.user2.bid_price,
                        INFO.user1.address,
                        INFO.user1.nft_address,
                        INFO.user1.token_id,
                        INFO.user1.amount,
                        INFO.user2.end_time
                    )
            ).changeTokenBalance(token, user2, INFO.user2.bid_price.mul(-1));
            INFO.user2.order_id = 16;

            // User3 make offer
            INFO.user3 = {
                ...INFO.user3,
                payment_token: token.address,
                bid_price: parseEther("1.5"),
                end_time: (await getCurrentTime()) + ONE_WEEK,
            };
            await BT.expect(() =>
                orderManager
                    .connect(user3)
                    .makeWalletOrder(
                        INFO.user3.payment_token,
                        INFO.user3.bid_price,
                        INFO.user1.address,
                        INFO.user1.nft_address,
                        INFO.user1.token_id,
                        INFO.user1.amount,
                        INFO.user3.end_time
                    )
            ).changeTokenBalance(token, user3, INFO.user3.bid_price.mul(-1));
            INFO.user3.order_id = 17;
        });

        it("user1 accept offer of user2", async () => {
            await BT.updateFee(tokenMintERC1155.connect(user1).setApprovalForAll(orderManager.address, true));
            await BT.expect(() =>
                orderManager.connect(user1).acceptWalletOrder(INFO.user2.order_id)
            ).changeTokenBalance(
                token,
                user1,
                INFO.user2.bid_price
                    .mul(975)
                    .div(1000)
                    .mul(975)
                    .div(1000)
            );
        });

        it("user3 cancel offer", async () => {
            await BT.expect(() =>
                orderManager.connect(user3).cancelWalletOrder(INFO.user3.order_id)
            ).changeTokenBalance(token, user3, INFO.user3.bid_price);
        });

        it("Check balance after flowNFT1155_", async () => {
            flowNFT1155_1 = "flowNFT1155_1";

            await orderManagerBT.takeSnapshot(flowNFT1155_1);
            await user1BT.takeSnapshot(flowNFT1155_1);
            await user2BT.takeSnapshot(flowNFT1155_1);
            await user3BT.takeSnapshot(flowNFT1155_1);
            await treasuryBT.takeSnapshot(flowNFT1155_1);

            const orderManagerDiff = orderManagerBT.diff(flowBegin, flowNFT1155_1);
            const user1Diff = user1BT.diff(flowBegin, flowNFT1155_1);
            const user2Diff = user2BT.diff(flowBegin, flowNFT1155_1);
            const user3Diff = user3BT.diff(flowBegin, flowNFT1155_1);
            const treasuryDiff = treasuryBT.diff(flowBegin, flowNFT1155_1);

            expect(orderManagerDiff[ADDRESS_ZERO].delta.mul(-1)).to.equal(orderManagerBT.totalFee);
            expect(user1Diff[ADDRESS_ZERO].delta.mul(-1)).to.equal(user1BT.totalFee);
            expect(user2Diff[ADDRESS_ZERO].delta.mul(-1)).to.equal(user2BT.totalFee);
            expect(user3Diff[ADDRESS_ZERO].delta.mul(-1)).to.equal(user3BT.totalFee);
            expect(treasuryDiff[ADDRESS_ZERO].delta.mul(-1)).to.equal(treasuryBT.totalFee);

            expect(orderManagerDiff[token.address].delta).to.equal(INFO.user2.bid_price.mul(25).div(1000));
            expect(user1Diff[token.address].delta).to.equal(
                INFO.user2.bid_price
                    .mul(975)
                    .div(1000)
                    .mul(975)
                    .div(1000)
            );
            expect(user2Diff[token.address].delta).to.equal(INFO.user2.bid_price.mul(-1));
            expect(user3Diff[token.address].delta).to.equal(0);
            expect(treasuryDiff[token.address].delta).to.equal(
                INFO.user2.bid_price
                    .mul(975)
                    .div(1000)
                    .mul(25)
                    .div(1000)
            );
        });
    });

    describe("User1 mint token2(NFT1155 - Public) -> user2, user3 make offer token2 -> cancel all offers", () => {
        before(async () => {
            ownerBT.resetTotalFee();
            user1BT.resetTotalFee();
            user2BT.resetTotalFee();
            user3BT.resetTotalFee();
            user4BT.resetTotalFee();
            user5BT.resetTotalFee();
            user6BT.resetTotalFee();
        });

        it("User1 mint token2(NFT1155)", async () => {
            INFO.user1 = {
                ...INFO.user1,
                nft_address: tokenMintERC1155.address,
                amount: 10,
                token_uri: "token2_uri",
            };
            await BT.updateFee(
                tokenMintERC1155.connect(owner).mint(INFO.user1.address, INFO.user1.amount, INFO.user1.token_uri)
            );
            INFO.user1.token_id = await tokenMintERC1155.getTokenCounter();
        });

        it("user2, user3 make offer token2", async () => {
            // User2 make offer
            INFO.user2 = {
                ...INFO.user2,
                payment_token: token.address,
                bid_price: parseEther("1"),
                end_time: (await getCurrentTime()) + ONE_WEEK,
            };
            await BT.expect(() =>
                orderManager
                    .connect(user2)
                    .makeWalletOrder(
                        INFO.user2.payment_token,
                        INFO.user2.bid_price,
                        INFO.user1.address,
                        INFO.user1.nft_address,
                        INFO.user1.token_id,
                        INFO.user1.amount,
                        INFO.user2.end_time
                    )
            ).changeTokenBalance(token, user2, INFO.user2.bid_price.mul(-1));
            INFO.user2.order_id = 18;

            // User3 make offer
            INFO.user3 = {
                ...INFO.user3,
                payment_token: token.address,
                bid_price: parseEther("1.5"),
                end_time: (await getCurrentTime()) + ONE_WEEK,
            };
            await BT.expect(() =>
                orderManager
                    .connect(user3)
                    .makeWalletOrder(
                        INFO.user3.payment_token,
                        INFO.user3.bid_price,
                        INFO.user1.address,
                        INFO.user1.nft_address,
                        INFO.user1.token_id,
                        INFO.user1.amount,
                        INFO.user3.end_time
                    )
            ).changeTokenBalance(token, user3, INFO.user3.bid_price.mul(-1));
            INFO.user3.order_id = 19;
        });

        it("cancel all offers", async () => {
            await BT.expect(() =>
                orderManager.connect(user2).cancelWalletOrder(INFO.user2.order_id)
            ).changeTokenBalance(token, user2, INFO.user2.bid_price);

            await BT.expect(() =>
                orderManager.connect(user3).cancelWalletOrder(INFO.user3.order_id)
            ).changeTokenBalance(token, user3, INFO.user3.bid_price);
        });

        it("Check balance after flowNFT1155_", async () => {
            flowNFT1155_2 = "flowNFT1155_2";

            await orderManagerBT.takeSnapshot(flowNFT1155_2);
            await user1BT.takeSnapshot(flowNFT1155_2);
            await user2BT.takeSnapshot(flowNFT1155_2);
            await user3BT.takeSnapshot(flowNFT1155_2);
            await treasuryBT.takeSnapshot(flowNFT1155_2);

            const orderManagerDiff = orderManagerBT.diff(flowNFT1155_1, flowNFT1155_2);
            const user1Diff = user1BT.diff(flowNFT1155_1, flowNFT1155_2);
            const user2Diff = user2BT.diff(flowNFT1155_1, flowNFT1155_2);
            const user3Diff = user3BT.diff(flowNFT1155_1, flowNFT1155_2);
            const treasuryDiff = treasuryBT.diff(flowNFT1155_1, flowNFT1155_2);

            expect(orderManagerDiff[ADDRESS_ZERO].delta.mul(-1)).to.equal(orderManagerBT.totalFee);
            expect(user1Diff[ADDRESS_ZERO].delta.mul(-1)).to.equal(user1BT.totalFee);
            expect(user2Diff[ADDRESS_ZERO].delta.mul(-1)).to.equal(user2BT.totalFee);
            expect(user3Diff[ADDRESS_ZERO].delta.mul(-1)).to.equal(user3BT.totalFee);
            expect(treasuryDiff[ADDRESS_ZERO].delta.mul(-1)).to.equal(treasuryBT.totalFee);

            expect(orderManagerDiff[token.address].delta).to.equal(0);
            expect(user1Diff[token.address].delta).to.equal(0);
            expect(user2Diff[token.address].delta).to.equal(0);
            expect(user3Diff[token.address].delta).to.equal(0);
            expect(treasuryDiff[token.address].delta).to.equal(0);
        });
    });

    describe("User1 mint token3(NFT1155 - Private) -> user2, user3, user4 make offer token3 -> user1 create sell (user1 can't accept previous offers) -> waiting until MarketItem is expired => user1 cancel MarketItem -> user1 accept user2 offer", () => {
        before(async () => {
            ownerBT.resetTotalFee();
            user1BT.resetTotalFee();
            user2BT.resetTotalFee();
            user3BT.resetTotalFee();
            user4BT.resetTotalFee();
            user5BT.resetTotalFee();
            user6BT.resetTotalFee();
        });

        it("User1 mint token3(NFT1155)", async () => {
            INFO.user1 = {
                ...INFO.user1,
                payment_token: token.address,
                nft_address: tokenMintERC1155.address,
                amount: 10,
                token_uri: "token3_uri",
            };
            await BT.updateFee(
                tokenMintERC1155.connect(owner).mint(INFO.user1.address, INFO.user1.amount, INFO.user1.token_uri)
            );
            INFO.user1.token_id = await tokenMintERC1155.getTokenCounter();
        });

        it("user2, user3, user4 make offer token3", async () => {
            // User2 make offer
            INFO.user2 = {
                ...INFO.user2,
                payment_token: token.address,
                bid_price: parseEther("1"),
                end_time: (await getCurrentTime()) + ONE_WEEK * 2,
            };
            await BT.expect(() =>
                orderManager
                    .connect(user2)
                    .makeWalletOrder(
                        INFO.user2.payment_token,
                        INFO.user2.bid_price,
                        INFO.user1.address,
                        INFO.user1.nft_address,
                        INFO.user1.token_id,
                        INFO.user1.amount,
                        INFO.user2.end_time
                    )
            ).changeTokenBalance(token, user2, INFO.user2.bid_price.mul(-1));
            INFO.user2.order_id = 20;

            // User3 make offer
            INFO.user3 = {
                ...INFO.user3,
                payment_token: token.address,
                bid_price: parseEther("1.5"),
                end_time: (await getCurrentTime()) + ONE_WEEK * 2,
            };
            await BT.expect(() =>
                orderManager
                    .connect(user3)
                    .makeWalletOrder(
                        INFO.user3.payment_token,
                        INFO.user3.bid_price,
                        INFO.user1.address,
                        INFO.user1.nft_address,
                        INFO.user1.token_id,
                        INFO.user1.amount,
                        INFO.user3.end_time
                    )
            ).changeTokenBalance(token, user3, INFO.user3.bid_price.mul(-1));
            INFO.user3.order_id = 21;

            // User4 make offer
            INFO.user4 = {
                ...INFO.user4,
                payment_token: token.address,
                bid_price: parseEther("1.7"),
                end_time: (await getCurrentTime()) + ONE_WEEK,
            };
            await BT.expect(() =>
                orderManager
                    .connect(user4)
                    .makeWalletOrder(
                        INFO.user4.payment_token,
                        INFO.user4.bid_price,
                        INFO.user1.address,
                        INFO.user1.nft_address,
                        INFO.user1.token_id,
                        INFO.user1.amount,
                        INFO.user4.end_time
                    )
            ).changeTokenBalance(token, user4, INFO.user4.bid_price.mul(-1));
            INFO.user4.order_id = 22;
        });

        it("user1 create sell (user1 can't accept previous offers)", async () => {
            INFO.user1 = {
                ...INFO.user1,
                sell_payment_token: token.address,
                sell_price: parseEther("3"),
                sell_start_time: (await getCurrentTime()) + 10,
                sell_end_time: (await getCurrentTime()) + ONE_WEEK,
                sell_merkle_tree: generateMerkleTree([user2.address, user3.address]),
            };

            await BT.updateFee(tokenMintERC1155.connect(user1).setApprovalForAll(mkpManager.address, true));
            await BT.updateFee(
                orderManager
                    .connect(user1)
                    .sell(
                        INFO.user1.nft_address,
                        INFO.user1.token_id,
                        INFO.user1.amount,
                        INFO.user1.sell_price,
                        INFO.user1.sell_start_time,
                        INFO.user1.sell_end_time,
                        INFO.user1.sell_payment_token,
                        INFO.user1.sell_merkle_tree.getHexRoot()
                    )
            );
            INFO.user1.sell_market_item_id = await mkpManager.getCurrentMarketItem();

            await BT.expect(orderManager.connect(user1).acceptWalletOrder(INFO.user2.order_id)).to.revertedWith(
                "ERC1155: insufficient balance for transfer"
            );
        });

        it("waiting until MarketItem is expired => user1 cancel MarketItem", async () => {
            await skipTime(INFO.user1.sell_end_time - (await getCurrentTime()));
            await BT.updateFee(orderManager.connect(user1).cancelSell(INFO.user1.sell_market_item_id));
        });

        it("user1 accept user2 offer", async () => {
            await BT.updateFee(tokenMintERC1155.connect(user1).setApprovalForAll(orderManager.address, true));
            await BT.expect(() =>
                orderManager.connect(user1).acceptWalletOrder(INFO.user2.order_id)
            ).changeTokenBalance(
                token,
                user1,
                INFO.user2.bid_price
                    .mul(975)
                    .div(1000)
                    .mul(975)
                    .div(1000)
            );
        });

        it("Check balance after flowNFT1155_", async () => {
            flowNFT1155_3 = "flowNFT1155_3";

            await orderManagerBT.takeSnapshot(flowNFT1155_3);
            await user1BT.takeSnapshot(flowNFT1155_3);
            await user2BT.takeSnapshot(flowNFT1155_3);
            await user3BT.takeSnapshot(flowNFT1155_3);
            await user4BT.takeSnapshot(flowNFT1155_3);
            await treasuryBT.takeSnapshot(flowNFT1155_3);

            const orderManagerDiff = orderManagerBT.diff(flowNFT1155_2, flowNFT1155_3);
            const user1Diff = user1BT.diff(flowNFT1155_2, flowNFT1155_3);
            const user2Diff = user2BT.diff(flowNFT1155_2, flowNFT1155_3);
            const user3Diff = user3BT.diff(flowNFT1155_2, flowNFT1155_3);
            const user4Diff = user4BT.diff(flowBegin, flowNFT1155_3);
            const treasuryDiff = treasuryBT.diff(flowNFT1155_2, flowNFT1155_3);

            expect(orderManagerDiff[ADDRESS_ZERO].delta.mul(-1)).to.equal(orderManagerBT.totalFee);
            expect(user1Diff[ADDRESS_ZERO].delta.mul(-1)).to.equal(user1BT.totalFee);
            expect(user2Diff[ADDRESS_ZERO].delta.mul(-1)).to.equal(user2BT.totalFee);
            expect(user3Diff[ADDRESS_ZERO].delta.mul(-1)).to.equal(user3BT.totalFee);
            expect(user4Diff[ADDRESS_ZERO].delta.mul(-1)).to.equal(user4BT.totalFee);
            expect(treasuryDiff[ADDRESS_ZERO].delta.mul(-1)).to.equal(treasuryBT.totalFee);

            expect(orderManagerDiff[token.address].delta).to.equal(
                INFO.user3.bid_price.add(INFO.user4.bid_price).add(INFO.user2.bid_price.mul(25).div(1000))
            );
            expect(user1Diff[token.address].delta).to.equal(
                INFO.user2.bid_price
                    .mul(975)
                    .div(1000)
                    .mul(975)
                    .div(1000)
            );
            expect(user2Diff[token.address].delta).to.equal(INFO.user2.bid_price.mul(-1));
            expect(user3Diff[token.address].delta).to.equal(INFO.user3.bid_price.mul(-1));
            expect(user4Diff[token.address].delta).to.equal(INFO.user4.bid_price.mul(-1));
            expect(treasuryDiff[token.address].delta).to.equal(
                INFO.user2.bid_price
                    .mul(975)
                    .div(1000)
                    .mul(25)
                    .div(1000)
            );
        });
    });

    describe("User1 mint token4(NFT1155 - Public) -> user2, user3 make offer token4 -> user1 create sell (user1 can't accept previous offers) => user4 make offer on sell => user1 accept user2(fail), user3(fail), user4(ok)", () => {
        before(async () => {
            ownerBT.resetTotalFee();
            user1BT.resetTotalFee();
            user2BT.resetTotalFee();
            user3BT.resetTotalFee();
            user4BT.resetTotalFee();
            user5BT.resetTotalFee();
            user6BT.resetTotalFee();
        });

        it("User1 mint token4(NFT1155)", async () => {
            INFO.user1 = {
                ...INFO.user1,
                payment_token: token.address,
                nft_address: tokenMintERC1155.address,
                amount: 10,
                token_uri: "token4_uri",
            };
            await BT.updateFee(
                tokenMintERC1155.connect(owner).mint(INFO.user1.address, INFO.user1.amount, INFO.user1.token_uri)
            );
            INFO.user1.token_id = await tokenMintERC1155.getTokenCounter();
        });

        it("user2, user3 make offer token4", async () => {
            // User2 make offer
            INFO.user2 = {
                ...INFO.user2,
                payment_token: token.address,
                bid_price: parseEther("1"),
                end_time: (await getCurrentTime()) + ONE_WEEK * 2,
            };
            await BT.expect(() =>
                orderManager
                    .connect(user2)
                    .makeWalletOrder(
                        INFO.user2.payment_token,
                        INFO.user2.bid_price,
                        INFO.user1.address,
                        INFO.user1.nft_address,
                        INFO.user1.token_id,
                        INFO.user1.amount,
                        INFO.user2.end_time
                    )
            ).changeTokenBalance(token, user2, INFO.user2.bid_price.mul(-1));
            INFO.user2.order_id = 23;

            // User3 make offer
            INFO.user3 = {
                ...INFO.user3,
                payment_token: token.address,
                bid_price: parseEther("1.5"),
                end_time: (await getCurrentTime()) + ONE_WEEK * 2,
            };
            await BT.expect(() =>
                orderManager
                    .connect(user3)
                    .makeWalletOrder(
                        INFO.user3.payment_token,
                        INFO.user3.bid_price,
                        INFO.user1.address,
                        INFO.user1.nft_address,
                        INFO.user1.token_id,
                        INFO.user1.amount,
                        INFO.user3.end_time
                    )
            ).changeTokenBalance(token, user3, INFO.user3.bid_price.mul(-1));
            INFO.user3.order_id = 24;
        });

        it("user1 create sell (user1 can't accept previous offers)", async () => {
            INFO.user1 = {
                ...INFO.user1,
                sell_payment_token: token.address,
                sell_price: parseEther("3"),
                sell_start_time: (await getCurrentTime()) + 10,
                sell_end_time: (await getCurrentTime()) + ONE_WEEK,
            };

            await BT.updateFee(
                orderManager
                    .connect(user1)
                    .sell(
                        INFO.user1.nft_address,
                        INFO.user1.token_id,
                        INFO.user1.amount,
                        INFO.user1.sell_price,
                        INFO.user1.sell_start_time,
                        INFO.user1.sell_end_time,
                        INFO.user1.sell_payment_token,
                        []
                    )
            );
            INFO.user1.sell_market_item_id = await mkpManager.getCurrentMarketItem();

            await BT.expect(orderManager.connect(user1).acceptWalletOrder(INFO.user2.order_id)).to.revertedWith(
                "ERC1155: insufficient balance for transfer"
            );
        });

        it("user4 make offer on sell", async () => {
            INFO.user4.bid_price = parseEther("1.5");
            INFO.user4.endTime = (await getCurrentTime()) + ONE_WEEK;
            await BT.expect(
                orderManager
                    .connect(user4)
                    .makeMarketItemOrder(
                        INFO.user1.sell_market_item_id,
                        INFO.user1.sell_payment_token,
                        INFO.user4.bid_price,
                        INFO.user4.endTime,
                        []
                    )
            ).to.revertedWith("Not the order time");

            await skipTime(10);
            await BT.expect(() =>
                orderManager
                    .connect(user4)
                    .makeMarketItemOrder(
                        INFO.user1.sell_market_item_id,
                        INFO.user1.sell_payment_token,
                        INFO.user4.bid_price,
                        INFO.user4.endTime,
                        []
                    )
            ).changeTokenBalance(token, user4, INFO.user4.bid_price.mul(-1));
            INFO.user4.market_item_order_id = 8;
        });

        it("user1 accept user2(fail), user3(fail), user4(ok)", async () => {
            await BT.expect(orderManager.connect(user1).acceptWalletOrder(INFO.user2.order_id)).to.revertedWith(
                "ERC1155: insufficient balance for transfer"
            );
            await BT.expect(orderManager.connect(user1).acceptWalletOrder(INFO.user3.order_id)).to.revertedWith(
                "ERC1155: insufficient balance for transfer"
            );
            await BT.expect(() =>
                orderManager.connect(user1).acceptMarketItemOrder(INFO.user4.market_item_order_id)
            ).changeTokenBalance(
                token,
                user1,
                INFO.user4.bid_price
                    .mul(975)
                    .div(1000)
                    .mul(975)
                    .div(1000)
            );
        });

        it("Check balance after flowNFT1155_", async () => {
            flowNFT1155_4 = "flowNFT1155_4";

            await orderManagerBT.takeSnapshot(flowNFT1155_4);
            await user1BT.takeSnapshot(flowNFT1155_4);
            await user2BT.takeSnapshot(flowNFT1155_4);
            await user3BT.takeSnapshot(flowNFT1155_4);
            await user4BT.takeSnapshot(flowNFT1155_4);
            await treasuryBT.takeSnapshot(flowNFT1155_4);

            const orderManagerDiff = orderManagerBT.diff(flowNFT1155_3, flowNFT1155_4);
            const user1Diff = user1BT.diff(flowNFT1155_3, flowNFT1155_4);
            const user2Diff = user2BT.diff(flowNFT1155_3, flowNFT1155_4);
            const user3Diff = user3BT.diff(flowNFT1155_3, flowNFT1155_4);
            const user4Diff = user4BT.diff(flowNFT1155_3, flowNFT1155_4);
            const treasuryDiff = treasuryBT.diff(flowNFT1155_3, flowNFT1155_4);

            expect(orderManagerDiff[ADDRESS_ZERO].delta.mul(-1)).to.equal(orderManagerBT.totalFee);
            expect(user1Diff[ADDRESS_ZERO].delta.mul(-1)).to.equal(user1BT.totalFee);
            expect(user2Diff[ADDRESS_ZERO].delta.mul(-1)).to.equal(user2BT.totalFee);
            expect(user3Diff[ADDRESS_ZERO].delta.mul(-1)).to.equal(user3BT.totalFee);
            expect(user4Diff[ADDRESS_ZERO].delta.mul(-1)).to.equal(user4BT.totalFee);
            expect(treasuryDiff[ADDRESS_ZERO].delta.mul(-1)).to.equal(treasuryBT.totalFee);

            expect(orderManagerDiff[token.address].delta).to.equal(
                INFO.user3.bid_price.add(INFO.user2.bid_price).add(INFO.user4.bid_price.mul(25).div(1000))
            );
            expect(user1Diff[token.address].delta).to.equal(
                INFO.user4.bid_price
                    .mul(975)
                    .div(1000)
                    .mul(975)
                    .div(1000)
            );
            expect(user2Diff[token.address].delta).to.equal(INFO.user2.bid_price.mul(-1));
            expect(user3Diff[token.address].delta).to.equal(INFO.user3.bid_price.mul(-1));
            expect(user4Diff[token.address].delta).to.equal(INFO.user4.bid_price.mul(-1));
            expect(treasuryDiff[token.address].delta).to.equal(
                INFO.user4.bid_price
                    .mul(975)
                    .div(1000)
                    .mul(25)
                    .div(1000)
            );
        });
    });

    describe("User1 mint token5(NFT1155 - Public) -> user1 create sell -> No one offer => sell is expired", () => {
        before(async () => {
            ownerBT.resetTotalFee();
            user1BT.resetTotalFee();
            user2BT.resetTotalFee();
            user3BT.resetTotalFee();
            user4BT.resetTotalFee();
            user5BT.resetTotalFee();
            user6BT.resetTotalFee();
        });

        it("User1 mint token5(NFT1155)", async () => {
            INFO.user1 = {
                ...INFO.user1,
                payment_token: token.address,
                nft_address: tokenMintERC1155.address,
                amount: 10,
                token_uri: "token5_uri",
            };
            await BT.updateFee(
                tokenMintERC1155.connect(owner).mint(INFO.user1.address, INFO.user1.amount, INFO.user1.token_uri)
            );
            INFO.user1.token_id = await tokenMintERC1155.getTokenCounter();
        });

        it("user1 create sell", async () => {
            INFO.user1 = {
                ...INFO.user1,
                sell_payment_token: token.address,
                sell_price: parseEther("3"),
                sell_start_time: (await getCurrentTime()) + 10,
                sell_end_time: (await getCurrentTime()) + ONE_WEEK,
                sell_merkle_tree: generateMerkleTree([user2.address, user3.address]),
            };

            await BT.updateFee(
                orderManager
                    .connect(user1)
                    .sell(
                        INFO.user1.nft_address,
                        INFO.user1.token_id,
                        INFO.user1.amount,
                        INFO.user1.sell_price,
                        INFO.user1.sell_start_time,
                        INFO.user1.sell_end_time,
                        INFO.user1.sell_payment_token,
                        INFO.user1.sell_merkle_tree.getHexRoot()
                    )
            );
            INFO.user1.sell_market_item_id = await mkpManager.getCurrentMarketItem();
        });

        it("No one offer => sell is expired", async () => {
            await skipTime(INFO.user1.sell_end_time - INFO.user1.sell_start_time + 10);

            await BT.expect(
                orderManager
                    .connect(user4)
                    .makeMarketItemOrder(
                        INFO.user1.sell_market_item_id,
                        INFO.user1.sell_payment_token,
                        parseEther("1"),
                        (await getCurrentTime()) + ONE_WEEK,
                        []
                    )
            ).to.revertedWith("Not the order time");
        });

        it("Check balance after flowNFT1155_", async () => {
            flowNFT1155_5 = "flowNFT1155_5";

            await orderManagerBT.takeSnapshot(flowNFT1155_5);
            await user1BT.takeSnapshot(flowNFT1155_5);
            await user2BT.takeSnapshot(flowNFT1155_5);
            await user3BT.takeSnapshot(flowNFT1155_5);
            await user4BT.takeSnapshot(flowNFT1155_5);
            await treasuryBT.takeSnapshot(flowNFT1155_5);

            const orderManagerDiff = orderManagerBT.diff(flowNFT1155_4, flowNFT1155_5);
            const user1Diff = user1BT.diff(flowNFT1155_4, flowNFT1155_5);
            const user2Diff = user2BT.diff(flowNFT1155_4, flowNFT1155_5);
            const user3Diff = user3BT.diff(flowNFT1155_4, flowNFT1155_5);
            const user4Diff = user4BT.diff(flowNFT1155_4, flowNFT1155_5);
            const treasuryDiff = treasuryBT.diff(flowNFT1155_4, flowNFT1155_5);

            expect(orderManagerDiff[ADDRESS_ZERO].delta.mul(-1)).to.equal(orderManagerBT.totalFee);
            expect(user1Diff[ADDRESS_ZERO].delta.mul(-1)).to.equal(user1BT.totalFee);
            expect(user2Diff[ADDRESS_ZERO].delta.mul(-1)).to.equal(user2BT.totalFee);
            expect(user3Diff[ADDRESS_ZERO].delta.mul(-1)).to.equal(user3BT.totalFee);
            expect(user4Diff[ADDRESS_ZERO].delta.mul(-1)).to.equal(user4BT.totalFee);
            expect(treasuryDiff[ADDRESS_ZERO].delta.mul(-1)).to.equal(treasuryBT.totalFee);

            expect(orderManagerDiff[token.address].delta).to.equal(0);
            expect(user1Diff[token.address].delta).to.equal(0);
            expect(user2Diff[token.address].delta).to.equal(0);
            expect(user3Diff[token.address].delta).to.equal(0);
            expect(user4Diff[token.address].delta).to.equal(0);
            expect(treasuryDiff[token.address].delta).to.equal(0);
        });
    });

    describe("User1 mint token6(NFT1155 - Private) -> user2, user3, user4 make offers -> user2 cancel offer -> user1 create sell -> user5, user6(not in white list) make offer on sell -> user 1 accept user5's offer", () => {
        before(async () => {
            ownerBT.resetTotalFee();
            user1BT.resetTotalFee();
            user2BT.resetTotalFee();
            user3BT.resetTotalFee();
            user4BT.resetTotalFee();
            user5BT.resetTotalFee();
            user6BT.resetTotalFee();
        });

        it("User1 mint token6(NFT1155)", async () => {
            INFO.user1 = {
                ...INFO.user1,
                payment_token: token.address,
                nft_address: tokenMintERC1155.address,
                amount: 10,
                token_uri: "token6_uri",
            };
            await BT.updateFee(
                tokenMintERC1155.connect(owner).mint(INFO.user1.address, INFO.user1.amount, INFO.user1.token_uri)
            );
            INFO.user1.token_id = await tokenMintERC1155.getTokenCounter();
        });

        it("user2, user3, user4 make offer token6", async () => {
            // User2 make offer
            INFO.user2 = {
                ...INFO.user2,
                payment_token: token.address,
                bid_price: parseEther("1"),
                end_time: (await getCurrentTime()) + ONE_WEEK * 2,
            };
            await BT.expect(() =>
                orderManager
                    .connect(user2)
                    .makeWalletOrder(
                        INFO.user2.payment_token,
                        INFO.user2.bid_price,
                        INFO.user1.address,
                        INFO.user1.nft_address,
                        INFO.user1.token_id,
                        INFO.user1.amount,
                        INFO.user2.end_time
                    )
            ).changeTokenBalance(token, user2, INFO.user2.bid_price.mul(-1));
            INFO.user2.order_id = 25;

            // User3 make offer
            INFO.user3 = {
                ...INFO.user3,
                payment_token: token.address,
                bid_price: parseEther("1.5"),
                end_time: (await getCurrentTime()) + ONE_WEEK * 2,
            };
            await BT.expect(() =>
                orderManager
                    .connect(user3)
                    .makeWalletOrder(
                        INFO.user3.payment_token,
                        INFO.user3.bid_price,
                        INFO.user1.address,
                        INFO.user1.nft_address,
                        INFO.user1.token_id,
                        INFO.user1.amount,
                        INFO.user3.end_time
                    )
            ).changeTokenBalance(token, user3, INFO.user3.bid_price.mul(-1));
            INFO.user3.order_id = 26;

            // User4 make offer
            INFO.user4 = {
                ...INFO.user4,
                payment_token: token.address,
                bid_price: parseEther("1.7"),
                end_time: (await getCurrentTime()) + ONE_WEEK,
            };
            await BT.expect(() =>
                orderManager
                    .connect(user4)
                    .makeWalletOrder(
                        INFO.user4.payment_token,
                        INFO.user4.bid_price,
                        INFO.user1.address,
                        INFO.user1.nft_address,
                        INFO.user1.token_id,
                        INFO.user1.amount,
                        INFO.user4.end_time
                    )
            ).changeTokenBalance(token, user4, INFO.user4.bid_price.mul(-1));
            INFO.user4.order_id = 27;
        });

        it("user 2 cancel offer", async () => {
            await BT.expect(() =>
                orderManager.connect(user2).cancelWalletOrder(INFO.user2.order_id)
            ).changeTokenBalance(token, user2, INFO.user2.bid_price);
        });

        it("user1 create sell", async () => {
            INFO.user1 = {
                ...INFO.user1,
                sell_payment_token: token.address,
                sell_price: parseEther("3"),
                sell_start_time: (await getCurrentTime()) + 10,
                sell_end_time: (await getCurrentTime()) + ONE_WEEK,
                sell_merkle_tree: generateMerkleTree([user5.address]),
            };

            await BT.updateFee(
                orderManager
                    .connect(user1)
                    .sell(
                        INFO.user1.nft_address,
                        INFO.user1.token_id,
                        INFO.user1.amount,
                        INFO.user1.sell_price,
                        INFO.user1.sell_start_time,
                        INFO.user1.sell_end_time,
                        INFO.user1.sell_payment_token,
                        INFO.user1.sell_merkle_tree.getHexRoot()
                    )
            );
            INFO.user1.sell_market_item_id = await mkpManager.getCurrentMarketItem();
        });

        it("user 5, user 6 make offer on sell", async () => {
            // User5 make offer
            INFO.user5 = {
                ...INFO.user5,
                payment_token: token.address,
                bid_price: parseEther("1"),
                end_time: (await getCurrentTime()) + ONE_WEEK * 2,
            };
            await BT.expect(
                orderManager
                    .connect(user5)
                    .makeMarketItemOrder(
                        INFO.user1.sell_market_item_id,
                        INFO.user5.payment_token,
                        INFO.user5.bid_price,
                        INFO.user5.end_time,
                        INFO.user1.sell_merkle_tree.getHexProof(generateLeaf(user5.address))
                    )
            ).to.revertedWith("Not the order time");

            await skipTime(10);
            await BT.expect(() =>
                orderManager
                    .connect(user5)
                    .makeMarketItemOrder(
                        INFO.user1.sell_market_item_id,
                        INFO.user5.payment_token,
                        INFO.user5.bid_price,
                        INFO.user5.end_time,
                        INFO.user1.sell_merkle_tree.getHexProof(generateLeaf(user5.address))
                    )
            ).changeTokenBalance(token, user5, INFO.user5.bid_price.mul(-1));
            INFO.user5.market_item_order_id = 9;

            // User5 make offer
            INFO.user6 = {
                ...INFO.user6,
                payment_token: token.address,
                bid_price: parseEther("1"),
                end_time: (await getCurrentTime()) + ONE_WEEK * 2,
            };
            await BT.expect(
                orderManager
                    .connect(user6)
                    .makeMarketItemOrder(
                        INFO.user1.sell_market_item_id,
                        INFO.user6.payment_token,
                        INFO.user6.bid_price,
                        INFO.user6.end_time,
                        INFO.user1.sell_merkle_tree.getHexProof(generateLeaf(user6.address))
                    )
            ).to.revertedWith("Require own MetaCitizen NFT");
        });

        it("user 1 accept user5's offer", async () => {
            await BT.expect(() =>
                orderManager.connect(user1).acceptMarketItemOrder(INFO.user5.market_item_order_id)
            ).changeTokenBalance(
                token,
                user1,
                INFO.user5.bid_price
                    .mul(975)
                    .div(1000)
                    .mul(975)
                    .div(1000)
            );
        });

        it("Check balance after flowNFT1155_", async () => {
            flowNFT1155_6 = "flowNFT1155_6";

            await orderManagerBT.takeSnapshot(flowNFT1155_6);
            await user1BT.takeSnapshot(flowNFT1155_6);
            await user2BT.takeSnapshot(flowNFT1155_6);
            await user3BT.takeSnapshot(flowNFT1155_6);
            await user4BT.takeSnapshot(flowNFT1155_6);
            await user5BT.takeSnapshot(flowNFT1155_6);
            await user6BT.takeSnapshot(flowNFT1155_6);
            await treasuryBT.takeSnapshot(flowNFT1155_6);

            const orderManagerDiff = orderManagerBT.diff(flowNFT1155_5, flowNFT1155_6);
            const user1Diff = user1BT.diff(flowNFT1155_5, flowNFT1155_6);
            const user2Diff = user2BT.diff(flowNFT1155_5, flowNFT1155_6);
            const user3Diff = user3BT.diff(flowNFT1155_5, flowNFT1155_6);
            const user4Diff = user4BT.diff(flowNFT1155_5, flowNFT1155_6);
            const user5Diff = user5BT.diff(flowBegin, flowNFT1155_6);
            const user6Diff = user6BT.diff(flowBegin, flowNFT1155_6);
            const treasuryDiff = treasuryBT.diff(flowNFT1155_5, flowNFT1155_6);

            expect(orderManagerDiff[ADDRESS_ZERO].delta.mul(-1)).to.equal(orderManagerBT.totalFee);
            expect(user1Diff[ADDRESS_ZERO].delta.mul(-1)).to.equal(user1BT.totalFee);
            expect(user2Diff[ADDRESS_ZERO].delta.mul(-1)).to.equal(user2BT.totalFee);
            expect(user3Diff[ADDRESS_ZERO].delta.mul(-1)).to.equal(user3BT.totalFee);
            expect(user4Diff[ADDRESS_ZERO].delta.mul(-1)).to.equal(user4BT.totalFee);
            expect(user5Diff[ADDRESS_ZERO].delta.mul(-1)).to.equal(user5BT.totalFee);
            expect(user6Diff[ADDRESS_ZERO].delta.mul(-1)).to.equal(user6BT.totalFee);
            expect(treasuryDiff[ADDRESS_ZERO].delta.mul(-1)).to.equal(treasuryBT.totalFee);

            expect(orderManagerDiff[token.address].delta).to.equal(
                INFO.user3.bid_price.add(INFO.user4.bid_price).add(INFO.user5.bid_price.mul(25).div(1000))
            );
            expect(user1Diff[token.address].delta).to.equal(
                INFO.user5.bid_price
                    .mul(975)
                    .div(1000)
                    .mul(975)
                    .div(1000)
            );
            expect(user2Diff[token.address].delta).to.equal(0);
            expect(user3Diff[token.address].delta).to.equal(INFO.user3.bid_price.mul(-1));
            expect(user4Diff[token.address].delta).to.equal(INFO.user4.bid_price.mul(-1));
            expect(user5Diff[token.address].delta).to.equal(INFO.user5.bid_price.mul(-1));
            expect(user6Diff[token.address].delta).to.equal(0);
            expect(treasuryDiff[token.address].delta).to.equal(
                INFO.user5.bid_price
                    .mul(975)
                    .div(1000)
                    .mul(25)
                    .div(1000)
            );
        });
    });

    describe("User1 mint token7(NFT1155 - Public) -> user2, user3, user4 make offers -> user1 create sell -> user 5, user 6 make offers on sell -> user1 cancel sell -> user 1 accept user2's offer", () => {
        before(async () => {
            ownerBT.resetTotalFee();
            user1BT.resetTotalFee();
            user2BT.resetTotalFee();
            user3BT.resetTotalFee();
            user4BT.resetTotalFee();
            user5BT.resetTotalFee();
            user6BT.resetTotalFee();
        });

        it("User1 mint token7(NFT1155)", async () => {
            INFO.user1 = {
                ...INFO.user1,
                payment_token: token.address,
                nft_address: tokenMintERC1155.address,
                amount: 10,
                token_uri: "token7_uri",
            };
            await BT.updateFee(
                tokenMintERC1155.connect(owner).mint(INFO.user1.address, INFO.user1.amount, INFO.user1.token_uri)
            );
            INFO.user1.token_id = await tokenMintERC1155.getTokenCounter();
        });

        it("user2, user3, user4 make offer token7", async () => {
            // User2 make offer
            INFO.user2 = {
                ...INFO.user2,
                payment_token: token.address,
                bid_price: parseEther("1"),
                end_time: (await getCurrentTime()) + ONE_WEEK * 2,
            };
            await BT.expect(() =>
                orderManager
                    .connect(user2)
                    .makeWalletOrder(
                        INFO.user2.payment_token,
                        INFO.user2.bid_price,
                        INFO.user1.address,
                        INFO.user1.nft_address,
                        INFO.user1.token_id,
                        INFO.user1.amount,
                        INFO.user2.end_time
                    )
            ).changeTokenBalance(token, user2, INFO.user2.bid_price.mul(-1));
            INFO.user2.order_id = 28;

            // User3 make offer
            INFO.user3 = {
                ...INFO.user3,
                payment_token: token.address,
                bid_price: parseEther("1.5"),
                end_time: (await getCurrentTime()) + ONE_WEEK * 2,
            };
            await BT.expect(() =>
                orderManager
                    .connect(user3)
                    .makeWalletOrder(
                        INFO.user3.payment_token,
                        INFO.user3.bid_price,
                        INFO.user1.address,
                        INFO.user1.nft_address,
                        INFO.user1.token_id,
                        INFO.user1.amount,
                        INFO.user3.end_time
                    )
            ).changeTokenBalance(token, user3, INFO.user3.bid_price.mul(-1));
            INFO.user3.order_id = 29;

            // User4 make offer
            INFO.user4 = {
                ...INFO.user4,
                payment_token: token.address,
                bid_price: parseEther("1.7"),
                end_time: (await getCurrentTime()) + ONE_WEEK,
            };
            await BT.expect(() =>
                orderManager
                    .connect(user4)
                    .makeWalletOrder(
                        INFO.user4.payment_token,
                        INFO.user4.bid_price,
                        INFO.user1.address,
                        INFO.user1.nft_address,
                        INFO.user1.token_id,
                        INFO.user1.amount,
                        INFO.user4.end_time
                    )
            ).changeTokenBalance(token, user4, INFO.user4.bid_price.mul(-1));
            INFO.user4.order_id = 30;
        });

        it("user1 create sell", async () => {
            INFO.user1 = {
                ...INFO.user1,
                sell_payment_token: token.address,
                sell_price: parseEther("3"),
                sell_start_time: (await getCurrentTime()) + 10,
                sell_end_time: (await getCurrentTime()) + ONE_WEEK,
            };

            await BT.updateFee(
                orderManager
                    .connect(user1)
                    .sell(
                        INFO.user1.nft_address,
                        INFO.user1.token_id,
                        INFO.user1.amount,
                        INFO.user1.sell_price,
                        INFO.user1.sell_start_time,
                        INFO.user1.sell_end_time,
                        INFO.user1.sell_payment_token,
                        []
                    )
            );
            INFO.user1.sell_market_item_id = await mkpManager.getCurrentMarketItem();
        });

        it("user 5, user 6 make offers on sell", async () => {
            INFO.user5.bid_price = parseEther("1.5");
            INFO.user5.end_time = (await getCurrentTime()) + ONE_WEEK;
            await BT.expect(
                orderManager
                    .connect(user5)
                    .makeMarketItemOrder(
                        INFO.user1.sell_market_item_id,
                        INFO.user1.sell_payment_token,
                        INFO.user5.bid_price,
                        INFO.user5.end_time,
                        []
                    )
            ).to.revertedWith("Not the order time");

            await skipTime(10);
            await BT.expect(() =>
                orderManager
                    .connect(user5)
                    .makeMarketItemOrder(
                        INFO.user1.sell_market_item_id,
                        INFO.user1.sell_payment_token,
                        INFO.user5.bid_price,
                        INFO.user5.end_time,
                        []
                    )
            ).changeTokenBalance(token, user5, INFO.user5.bid_price.mul(-1));
            INFO.user5.market_item_order_id = 10;

            // User 6 make order
            INFO.user6.bid_price = parseEther("1.5");
            INFO.user6.end_time = (await getCurrentTime()) + ONE_WEEK;
            await BT.expect(() =>
                orderManager
                    .connect(user6)
                    .makeMarketItemOrder(
                        INFO.user1.sell_market_item_id,
                        INFO.user1.sell_payment_token,
                        INFO.user6.bid_price,
                        INFO.user6.end_time,
                        []
                    )
            ).changeTokenBalance(token, user6, INFO.user6.bid_price.mul(-1));
            INFO.user6.market_item_order_id = 11;
        });

        it("user1 cancel sell", async () => {
            await BT.updateFee(orderManager.connect(user1).cancelSell(INFO.user1.sell_market_item_id));
        });

        it("user 1 accept user2's offer", async () => {
            await BT.updateFee(tokenMintERC1155.connect(user1).setApprovalForAll(orderManager.address, true));
            await BT.expect(() =>
                orderManager.connect(user1).acceptWalletOrder(INFO.user2.order_id)
            ).changeTokenBalance(
                token,
                user1,
                INFO.user2.bid_price
                    .mul(975)
                    .div(1000)
                    .mul(975)
                    .div(1000)
            );
        });

        it("Check balance after flowNFT1155_", async () => {
            flowNFT1155_7 = "flowNFT1155_7";

            await orderManagerBT.takeSnapshot(flowNFT1155_7);
            await user1BT.takeSnapshot(flowNFT1155_7);
            await user2BT.takeSnapshot(flowNFT1155_7);
            await user3BT.takeSnapshot(flowNFT1155_7);
            await user4BT.takeSnapshot(flowNFT1155_7);
            await user5BT.takeSnapshot(flowNFT1155_7);
            await user6BT.takeSnapshot(flowNFT1155_7);
            await treasuryBT.takeSnapshot(flowNFT1155_7);

            const orderManagerDiff = orderManagerBT.diff(flowNFT1155_6, flowNFT1155_7);
            const user1Diff = user1BT.diff(flowNFT1155_6, flowNFT1155_7);
            const user2Diff = user2BT.diff(flowNFT1155_6, flowNFT1155_7);
            const user3Diff = user3BT.diff(flowNFT1155_6, flowNFT1155_7);
            const user4Diff = user4BT.diff(flowNFT1155_6, flowNFT1155_7);
            const user5Diff = user5BT.diff(flowNFT1155_6, flowNFT1155_7);
            const user6Diff = user6BT.diff(flowNFT1155_6, flowNFT1155_7);
            const treasuryDiff = treasuryBT.diff(flowNFT1155_6, flowNFT1155_7);

            expect(orderManagerDiff[ADDRESS_ZERO].delta.mul(-1)).to.equal(orderManagerBT.totalFee);
            expect(user1Diff[ADDRESS_ZERO].delta.mul(-1)).to.equal(user1BT.totalFee);
            expect(user2Diff[ADDRESS_ZERO].delta.mul(-1)).to.equal(user2BT.totalFee);
            expect(user3Diff[ADDRESS_ZERO].delta.mul(-1)).to.equal(user3BT.totalFee);
            expect(user4Diff[ADDRESS_ZERO].delta.mul(-1)).to.equal(user4BT.totalFee);
            expect(user5Diff[ADDRESS_ZERO].delta.mul(-1)).to.equal(user5BT.totalFee);
            expect(user6Diff[ADDRESS_ZERO].delta.mul(-1)).to.equal(user6BT.totalFee);
            expect(treasuryDiff[ADDRESS_ZERO].delta.mul(-1)).to.equal(treasuryBT.totalFee);

            expect(orderManagerDiff[token.address].delta).to.equal(
                INFO.user3.bid_price
                    .add(INFO.user4.bid_price)
                    .add(INFO.user5.bid_price)
                    .add(INFO.user6.bid_price)
                    .add(INFO.user2.bid_price.mul(25).div(1000))
            );
            expect(user1Diff[token.address].delta).to.equal(
                INFO.user2.bid_price
                    .mul(975)
                    .div(1000)
                    .mul(975)
                    .div(1000)
            );
            expect(user2Diff[token.address].delta).to.equal(INFO.user2.bid_price.mul(-1));
            expect(user3Diff[token.address].delta).to.equal(INFO.user3.bid_price.mul(-1));
            expect(user4Diff[token.address].delta).to.equal(INFO.user4.bid_price.mul(-1));
            expect(user5Diff[token.address].delta).to.equal(INFO.user5.bid_price.mul(-1));
            expect(user6Diff[token.address].delta).to.equal(INFO.user6.bid_price.mul(-1));
            expect(treasuryDiff[token.address].delta).to.equal(
                INFO.user2.bid_price
                    .mul(975)
                    .div(1000)
                    .mul(25)
                    .div(1000)
            );
        });
    });

    describe("User1 mint token8(NFT1155 - Public) -> user1 create sell -> user2, user3, user4 make offers on sell -> all cancel offers", () => {
        before(async () => {
            ownerBT.resetTotalFee();
            user1BT.resetTotalFee();
            user2BT.resetTotalFee();
            user3BT.resetTotalFee();
            user4BT.resetTotalFee();
            user5BT.resetTotalFee();
            user6BT.resetTotalFee();
        });

        it("User1 mint token8(NFT1155)", async () => {
            INFO.user1 = {
                ...INFO.user1,
                payment_token: token.address,
                nft_address: tokenMintERC1155.address,
                amount: 10,
                token_uri: "token8_uri",
            };
            await BT.updateFee(
                tokenMintERC1155.connect(owner).mint(INFO.user1.address, INFO.user1.amount, INFO.user1.token_uri)
            );
            INFO.user1.token_id = await tokenMintERC1155.getTokenCounter();
        });

        it("user1 create sell", async () => {
            INFO.user1 = {
                ...INFO.user1,
                sell_payment_token: token.address,
                sell_price: parseEther("3"),
                sell_start_time: (await getCurrentTime()) + 10,
                sell_end_time: (await getCurrentTime()) + ONE_WEEK,
            };

            await BT.updateFee(
                orderManager
                    .connect(user1)
                    .sell(
                        INFO.user1.nft_address,
                        INFO.user1.token_id,
                        INFO.user1.amount,
                        INFO.user1.sell_price,
                        INFO.user1.sell_start_time,
                        INFO.user1.sell_end_time,
                        INFO.user1.sell_payment_token,
                        []
                    )
            );
            INFO.user1.sell_market_item_id = await mkpManager.getCurrentMarketItem();
        });

        it("user2, user3, user4 make offers on sell", async () => {
            // User 2 make order
            INFO.user2.bid_price = parseEther("1.5");
            INFO.user2.end_time = (await getCurrentTime()) + ONE_WEEK;
            await BT.expect(
                orderManager
                    .connect(user2)
                    .makeMarketItemOrder(
                        INFO.user1.sell_market_item_id,
                        INFO.user1.sell_payment_token,
                        INFO.user2.bid_price,
                        INFO.user2.end_time,
                        []
                    )
            ).to.revertedWith("Not the order time");

            await skipTime(10);
            await BT.expect(() =>
                orderManager
                    .connect(user2)
                    .makeMarketItemOrder(
                        INFO.user1.sell_market_item_id,
                        INFO.user1.sell_payment_token,
                        INFO.user2.bid_price,
                        INFO.user2.end_time,
                        []
                    )
            ).changeTokenBalance(token, user2, INFO.user2.bid_price.mul(-1));
            INFO.user2.market_item_order_id = 12;

            // User 3 make order
            INFO.user3.bid_price = parseEther("1.5");
            INFO.user3.end_time = (await getCurrentTime()) + ONE_WEEK;
            await BT.expect(() =>
                orderManager
                    .connect(user3)
                    .makeMarketItemOrder(
                        INFO.user1.sell_market_item_id,
                        INFO.user1.sell_payment_token,
                        INFO.user3.bid_price,
                        INFO.user3.end_time,
                        []
                    )
            ).changeTokenBalance(token, user3, INFO.user3.bid_price.mul(-1));
            INFO.user3.market_item_order_id = 13;

            // User 4 make order
            INFO.user4.bid_price = parseEther("1.7");
            INFO.user4.end_time = (await getCurrentTime()) + ONE_WEEK;
            await BT.expect(() =>
                orderManager
                    .connect(user4)
                    .makeMarketItemOrder(
                        INFO.user1.sell_market_item_id,
                        INFO.user1.sell_payment_token,
                        INFO.user4.bid_price,
                        INFO.user4.end_time,
                        []
                    )
            ).changeTokenBalance(token, user4, INFO.user4.bid_price.mul(-1));
            INFO.user4.market_item_order_id = 14;
        });

        it("all cancel offers", async () => {
            await BT.updateFee(orderManager.connect(user2).cancelMarketItemOrder(INFO.user2.market_item_order_id));
            await BT.updateFee(orderManager.connect(user3).cancelMarketItemOrder(INFO.user3.market_item_order_id));
            await BT.updateFee(orderManager.connect(user4).cancelMarketItemOrder(INFO.user4.market_item_order_id));
        });

        it("Check balance after flowNFT1155_", async () => {
            flowNFT1155_8 = "flowNFT1155_8";

            await orderManagerBT.takeSnapshot(flowNFT1155_8);
            await user1BT.takeSnapshot(flowNFT1155_8);
            await user2BT.takeSnapshot(flowNFT1155_8);
            await user3BT.takeSnapshot(flowNFT1155_8);
            await user4BT.takeSnapshot(flowNFT1155_8);
            await user5BT.takeSnapshot(flowNFT1155_8);
            await user6BT.takeSnapshot(flowNFT1155_8);
            await treasuryBT.takeSnapshot(flowNFT1155_8);

            const orderManagerDiff = orderManagerBT.diff(flowNFT1155_7, flowNFT1155_8);
            const user1Diff = user1BT.diff(flowNFT1155_7, flowNFT1155_8);
            const user2Diff = user2BT.diff(flowNFT1155_7, flowNFT1155_8);
            const user3Diff = user3BT.diff(flowNFT1155_7, flowNFT1155_8);
            const user4Diff = user4BT.diff(flowNFT1155_7, flowNFT1155_8);
            const user5Diff = user5BT.diff(flowNFT1155_7, flowNFT1155_8);
            const user6Diff = user6BT.diff(flowNFT1155_7, flowNFT1155_8);
            const treasuryDiff = treasuryBT.diff(flowNFT1155_7, flowNFT1155_8);

            expect(orderManagerDiff[ADDRESS_ZERO].delta.mul(-1)).to.equal(orderManagerBT.totalFee);
            expect(user1Diff[ADDRESS_ZERO].delta.mul(-1)).to.equal(user1BT.totalFee);
            expect(user2Diff[ADDRESS_ZERO].delta.mul(-1)).to.equal(user2BT.totalFee);
            expect(user3Diff[ADDRESS_ZERO].delta.mul(-1)).to.equal(user3BT.totalFee);
            expect(user4Diff[ADDRESS_ZERO].delta.mul(-1)).to.equal(user4BT.totalFee);
            expect(user5Diff[ADDRESS_ZERO].delta.mul(-1)).to.equal(user5BT.totalFee);
            expect(user6Diff[ADDRESS_ZERO].delta.mul(-1)).to.equal(user6BT.totalFee);
            expect(treasuryDiff[ADDRESS_ZERO].delta.mul(-1)).to.equal(treasuryBT.totalFee);

            expect(orderManagerDiff[token.address].delta).to.equal(0);
            expect(user1Diff[token.address].delta).to.equal(0);
            expect(user2Diff[token.address].delta).to.equal(0);
            expect(user3Diff[token.address].delta).to.equal(0);
            expect(user4Diff[token.address].delta).to.equal(0);
            expect(user5Diff[token.address].delta).to.equal(0);
            expect(user6Diff[token.address].delta).to.equal(0);
            expect(treasuryDiff[token.address].delta).to.equal(0);
        });
    });
});
