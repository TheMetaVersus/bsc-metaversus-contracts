const { expect } = require("chai");
const { upgrades, ethers } = require("hardhat");
const { MaxUint256, AddressZero } = ethers.constants;
const { add, subtract } = require("js-big-decimal");
const { getCurrentTime, skipTime, generateMerkleTree, generateLeaf } = require("../utils");
const keccak256 = require("keccak256");
const { parseEther } = require("ethers/lib/utils");

const TOTAL_SUPPLY = parseEther("1000000000000");
const PRICE = parseEther("1");
const ONE_ETHER = parseEther("1");
const ONE_WEEK = 604800;
const MINT_FEE = 1000;
const BID_PRICE = parseEther("100");
const BUY_BID_PRICE = add(BID_PRICE, parseEther("100"));

describe("OrderManager:", () => {
    beforeEach(async () => {
        [owner, user1, user2, user3] = await ethers.getSigners();

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
        await admin.setPermittedPaymentToken(AddressZero, true);

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

        it("Should revert when invalid MarketplaceManager contract address", async () => {
            await expect(upgrades.deployProxy(OrderManager, [AddressZero, admin.address])).to.revertedWith(
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
            expect(await orderManager.admin()).to.equal(admin.address);
        });
    });

    describe("makeWalletOrder function:", async () => {
        beforeEach(async () => {
            await orderManager.setPause(false);
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
                orderManager.makeWalletOrder(token.address, BID_PRICE, user2.address, tokenMintERC721.address, 1, 1, endTime)
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

        it("should be fail when update payment token", async () => {
            await orderManager
                .connect(user1)
                .makeWalletOrder(token.address, BID_PRICE, user2.address, tokenMintERC721.address, 1, 1, endTime);

            await expect(
                orderManager.connect(user1).makeWalletOrder(AddressZero, BID_PRICE.add(ONE_ETHER), user2.address, tokenMintERC721.address, 1, 1, endTime)
            ).to.revertedWith("Can not update payment token");
        });

        it("should be fail when invalid nft address", async () => {
            await expect(
                orderManager.connect(user1).makeWalletOrder(AddressZero, BID_PRICE.add(ONE_ETHER), user2.address, AddressZero, 1, 1, endTime)
            ).to.revertedWith("Invalid nft address");

            await expect(
                orderManager.connect(user1).makeWalletOrder(AddressZero, BID_PRICE.add(ONE_ETHER), user2.address, token.address, 1, 1, endTime)
            ).to.revertedWith("Invalid nft address");
        });

        it("should be fail when user does not own this token", async () => {
            await expect(
                orderManager.connect(user1).makeWalletOrder(AddressZero, BID_PRICE.add(ONE_ETHER), user3.address, tokenMintERC721.address, 1, 1, endTime)
            ).to.revertedWith("User does not own this token");

            await expect(
                orderManager.connect(user1).makeWalletOrder(AddressZero, BID_PRICE.add(ONE_ETHER), user2.address, tokenMintERC1155.address, 1, 1, endTime)
            ).to.revertedWith("User does not own this token");
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

        it("Should be ok when update offer", async () => {
            await orderManager
                .connect(user1)
                .makeWalletOrder(token.address, BID_PRICE, user2.address, tokenMintERC721.address, 1, 1, endTime);

            let order = await orderManager.getOrderByWalletOrderId(1);

            expect(order[1].bidPrice).to.equal(BID_PRICE);

            await orderManager
                .connect(user1)
                .makeWalletOrder(
                    token.address,
                    add(BID_PRICE, parseEther("100")),
                    user2.address,
                    tokenMintERC721.address,
                    1,
                    1,
                    endTime
                );

            order = await orderManager.getOrderByWalletOrderId(1);
            expect(order[1].bidPrice).to.equal(add(BID_PRICE, parseEther("100")));
        });

        it("Should be ok when update offer less than", async () => {
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
                        BID_PRICE.sub(parseEther("10")),
                        user2.address,
                        tokenMintERC721.address,
                        1,
                        1,
                        endTime
                    )
            ).to.changeTokenBalance(token, user1, parseEther("10"));

            order = await orderManager.getOrderByWalletOrderId(1);
            expect(order[1].bidPrice).to.equal(BID_PRICE.sub(parseEther("10")));
        });

        it("Should be ok when create new offer using native", async () => {
            await expect(() => orderManager
                .connect(user1)
                .makeWalletOrder(AddressZero, BID_PRICE, user2.address, tokenMintERC721.address, 1, 1, endTime, { value: BID_PRICE }))
                .to.changeEtherBalances([user1], [BID_PRICE.mul(-1)]);

            const order = await orderManager.getOrderByWalletOrderId(1);

            expect(order[0].owner).to.equal(user1.address);
            expect(order[1].paymentToken).to.equal(AddressZero);
            expect(order[1].bidPrice).to.equal(BID_PRICE);

            expect(order[0].to).to.equal(user2.address);
            expect(order[0].nftAddress).to.equal(tokenMintERC721.address);
            expect(order[0].tokenId).to.equal(1);
            expect(order[1].expiredTime).to.equal(endTime);
        });

        it("Should be ok when update offer native", async () => {
            await expect(() => orderManager
                .connect(user1)
                .makeWalletOrder(AddressZero, BID_PRICE, user2.address, tokenMintERC721.address, 1, 1, endTime, { value: BID_PRICE }))
                .to.changeEtherBalances([user1], [BID_PRICE.mul(-1)]);

            let order = await orderManager.getOrderByWalletOrderId(1);

            expect(order[1].bidPrice).to.equal(BID_PRICE);

            await expect(() => orderManager
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
                )).to.changeEtherBalances([user1], [ONE_ETHER.mul(-1)]);

            order = await orderManager.getOrderByWalletOrderId(1);
            expect(order[1].bidPrice).to.equal(BID_PRICE.add(ONE_ETHER));
        });

        it("Should be ok when update offer less than native", async () => {
            await expect(() => orderManager
                .connect(user1)
                .makeWalletOrder(AddressZero, BID_PRICE, user2.address, tokenMintERC721.address, 1, 1, endTime, { value: BID_PRICE })
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
            await orderManager.setPause(false);
            endTime = add(await getCurrentTime(), ONE_WEEK);

            await mtvsManager.setPause(false);
            const current = await getCurrentTime();

            await mtvsManager
                .connect(user2)
                .createNFT(true, 1, 100, "this_uri", ONE_ETHER, current + 100, current + 10000, token.address, []);
        });

        it("should revert when contract is paused", async () => {
            await orderManager.setPause(true);
            expect(await orderManager.paused()).to.equal(true);
            let marketItemId = await mkpManager.getCurrentMarketItem();
            await expect(
                orderManager.connect(user2).makeMarketItemOrder(marketItemId, token.address, BUY_BID_PRICE, endTime, [])
            ).to.revertedWith("Pausable: paused");
        });

        it("should be fail when invalid payment token", async () => {
            let marketItemId = await mkpManager.getCurrentMarketItem();
            await expect(
                orderManager.makeMarketItemOrder(marketItemId, treasury.address, BUY_BID_PRICE, endTime, [])
            ).to.revertedWith("Payment token is not supported");
        });

        it("should be fail when is not owned MetaCItizen", async () => {
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
                    .makeMarketItemOrder(
                        2,
                        token.address,
                        BUY_BID_PRICE,
                        endTime,
                        merkleTree.getHexProof(generateLeaf(user2.address))
                    )
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
            await orderManager.connect(user2).makeMarketItemOrder(2, token.address, BUY_BID_PRICE, endTime, proof);

            const order = await orderManager.getOrderByMarketItemOrderId(1);

            expect(order[0].owner).to.equal(user2.address);
            expect(order[1].paymentToken).to.equal(token.address);
            expect(order[1].bidPrice).to.equal(BUY_BID_PRICE);
            expect(order[0].marketItemId).to.equal(2);
        });

        it("Should be ok when update buy offer", async () => {
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
            await orderManager.connect(user2).makeMarketItemOrder(2, token.address, BUY_BID_PRICE, endTime, proof);

            let order = await orderManager.getOrderByMarketItemOrderId(1);
            expect(order[1].bidPrice).to.equal(BUY_BID_PRICE);

            await orderManager
                .connect(user2)
                .makeMarketItemOrder(2, token.address, add(BUY_BID_PRICE, parseEther("100")), endTime, proof);

            order = await orderManager.getOrderByMarketItemOrderId(1);
            expect(order[1].bidPrice).to.equal(add(BUY_BID_PRICE, parseEther("100")));
        });

        it("Should be ok when update buy offer", async () => {
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
            await orderManager.connect(user2).makeMarketItemOrder(2, token.address, BUY_BID_PRICE, endTime, proof);

            let order = await orderManager.getOrderByMarketItemOrderId(1);
            expect(order[1].bidPrice).to.equal(BUY_BID_PRICE);

            await orderManager
                .connect(user2)
                .makeMarketItemOrder(2, token.address, subtract(BUY_BID_PRICE, parseEther("10")), endTime, proof);

            order = await orderManager.getOrderByMarketItemOrderId(1);
            expect(order[1].bidPrice).to.equal(subtract(BUY_BID_PRICE, parseEther("10")));
        });
    });

    describe("acceptWalletOrder function:", async () => {
        beforeEach(async () => {
            await orderManager.setPause(false);
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

            await expect(orderManager.connect(user1).acceptWalletOrder(1)).to.revertedWith("Pausable: paused");
        });

        it("should be fail when Invalid seller of asset", async () => {
            await expect(orderManager.connect(user3).acceptWalletOrder(1)).to.revertedWith("Not the seller");
        });

        it("should be fail when Overtime", async () => {
            await skipTime(ONE_WEEK);
            await expect(orderManager.connect(user1).acceptWalletOrder(1)).to.revertedWith("Order is expired");
        });

        it("Should be ok", async () => {
            await nftTest.connect(user1).approve(orderManager.address, 1);
            await orderManager.connect(user1).acceptWalletOrder(1);
            expect(await nftTest.ownerOf(1)).to.equal(user2.address);
        });
    });

    describe("acceptMarketItemOrder function:", async () => {
        beforeEach(async () => {
            await orderManager.setPause(false);
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
            await orderManager
                .connect(user2)
                .makeMarketItemOrder(marketItemId, token.address, BUY_BID_PRICE, endTime, proof);
        });

        it("should revert when contract is paused", async () => {
            await orderManager.setPause(true);
            expect(await orderManager.paused()).to.equal(true);

            await expect(orderManager.connect(user1).acceptMarketItemOrder(1)).to.revertedWith("Pausable: paused");
        });

        it("should be fail when not the seller", async () => {
            await expect(orderManager.connect(user3).acceptMarketItemOrder(1)).to.revertedWith("Not the seller");
        });

        it("should be fail when Overtime", async () => {
            await skipTime(ONE_WEEK);
            await expect(orderManager.connect(user1).acceptMarketItemOrder(1)).to.revertedWith("Order is expired");
        });

        it("Should be ok", async () => {
            await orderManager.connect(user1).acceptMarketItemOrder(1);
            expect(await nftTest.ownerOf(1)).to.equal(user2.address);
        });
    });

    describe("Sell function:", async () => {
        beforeEach(async () => {
            await orderManager.setPause(false);

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
            await token.transfer(user1.address, ONE_ETHER);

            await token.connect(user1).approve(tokenMintERC721.address, MaxUint256);

            const current = await getCurrentTime();

            await expect(
                orderManager
                    .connect(user1)
                    .sell(treasury.address, 1, 1, 1000, current, add(current, ONE_WEEK), token.address, rootHash)
            ).to.be.revertedWith("Token is not existed");
        });
        it("should sell success and check private collection: ", async () => {
            await token.transfer(user1.address, ONE_ETHER);
            await token.connect(user1).approve(nftTest.address, MaxUint256);

            await nftTest.connect(user1).buy("this_uri");
            await nftTest.connect(user1).approve(mkpManager.address, 1);

            await orderManager
                .connect(user1)
                .sell(nftTest.address, 1, 1, 1000, startTime + 10, endTime, token.address, rootHash);

            const leaf = keccak256(user1.address);
            const proof = merkleTree.getHexProof(leaf);

            const marketItemId = await mkpManager.getCurrentMarketItem();
            expect(await mkpManager.verify(marketItemId.toNumber(), proof, user1.address)).to.equal(true);
            expect(await nftTest.ownerOf(1)).to.equal(mkpManager.address);
        });
    });

    describe("cancelWalletOrder function:", async () => {
        beforeEach(async () => {
            await orderManager.setPause(false);

            await token.transfer(user1.address, ONE_ETHER);

            await mtvsManager.setPause(false);
            const current = await getCurrentTime();

            await mtvsManager
                .connect(user2)
                .createNFT(false, 1, 100, "this_uri", ONE_ETHER, current + 100, current + 10000, token.address, []);

            merkleTree = await generateMerkleTree([user1.address, user2.address]);

            await orderManager
                .connect(user2)
                .makeWalletOrder(
                    token.address,
                    add(BID_PRICE, parseEther("100")),
                    user1.address,
                    nftTest.address,
                    1,
                    1,
                    current + 100000
                );
        });

        it("should revert when contract is paused", async () => {
            await orderManager.setPause(true);
            expect(await orderManager.paused()).to.equal(true);

            await expect(orderManager.cancelWalletOrder(1)).to.revertedWith("Pausable: paused");
        });

        it("should be fail when Invalid bidder", async () => {
            await expect(orderManager.connect(user1).cancelWalletOrder(1)).to.revertedWith("Not the owner of offer");
        });

        it("Should be ok", async () => {
            await orderManager.connect(user2).cancelWalletOrder(1);

            const order = await orderManager.getOrderByWalletOrderId(1);

            expect(order[1].status).to.equal(2);
        });
    });

    describe("cancelMarketItemOrder function:", async () => {
        beforeEach(async () => {
            await orderManager.setPause(false);
            await metaCitizen.mint(user2.address);
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

            const marketItemId = await mkpManager.getCurrentMarketItem();
            const leaf = keccak256(user2.address);
            const proof = merkleTree.getHexProof(leaf);
            await skipTime(10);
            await orderManager
                .connect(user2)
                .makeMarketItemOrder(marketItemId, token.address, BUY_BID_PRICE, endTime, proof);
        });

        it("should revert when contract is paused", async () => {
            await orderManager.setPause(true);
            expect(await orderManager.paused()).to.equal(true);

            await expect(orderManager.cancelMarketItemOrder(1)).to.revertedWith("Pausable: paused");
        });

        it("should be fail when Invalid bidder", async () => {
            await expect(orderManager.connect(user1).cancelMarketItemOrder(1)).to.revertedWith(
                "Not the owner of offer"
            );
        });

        it("Should be ok", async () => {
            await orderManager.connect(user2).cancelMarketItemOrder(1);

            const orderAfter = await orderManager.getOrderByMarketItemOrderId(1);

            expect(orderAfter[1].paymentToken).to.equal(token.address);
            expect(orderAfter[1].bidPrice).to.equal(BUY_BID_PRICE);
            expect(orderAfter[0].marketItemId).to.equal(1);
        });
    });

    describe("sellAvailableInMarketplace function:", async () => {
        beforeEach(async () => {
            await orderManager.setPause(false);
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

            await expect(
                orderManager.sellAvailableInMarketplace(1, PRICE, 1000, startTime + 10, endTime, token.address)
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
            ).to.revertedWith("Not expired yet");
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
            ).to.revertedWith("You are not the seller");
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
        it("should update amount when soldAvailable ERC1155", async () => {
            // await orderManager.setPause(false);

            await mtvsManager.setPause(false);
            let current = await getCurrentTime();

            await mtvsManager
                .connect(user2)
                .createNFT(false, 1, 1000, "this_uri", ONE_ETHER, current + 100, current + 10000, token.address, []);
            await tokenMintERC1155.connect(user2).setApprovalForAll(mkpManager.address, true);
            await orderManager
                .connect(user2)
                .sell(tokenMintERC1155.address, 1, 100, ONE_ETHER, current + 10, current + 10000, token.address, []);

            const marketItemId = await mkpManager.getCurrentMarketItem();
            let amount_sell = await mkpManager.getMarketItemIdToMarketItem(marketItemId);
            expect(amount_sell.amount).to.equal(100);
            // Start sell available
            await skipTime(100000);
            current = await getCurrentTime();
            await orderManager
                .connect(user2)
                .sellAvailableInMarketplace(
                    marketItemId,
                    add(PRICE, parseEther("100")),
                    200,
                    current + 10,
                    current + 10000,
                    token.address
                );
            amount_sell = await mkpManager.getMarketItemIdToMarketItem(marketItemId);
            expect(amount_sell.amount).to.equal(200);

            await skipTime(100000);
            current = await getCurrentTime();
            await orderManager
                .connect(user2)
                .sellAvailableInMarketplace(
                    marketItemId,
                    add(PRICE, parseEther("100")),
                    150,
                    current + 10,
                    current + 10000,
                    token.address
                );
            amount_sell = await mkpManager.getMarketItemIdToMarketItem(marketItemId);
            expect(amount_sell.amount).to.equal(150);
        });
    });

    describe("cancelSell function:", async () => {
        beforeEach(async () => {
            await orderManager.setPause(false);
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
            await expect(orderManager.connect(user1).cancelSell(marketItemId + 1)).to.revertedWith(
                "ERROR: market ID is not exist !"
            );
        });

        it("should be ok", async () => {
            await orderManager.connect(user1).cancelSell(marketItemId);

            const marketItem = await mkpManager.getMarketItemIdToMarketItem(marketItemId);
            expect((marketItem.price = 0));
            expect((marketItem.status = 0));
            expect((marketItem.startTime = 0));
            expect((marketItem.endTime = 0));
            expect((marketItem.paymentToken = AddressZero));
            expect(await nftTest.ownerOf(1)).to.equal(user1.address);
        });
    });

    describe("buy function:", async () => {
        beforeEach(async () => {
            await orderManager.setPause(false);
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

            await expect(orderManager.buy(marketItemId, [])).to.revertedWith("Pausable: paused");
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

        it("should be ok", async () => {
            await metaCitizen.mint(user2.address);
            const leaf = keccak256(user2.address);
            const proof = merkleTree.getHexProof(leaf);
            await skipTime(100);
            await orderManager.connect(user2).buy(marketItemId, proof);

            const marketItem = await mkpManager.getMarketItemIdToMarketItem(marketItemId);
            expect((marketItem.status = 2));
            expect(await nftTest.ownerOf(1)).to.equal(user2.address);
        });
    });
});
