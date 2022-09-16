const { constants } = require("@openzeppelin/test-helpers");
const { default: Big } = require("big.js");
const { expect } = require("chai");
const { BigNumber } = require("ethers");
const { upgrades, ethers } = require("hardhat");
const { multiply, add, subtract } = require("js-big-decimal");
const { getCurrentTime, skipTime, handleCreateNFT } = require("../utils");
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

        Treasury = await ethers.getContractFactory("Treasury");
        treasury = await upgrades.deployProxy(Treasury, [owner.address]);

        Token = await ethers.getContractFactory("MTVS");
        token = await upgrades.deployProxy(Token, [
            owner.address,
            "Vetaversus Token",
            "MTVS",
            TOTAL_SUPPLY,
            treasury.address,
        ]);

        TokenMintERC721 = await ethers.getContractFactory("TokenMintERC721");
        tokenMintERC721 = await upgrades.deployProxy(TokenMintERC721, [
            owner.address,
            "NFT Metaversus",
            "nMTVS",
            treasury.address,
            250,
        ]);

        TokenMintERC1155 = await ethers.getContractFactory("TokenMintERC1155");
        tokenMintERC1155 = await upgrades.deployProxy(TokenMintERC1155, [owner.address, treasury.address, 250]);

        NftTest = await ethers.getContractFactory("NftTest");
        nftTest = await upgrades.deployProxy(NftTest, [
            owner.address,
            "NFT test",
            "NFT",
            token.address,
            treasury.address,
            250,
            PRICE,
        ]);

        MkpManager = await ethers.getContractFactory("MarketPlaceManager");
        mkpManager = await upgrades.deployProxy(MkpManager, [owner.address, treasury.address]);

        MTVSManager = await ethers.getContractFactory("MetaversusManager");
        mtvsManager = await upgrades.deployProxy(MTVSManager, [
            owner.address,
            tokenMintERC721.address,
            tokenMintERC1155.address,
            token.address,
            treasury.address,
            mkpManager.address,
        ]);
        await tokenMintERC721.setAdmin(mtvsManager.address, true);
        await tokenMintERC1155.setAdmin(mtvsManager.address, true);
        await mkpManager.setAdmin(mtvsManager.address, true);
        await mtvsManager.setPause(false);
        await mkpManager.setPause(false);
        await mkpManager.setPermitedNFT(tokenMintERC721.address, true);
        await mkpManager.setPermitedNFT(tokenMintERC1155.address, true);
        await mkpManager.setPermitedNFT(nftTest.address, true);

        await mkpManager.setPermitedPaymentToken(token.address, true);
        await mkpManager.setPermitedPaymentToken(constants.ZERO_ADDRESS, true);
    });

    describe("Deployment:", async () => {
        it("Check all address token were set: ", async () => {
            expect(await mkpManager.treasury()).to.equal(treasury.address);
        });
        it("Check Owner: ", async () => {
            const ownerAddress = await mkpManager.owner();
            expect(ownerAddress).to.equal(owner.address);
        });
    });

    describe("setAdmin function:", async () => {
        it("should revert when caller is not owner: ", async () => {
            await expect(mkpManager.connect(user1).setAdmin(user2.address, true)).to.be.revertedWith(
                "Ownable: caller is not the owner"
            );
        });
        it("should set admin success: ", async () => {
            await mkpManager.setAdmin(user2.address, true);
            expect(await mkpManager.isAdmin(user2.address)).to.equal(true);

            await mkpManager.setAdmin(user1.address, false);
            expect(await mkpManager.isAdmin(user1.address)).to.equal(false);

            await mkpManager.setAdmin(user2.address, false);
            expect(await mkpManager.isAdmin(user2.address)).to.equal(false);
        });
    });

    describe("setPermitedNFT function:", async () => {
        it("should set permited token success: ", async () => {
            await mkpManager.setPermitedNFT(tokenMintERC721.address, true);
            expect(await mkpManager.isPermitedNFT(tokenMintERC721.address)).to.equal(true);

            await mkpManager.setPermitedNFT(tokenMintERC1155.address, false);
            expect(await mkpManager.isPermitedNFT(tokenMintERC1155.address)).to.equal(false);

            await mkpManager.setPermitedNFT(tokenMintERC721.address, false);
            expect(await mkpManager.isPermitedNFT(tokenMintERC721.address)).to.equal(false);
        });
    });

    describe("setTreasury function:", async () => {
        it("should revert when caller is not owner or admin: ", async () => {
            await expect(mkpManager.connect(user1).setTreasury(user2.address)).to.be.revertedWith(
                "Adminable: caller is not an owner or admin"
            );
        });
        it("should set treasury success: ", async () => {
            await mkpManager.setTreasury(treasury.address);
            expect(await mkpManager.treasury()).to.equal(treasury.address);

            await mkpManager.setTreasury(user1.address);
            expect(await mkpManager.treasury()).to.equal(user1.address);

            await mkpManager.setTreasury(treasury.address);
            expect(await mkpManager.treasury()).to.equal(treasury.address);
        });
    });

    describe("getAllParams:", async () => {
        it("should get all params of pool: ", async () => {
            const params = await mkpManager.getAllParams();
            expect(await mkpManager.treasury()).to.equal(params[0]);
            expect(await mkpManager.listingFee()).to.equal(params[1]);
            expect(await mkpManager.DENOMINATOR()).to.equal(params[2]);
        });
    });

    describe("fetchAllPermitedNFTs:", async () => {
        it("should get all params of pool: ", async () => {
            const nfts = await mkpManager.fetchAllPermitedNFTs();
            expect(nfts.length).to.equal(3);
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

    describe("sellAvaiableInMarketplace function:", async () => {
        it("should revert when market Item ID invalid: ", async () => {
            await expect(mkpManager.sellAvaiableInMarketplace(1, 0, ONE_WEEK, ONE_WEEK)).to.be.revertedWith(
                "ERROR: market ID is not exist !"
            );
        });
        it("should revert when price equal to zero: ", async () => {
            await token.mint(user1.address, ONE_ETHER);
            await token.mint(owner.address, ONE_ETHER);
            await token.connect(user1).approve(mtvsManager.address, ethers.constants.MaxUint256);

            const current = await getCurrentTime();
            const typeNft = 0; // ERC721
            const amount = 1;
            const uri = "this_uri";
            const price = 0;
            const startTime = 0;
            const endTime = 0;

            await mtvsManager.connect(user1).createNFT(typeNft, amount, uri, price, startTime, endTime, token.address);
            await expect(mkpManager.sellAvaiableInMarketplace(1, 0, current, current + ONE_WEEK)).to.be.revertedWith(
                "ERROR: amount must be greater than zero !"
            );
        });
        it("should revert when caller is not owner: ", async () => {
            await token.mint(user1.address, ONE_ETHER);
            await token.mint(owner.address, ONE_ETHER);
            await token.approve(user1.address, ethers.constants.MaxUint256);
            await token.connect(user1).approve(mtvsManager.address, ethers.constants.MaxUint256);
            await tokenMintERC721.setAdmin(mtvsManager.address, true);
            await tokenMintERC1155.setAdmin(mtvsManager.address, true);
            await mkpManager.setAdmin(mtvsManager.address, true);

            const current = await getCurrentTime();
            const typeNft = 0; // ERC721
            const amount = 1;
            const uri = "this_uri";
            const price = 0;
            const startTime = 0;
            const endTime = 0;

            await mtvsManager.connect(user1).createNFT(typeNft, amount, uri, price, startTime, endTime, token.address);
            await expect(
                mkpManager.sellAvaiableInMarketplace(1, price + 1000, current, current + ONE_WEEK)
            ).to.be.revertedWith("ERROR: sender is not owner this NFT");
        });
        it("should sellAvaiableInMarketplace success and return marketItemId: ", async () => {
            await token.mint(user1.address, ONE_ETHER);
            await token.mint(owner.address, ONE_ETHER);
            await token.approve(user1.address, ethers.constants.MaxUint256);
            await token.connect(user1).approve(mtvsManager.address, ethers.constants.MaxUint256);
            await tokenMintERC721.setAdmin(mtvsManager.address, true);
            await tokenMintERC1155.setAdmin(mtvsManager.address, true);
            await mkpManager.setAdmin(mtvsManager.address, true);

            let typeNft = 0; // ERC721
            let amount = 1;
            let uri = "this_uri";
            let price = 0;
            let startTime = 0;
            let endTime = 0;

            await mtvsManager.connect(user1).createNFT(typeNft, amount, uri, price, startTime, endTime, token.address);

            const latest_1 = await mkpManager.getLatestMarketItemByTokenId(tokenMintERC721.address, 1);
            const current = await getCurrentTime();
            await mkpManager
                .connect(user1)
                .sellAvaiableInMarketplace(latest_1[0].marketItemId.toString(), 10005, current, add(current, ONE_WEEK));
            const data_ERC721 = await mkpManager.fetchMarketItemsByMarketID(latest_1[0].marketItemId.toString());
            expect(data_ERC721.price).to.equal(10005);
            // ERC1155
            typeNft = 1;
            amount = 100;
            uri = "this_uri";
            price = 0;
            startTime = 0;
            endTime = 0;

            await mtvsManager.connect(user1).createNFT(typeNft, amount, uri, price, startTime, endTime, token.address);
            const latest_2 = await mkpManager.getLatestMarketItemByTokenId(tokenMintERC1155.address, 1);
            await mkpManager
                .connect(user1)
                .sellAvaiableInMarketplace(
                    latest_2[0].marketItemId.toString(),
                    100056,
                    current,
                    add(current, ONE_WEEK)
                );
            const data_ERC1155 = await mkpManager.fetchMarketItemsByMarketID(latest_2[0].marketItemId.toString());

            expect(data_ERC1155.price).to.equal(100056);
            expect(data_ERC1155.amount).to.equal(100);
        });
    });

    describe("sell function:", async () => {
        it("should revert when nft contract equal to zero address: ", async () => {
            await expect(
                mkpManager.sell(constants.ZERO_ADDRESS, 0, 100, 100, ONE_WEEK, ONE_WEEK, token.address)
            ).to.be.revertedWith("ERROR: invalid address !");
        });
        it("should revert when amount equal to zero: ", async () => {
            await expect(
                mkpManager.sell(tokenMintERC721.address, 0, 0, 100, ONE_WEEK, ONE_WEEK, token.address)
            ).to.be.revertedWith("ERROR: amount must be greater than zero !");
        });
        it("should revert when gross sale value equal to zero: ", async () => {
            await expect(
                mkpManager.sell(tokenMintERC721.address, 0, 100, 0, ONE_WEEK, ONE_WEEK, token.address)
            ).to.be.revertedWith("ERROR: amount must be greater than zero !");
        });
        it("should revert ERROR: NFT not allow to sell on marketplace !", async () => {
            await token.mint(user1.address, ONE_ETHER);

            await token.connect(user1).approve(tokenMintERC721.address, ethers.constants.MaxUint256);

            const current = await getCurrentTime();

            await expect(
                mkpManager
                    .connect(user1)
                    .sell(treasury.address, 1, 1, 1000, current, add(current, ONE_WEEK), token.address)
            ).to.be.revertedWith("ERROR: NFT not allow to sell on marketplace !");
        });
        it("should sell success : ", async () => {
            await token.mint(user1.address, ONE_ETHER);

            await token.connect(user1).approve(nftTest.address, ethers.constants.MaxUint256);

            await nftTest.connect(user1).buy("this_uri");

            await nftTest.connect(user1).approve(mkpManager.address, 1);
            const current = await getCurrentTime();

            const tx = await mkpManager
                .connect(user1)
                .sell(nftTest.address, 1, 1, 1000, add(current, 100), add(current, ONE_WEEK), token.address);
            let listener = await tx.wait();
            let event = listener.events.find(x => x.event == "MarketItemCreated");
            const marketId = event.args[0].toString();

            const marketInfo = await mkpManager.getLatestMarketItemByTokenId(nftTest.address, marketId);
            expect(marketInfo[0].price.toString()).to.equal("1000");
        });
    });

    describe("cancelSell function:", async () => {
        it("should revert when market ID not exist: ", async () => {
            await expect(mkpManager.cancelSell(123)).to.be.revertedWith("ERROR: market ID is not exist !");
        });
        it("should revert when caller is not seller: ", async () => {
            await token.mint(user1.address, ONE_ETHER);

            await token.connect(user1).approve(nftTest.address, ethers.constants.MaxUint256);

            await nftTest.connect(user1).buy("this_uri");

            await nftTest.connect(user1).approve(mkpManager.address, 1);
            const curent = await getCurrentTime();
            const tx = await mkpManager
                .connect(user1)
                .sell(nftTest.address, 1, 1, 1000, add(curent, 100), add(curent, ONE_ETHER), token.address);
            let listener = await tx.wait();
            let event = listener.events.find(x => x.event == "MarketItemCreated");
            const marketId = event.args[0].toString();

            await expect(mkpManager.cancelSell(marketId)).to.be.revertedWith("ERROR: you are not the seller !");
        });
        it("should cancel sell success: ", async () => {
            await token.mint(user1.address, "1000000000000000000000000000000");

            await token.connect(user1).approve(mkpManager.address, ethers.constants.MaxUint256);
            await token.connect(user1).approve(nftTest.address, ethers.constants.MaxUint256);

            await nftTest.connect(user1).buy("this_uri");

            await nftTest.connect(user1).approve(mkpManager.address, 1);
            const curent = await getCurrentTime();
            const tx = await mkpManager
                .connect(user1)
                .sell(nftTest.address, 1, 1, 1000, add(curent, 100), add(curent, ONE_ETHER), token.address);
            let listener = await tx.wait();
            let event = listener.events.find(x => x.event == "MarketItemCreated");
            const marketId = event.args[0].toString();

            await expect(() => mkpManager.connect(user1).cancelSell(marketId)).to.changeTokenBalance(nftTest, user1, 1);
        });
    });

    describe("buy function:", async () => {
        it("should revert when market ID not exist: ", async () => {
            await expect(mkpManager.buy(0)).to.be.revertedWith("ERROR: market ID is not exist !");
            await expect(mkpManager.buy(123)).to.be.revertedWith("ERROR: market ID is not exist !");
        });

        it("should buy success: ", async () => {
            await token.mint(user1.address, ONE_ETHER);
            await token.mint(user2.address, ONE_ETHER);

            await token.connect(user1).approve(tokenMintERC721.address, ethers.constants.MaxUint256);
            await token.connect(user2).approve(mkpManager.address, ethers.constants.MaxUint256);
            await token.connect(user1).approve(nftTest.address, ethers.constants.MaxUint256);

            await token.connect(user2).approve(treasury.address, ethers.constants.MaxUint256);

            await nftTest.connect(user1).buy("this_uri");

            await nftTest.connect(user1).approve(mkpManager.address, 1);

            let current = await getCurrentTime();

            const tx = await mkpManager
                .connect(user1)
                .sell(nftTest.address, 1, 1, ONE_ETHER, add(current, 100), add(current, ONE_WEEK), token.address);
            let listener = await tx.wait();
            let event = listener.events.find(x => x.event == "MarketItemCreated");
            const marketId = event.args[0].toString();
            // const list = await mkpManager.fetchAvailableMarketItems();

            await skipTime(4800);
            current = await getCurrentTime();
            // await mkpManager.connect(user2).buy(1);
            await expect(() => mkpManager.connect(user2).buy(marketId)).to.changeTokenBalance(nftTest, user2, 1);
            const valueNotListingFee = multiply(0.025, ONE_ETHER);
            expect(await token.balanceOf(treasury.address)).to.equal(
                add(TOTAL_SUPPLY, add(PRICE, subtract(valueNotListingFee, multiply(valueNotListingFee, 0.025))))
            );
        });
    });

    describe("setPermitedPaymentToken function", async () => {
        it("should revert when caller is not owner or admin", async () => {
            await expect(mkpManager.connect(user1).setPermitedPaymentToken(token.address, true)).to.be.revertedWith(
                "Adminable: caller is not an owner or admin"
            );
        });
        it("should add new payment token success", async () => {
            await mkpManager.setPermitedPaymentToken(token.address, true);
            expect(await mkpManager.isPermitedPaymentToken(token.address)).to.equal(true);
            await mkpManager.setPermitedPaymentToken(tokenMintERC1155.address, true);
            expect(await mkpManager.isPermitedPaymentToken(tokenMintERC1155.address)).to.equal(true);
            await mkpManager.setPermitedPaymentToken(constants.ZERO_ADDRESS, true);
            expect(await mkpManager.isPermitedPaymentToken(constants.ZERO_ADDRESS)).to.equal(true);
            await mkpManager.setPermitedPaymentToken(constants.ZERO_ADDRESS, false);
            await mkpManager.setPermitedPaymentToken(tokenMintERC721.address, false);
        });
    });
    describe("makeOfferWalletAsset function", async () => {
        it("should revert when payment token is not allowed", async () => {
            await token.mint(owner.address, ONE_ETHER);
            await token.approve(mkpManager.address, ONE_ETHER);
            await expect(
                mkpManager.makeOfferWalletAsset(
                    "objectid",
                    tokenMintERC721.address,
                    ONE_ETHER,
                    user1.address,
                    tokenMintERC721.address,
                    1,
                    1,
                    ONE_WEEK
                )
            ).to.be.revertedWith("ERROR: payment token is not supported !");
        });
        it("should make offer in wallet success ", async () => {
            await token.mint(user1.address, ONE_ETHER);
            await token.connect(user1).approve(mkpManager.address, ONE_ETHER);
            await expect(() =>
                mkpManager
                    .connect(user1)
                    .makeOfferWalletAsset(
                        "test1",
                        token.address,
                        ONE_ETHER,
                        user2.address,
                        tokenMintERC721.address,
                        1,
                        1,
                        ONE_WEEK
                    )
            ).to.changeTokenBalance(token, user1, ONE_ETHER.mul(-1));
            const offerOrder = await mkpManager.getOfferOrderOfBidder(user1.address);

            expect(offerOrder.length).to.greaterThan(0);
        });
        it("should MOVE offer in wallet to marketplace success ", async () => {
            await token.mint(user1.address, ONE_ETHER);

            await token.connect(user1).approve(nftTest.address, ethers.constants.MaxUint256);

            await nftTest.connect(user1).buy("this_uri");

            await token.mint(user2.address, ONE_ETHER);
            await token.connect(user2).approve(mkpManager.address, ONE_ETHER);
            await expect(() =>
                mkpManager
                    .connect(user2)
                    .makeOfferWalletAsset(
                        "test1",
                        token.address,
                        ONE_ETHER,
                        user1.address,
                        nftTest.address,
                        1,
                        1,
                        ONE_WEEK
                    )
            ).to.changeTokenBalance(token, user2, ONE_ETHER.mul(-1));

            await nftTest.connect(user1).approve(mkpManager.address, 1);
            const current = await getCurrentTime();

            const tx = await mkpManager
                .connect(user1)
                .sell(nftTest.address, 1, 1, 1000, add(current, 100), add(current, ONE_WEEK), token.address);
            let listener = await tx.wait();
            let event = listener.events.find(x => x.event == "MarketItemCreated");
            const marketId = event.args[0].toString();

            const list = await mkpManager.getOfferOrderOfBidder(user2.address);
            expect(list[0].marketItemId).to.equal(marketId);
        });
        it("should MOVE offer in marketplace to wallet success when cancel", async () => {
            await token.mint(user1.address, ONE_ETHER);

            await token.connect(user1).approve(nftTest.address, ethers.constants.MaxUint256);

            await nftTest.connect(user1).buy("this_uri");

            await token.mint(user2.address, ONE_ETHER);
            await token.connect(user2).approve(mkpManager.address, ONE_ETHER);
            await expect(() =>
                mkpManager
                    .connect(user2)
                    .makeOfferWalletAsset(
                        "test1",
                        token.address,
                        ONE_ETHER,
                        user1.address,
                        nftTest.address,
                        1,
                        1,
                        ONE_WEEK
                    )
            ).to.changeTokenBalance(token, user2, ONE_ETHER.mul(-1));

            await nftTest.connect(user1).approve(mkpManager.address, 1);
            const current = await getCurrentTime();

            const tx = await mkpManager
                .connect(user1)
                .sell(nftTest.address, 1, 1, 1000, add(current, 100), add(current, ONE_WEEK), token.address);
            let listener = await tx.wait();
            let event = listener.events.find(x => x.event == "MarketItemCreated");
            const marketId = event.args[0].toString();

            await mkpManager.connect(user1).cancelSell(marketId);

            const list = await mkpManager.getOfferOrderOfBidder(user2.address);
            expect(list[0].marketItemId).to.equal(0);
        });
    });
    describe("makeOffer function", async () => {
        it("should revert when payment token is not allowed", async () => {
            await token.mint(user1.address, ONE_ETHER);

            await token.connect(user1).approve(nftTest.address, ethers.constants.MaxUint256);

            await nftTest.connect(user1).buy("this_uri");

            await nftTest.connect(user1).approve(mkpManager.address, 1);
            const current = await getCurrentTime();

            const tx = await mkpManager
                .connect(user1)
                .sell(nftTest.address, 1, 1, 1000, add(current, 100), add(current, ONE_WEEK), token.address);
            let listener = await tx.wait();
            let event = listener.events.find(x => x.event == "MarketItemCreated");
            const marketId = event.args[0].toString();

            await token.mint(owner.address, ONE_ETHER);
            await token.approve(mkpManager.address, ONE_ETHER);
            await expect(
                mkpManager.makeOffer(marketId, tokenMintERC721.address, ONE_ETHER, ONE_WEEK)
            ).to.be.revertedWith("ERROR: payment token is not supported !");
        });

        // it("should revert when item is not listed", async () => {
        //     await token.mint(user1.address, ONE_ETHER);

        //     await token.connect(user1).approve(nftTest.address, ethers.constants.MaxUint256);

        //     await nftTest.connect(user1).buy("this_uri");

        //     await nftTest.connect(user1).approve(mkpManager.address, 1);
        //     const blockNumAfter = await ethers.provider.getBlockNumber();
        //     const blockAfter = await ethers.provider.getBlock(blockNumAfter);
        //     const current = blockAfter.timestamp;

        //     const tx = await mkpManager
        //         .connect(user1)
        //         .sell(nftTest.address, 1, 1, 1000, add(current, 100), add(current, ONE_WEEK), token.address);
        //     let listener = await tx.wait();
        //     let event = listener.events.find(x => x.event == "MarketItemCreated");
        //     const marketId = event.args[0].toString();

        //     await token.mint(owner.address, ONE_ETHER);
        //     await token.approve(mkpManager.address, ONE_ETHER);
        //     await expect(mkpManager.makeOffer(marketId, token.address, ONE_ETHER, ONE_WEEK)).to.be.revertedWith(
        //         "ERROR: Item is not listed !"
        //     );
        // });

        it("should make offer in marketplace success", async () => {
            await token.mint(user1.address, ONE_ETHER);

            await token.connect(user1).approve(nftTest.address, ethers.constants.MaxUint256);

            await nftTest.connect(user1).buy("this_uri");

            await nftTest.connect(user1).approve(mkpManager.address, 1);
            const current = await getCurrentTime();

            const tx = await mkpManager
                .connect(user1)
                .sell(nftTest.address, 1, 1, 1000, add(current, 100), add(current, ONE_WEEK), token.address);
            let listener = await tx.wait();
            let event = listener.events.find(x => x.event == "MarketItemCreated");
            const marketId = event.args[0].toString();

            await token.mint(user1.address, ONE_ETHER);
            await token.connect(user1).approve(mkpManager.address, ONE_ETHER);
            await expect(() =>
                mkpManager.connect(user1).makeOffer(marketId, token.address, ONE_ETHER, ONE_WEEK)
            ).to.changeTokenBalance(token, user1, ONE_ETHER.mul(-1));

            const offerOrder = await mkpManager.getOfferOrderOfBidder(user1.address);

            expect(offerOrder.length).to.greaterThan(0);
        });

        it("should make offer with native success", async () => {
            await token.mint(user1.address, ONE_ETHER.mul(1000));
            await token.mint(user2.address, ONE_ETHER.mul(1000));

            await token.connect(user1).approve(nftTest.address, ethers.constants.MaxUint256);

            await nftTest.connect(user1).buy("this_uri");

            await nftTest.connect(user1).approve(mkpManager.address, 1);
            const current = await getCurrentTime();

            const tx = await mkpManager
                .connect(user1)
                .sell(nftTest.address, 1, 1, 1000, add(current, 100), add(current, ONE_WEEK), constants.ZERO_ADDRESS);
            let listener = await tx.wait();
            let event = listener.events.find(x => x.event == "MarketItemCreated");
            const marketId = event.args[0].toString();

            await token.mint(user2.address, ONE_ETHER);
            await token.connect(user2).approve(mkpManager.address, ONE_ETHER);
            // await expect(() =>
            //  await mkpManager.connect(user1).makeOffer(marketId, token.address, ONE_ETHER, ONE_WEEK);
            // ).to.changeTokenBalance(token, user1, ONE_ETHER.mul(-1));
            // await expect(() =>
            await mkpManager
                .connect(user2)
                .makeOffer(marketId, constants.ZERO_ADDRESS, ONE_ETHER, ONE_WEEK, { value: ONE_ETHER.toString() });
            // ).to.changeEtherBalance(user1, -1);

            await mkpManager.connect(user1).acceptOffer(1);
            const offerOrder = await mkpManager.getOfferOrderOfBidder(user2.address);

            expect(offerOrder[0].status).to.equal(1);
        });
    });
    describe("acceptOfferWalletAsset function", async () => {
        it("should revert when caller is not owner asset", async () => {
            await token.mint(user1.address, ONE_ETHER);
            await token.connect(user1).approve(mkpManager.address, ONE_ETHER);
            await expect(() =>
                mkpManager
                    .connect(user1)
                    .makeOfferWalletAsset(
                        "test1",
                        token.address,
                        ONE_ETHER,
                        user2.address,
                        tokenMintERC721.address,
                        1,
                        1,
                        ONE_WEEK
                    )
            ).to.changeTokenBalance(token, user1, ONE_ETHER.mul(-1));

            // const current = await getCurrentTime();
            // const list = await mkpManager.getOfferOrderOfBidder(user1.address);
            // console.log("list", list, current);
            await expect(mkpManager.acceptOfferWalletAsset(1)).to.be.revertedWith("ERROR: Invalid owner of asset !");
        });
        it("should accept offer success", async () => {
            await token.mint(user2.address, multiply(1000, ONE_ETHER));
            await token.connect(user2).approve(mtvsManager.address, ethers.constants.MaxUint256);
            await token.connect(user2).approve(nftTest.address, ethers.constants.MaxUint256);

            await nftTest.connect(user2).buy("this_uri");

            await token.mint(user1.address, ONE_ETHER);
            await token.connect(user1).approve(mkpManager.address, ONE_ETHER);
            await expect(() =>
                mkpManager
                    .connect(user1)
                    .makeOfferWalletAsset(
                        "test1",
                        token.address,
                        ONE_ETHER,
                        user2.address,
                        nftTest.address,
                        1,
                        1,
                        ONE_WEEK
                    )
            ).to.changeTokenBalance(token, user1, ONE_ETHER.mul(-1));
            await nftTest.connect(user2).approve(mkpManager.address, 1);
            await mkpManager.connect(user2).acceptOfferWalletAsset(1);

            const list = await mkpManager.getOfferOrderOfBidder(user1.address);
            expect(list[0].status).to.equal(1);
        });
    });
    describe("acceptOffer function", async () => {
        it("should revert when caller is not owner asset", async () => {
            await token.mint(user2.address, multiply(1000, ONE_ETHER));
            await token.connect(user2).approve(mtvsManager.address, ethers.constants.MaxUint256);
            await token.connect(user2).approve(nftTest.address, ethers.constants.MaxUint256);

            await nftTest.connect(user2).buy("this_uri");
            await nftTest.connect(user2).approve(mkpManager.address, 1);
            let current = await getCurrentTime();
            // sell in marketplace
            let tx = await mkpManager
                .connect(user2)
                .sell(nftTest.address, 1, 1, ONE_ETHER, add(current, 100), add(current, ONE_WEEK), token.address);
            let listener = await tx.wait();
            let event = listener.events.find(x => x.event == "MarketItemCreated");
            let marketId = event.args[0].toString();

            await token.mint(user1.address, ONE_ETHER);
            await token.connect(user1).approve(mkpManager.address, ONE_ETHER);
            await expect(() =>
                mkpManager.connect(user1).makeOffer(marketId, token.address, ONE_ETHER, ONE_WEEK)
            ).to.changeTokenBalance(token, user1, ONE_ETHER.mul(-1));

            // const current = await getCurrentTime();
            // const list = await mkpManager.getOfferOrderOfBidder(user1.address);
            // console.log("list", list, current);
            await expect(mkpManager.acceptOffer(1)).to.be.revertedWith("ERROR: Invalid seller of asset !");
        });
        it("should accept offer in marketplace success ", async () => {
            await token.mint(user2.address, multiply(1000, ONE_ETHER));
            await token.connect(user2).approve(mtvsManager.address, ethers.constants.MaxUint256);
            await token.connect(user2).approve(nftTest.address, ethers.constants.MaxUint256);

            await nftTest.connect(user2).buy("this_uri");
            await nftTest.connect(user2).approve(mkpManager.address, 1);
            let current = await getCurrentTime();
            // sell in marketplace
            let tx = await mkpManager
                .connect(user2)
                .sell(nftTest.address, 1, 1, ONE_ETHER, add(current, 100), add(current, ONE_WEEK), token.address);
            let listener = await tx.wait();
            let event = listener.events.find(x => x.event == "MarketItemCreated");
            let marketId = event.args[0].toString();

            await token.mint(user1.address, multiply(1000, ONE_ETHER));
            await token.connect(user1).approve(mkpManager.address, ONE_ETHER);
            await expect(() =>
                mkpManager.connect(user1).makeOffer(marketId, token.address, ONE_ETHER, ONE_WEEK)
            ).to.changeTokenBalance(token, user1, ONE_ETHER.mul(-1));

            await mkpManager.connect(user2).acceptOffer(1);

            const list = await mkpManager.getOfferOrderOfBidder(user1.address);
            expect(list[0].status).to.equal(1);
        });
    });
    describe("refundBidAmount function", async () => {
        it("should revert when invalid bidder", async () => {
            await token.mint(user2.address, multiply(1000, ONE_ETHER));
            await token.connect(user2).approve(mtvsManager.address, ethers.constants.MaxUint256);
            await token.connect(user2).approve(nftTest.address, ethers.constants.MaxUint256);

            await nftTest.connect(user2).buy("this_uri");

            await token.mint(user1.address, ONE_ETHER);
            await token.connect(user1).approve(mkpManager.address, ONE_ETHER);
            await expect(() =>
                mkpManager
                    .connect(user1)
                    .makeOfferWalletAsset(
                        "test1",
                        token.address,
                        ONE_ETHER,
                        user2.address,
                        nftTest.address,
                        1,
                        1,
                        ONE_WEEK
                    )
            ).to.changeTokenBalance(token, user1, ONE_ETHER.mul(-1));

            await expect(mkpManager.refundBidAmount(1)).to.be.revertedWith("ERROR: Invalid bidder !");
        });
        it("should refund bid amount success", async () => {
            await token.mint(user2.address, multiply(1000, ONE_ETHER));
            await token.connect(user2).approve(mtvsManager.address, ethers.constants.MaxUint256);
            await token.connect(user2).approve(nftTest.address, ethers.constants.MaxUint256);

            await nftTest.connect(user2).buy("this_uri");
            await token.mint(user1.address, ONE_ETHER);
            await token.connect(user1).approve(mkpManager.address, ONE_ETHER);
            await expect(() =>
                mkpManager
                    .connect(user1)
                    .makeOfferWalletAsset(
                        "test1",
                        token.address,
                        ONE_ETHER,
                        user2.address,
                        nftTest.address,
                        1,
                        1,
                        ONE_WEEK
                    )
            ).to.changeTokenBalance(token, user1, ONE_ETHER.mul(-1));
            await mkpManager.connect(user1).refundBidAmount(1);
            const list = await mkpManager.getOfferOrderOfBidder(user1.address);
            expect(list[0].status).to.equal(2); // Claimed
        });
    });
    describe("getOfferOrderOfBidder function", async () => {
        it("should return offer list of bidder", async () => {
            await token.mint(user2.address, multiply(1000, ONE_ETHER));
            await token.connect(user2).approve(mtvsManager.address, ethers.constants.MaxUint256);
            await token.connect(user2).approve(nftTest.address, ethers.constants.MaxUint256);

            await nftTest.connect(user2).buy("this_uri");
            await token.mint(user1.address, ONE_ETHER);
            await token.connect(user1).approve(mkpManager.address, ONE_ETHER);
            await expect(() =>
                mkpManager
                    .connect(user1)
                    .makeOfferWalletAsset(
                        "test1",
                        token.address,
                        ONE_ETHER,
                        user2.address,
                        nftTest.address,
                        1,
                        1,
                        ONE_WEEK
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

            await token.connect(user1).approve(tokenMintERC721.address, ethers.constants.MaxUint256);
            await token.connect(user2).approve(tokenMintERC1155.address, ethers.constants.MaxUint256);

            await token.connect(user1).approve(mtvsManager.address, ethers.constants.MaxUint256);
            await token.connect(user1).approve(nftTest.address, ethers.constants.MaxUint256);

            await nftTest.connect(user1).buy("this_uri");

            await nftTest.connect(user1).approve(mkpManager.address, 1);
            let current = await getCurrentTime();
            let tx = await mkpManager
                .connect(user1)
                .sell(nftTest.address, 1, 1, ONE_ETHER, add(current, 100), add(current, ONE_WEEK), token.address);
            let listener = await tx.wait();
            let event = listener.events.find(x => x.event == "MarketItemCreated");
            let marketId = event.args[0].toString();
            const data721 = await mkpManager.getLatestMarketItemByTokenId(nftTest.address, 1);

            expect(data721[0].marketItemId).to.equal(marketId);
            // // ERC1155
            current = await getCurrentTime();
            await mtvsManager
                .connect(user1)
                .createNFT(1, 100, "this_uri", ONE_ETHER, add(current, 100), add(current, ONE_WEEK), token.address);

            marketId = await mkpManager.getCurrentMarketItem();

            const data1155 = await mkpManager.getLatestMarketItemByTokenId(tokenMintERC1155.address, 1);

            expect(data1155[0].marketItemId).to.equal(marketId);
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

            await nftTest.connect(user1).approve(mkpManager.address, 1);
            let current = await getCurrentTime();

            let tx = await mkpManager
                .connect(user1)
                .sell(nftTest.address, 1, 1, ONE_ETHER, add(current, 100), add(current, ONE_WEEK), token.address);
            let listener = await tx.wait();
            let event = listener.events.find(x => x.event == "MarketItemCreated");
            let marketId = event.args[0].toString();
            const data721 = await mkpManager.getLatestMarketItemByTokenId(nftTest.address, 1);
            const data = await mkpManager.fetchAvailableMarketItems();
            expect(data[0].marketItemId).to.equal(data721[0].marketItemId);
            expect(data721[0].marketItemId).to.equal(marketId);
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

            await token.connect(user1).approve(tokenMintERC721.address, ethers.constants.MaxUint256);
            await token.connect(user2).approve(tokenMintERC1155.address, ethers.constants.MaxUint256);

            await token.connect(user1).approve(nftTest.address, ethers.constants.MaxUint256);

            await nftTest.connect(user1).buy("this_uri");

            await nftTest.connect(user1).approve(mkpManager.address, 1);
            const blockNumAfter = await ethers.provider.getBlockNumber();
            const blockAfter = await ethers.provider.getBlock(blockNumAfter);
            let current = blockAfter.timestamp;

            let tx = await mkpManager
                .connect(user1)
                .sell(nftTest.address, 1, 1, ONE_ETHER, add(current, 100), add(current, ONE_WEEK), token.address);
            let listener = await tx.wait();
            let event = listener.events.find(x => x.event == "MarketItemCreated");
            let marketId = event.args[0].toString();
            const data721 = await mkpManager.getLatestMarketItemByTokenId(nftTest.address, 1);

            expect(data721[0].marketItemId).to.equal(marketId);
            // check
            const fetchId721 = await mkpManager.fetchMarketItemsByMarketID(marketId);
            expect(fetchId721.price.toString()).to.equal(ONE_ETHER);
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

            await nftTest.connect(user1).approve(mkpManager.address, 1);

            const blockNumAfter = await ethers.provider.getBlockNumber();
            const blockAfter = await ethers.provider.getBlock(blockNumAfter);
            let current = blockAfter.timestamp;

            let tx = await mkpManager
                .connect(user1)
                .sell(nftTest.address, 1, 1, ONE_ETHER, add(current, 100), add(current, ONE_WEEK), token.address);
            let listener = await tx.wait();
            let event = listener.events.find(x => x.event == "MarketItemCreated");
            let marketId = event.args[0].toString();
            const data721 = await mkpManager.getLatestMarketItemByTokenId(nftTest.address, 1);

            expect(data721[0].marketItemId).to.equal(marketId);

            const dataUser1 = await mkpManager.fetchMarketItemsByAddress(user1.address);
            expect(dataUser1[0].price.toString()).to.equal(ONE_ETHER);
        });
    });
});
