const { constants } = require("@openzeppelin/test-helpers");
const { expect } = require("chai");
const { upgrades, ethers } = require("hardhat");
const { multiply, add, subtract } = require("js-big-decimal");
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
            token.address,
            treasury.address,
            250,
            PRICE,
        ]);

        TokenMintERC1155 = await ethers.getContractFactory("TokenMintERC1155");
        tokenMintERC1155 = await upgrades.deployProxy(TokenMintERC1155, [
            owner.address,
            "uri",
            token.address,
            treasury.address,
            250,
            PRICE,
        ]);

        NFTMTVSTicket = await ethers.getContractFactory("NFTMTVSTicket");
        nftMTVSTicket = await upgrades.deployProxy(NFTMTVSTicket, [
            owner.address,
            "NFT Metaversus Ticket",
            "nftMTVS",
            token.address,
            treasury.address,
            250,
            PRICE,
        ]);

        MkpManager = await ethers.getContractFactory("MarketPlaceManager");
        mkpManager = await upgrades.deployProxy(MkpManager, [
            owner.address,
            token.address,
            treasury.address,
        ]);

        MTVSManager = await ethers.getContractFactory("MetaversusManager");
        mtvsManager = await upgrades.deployProxy(MTVSManager, [
            owner.address,
            tokenMintERC721.address,
            tokenMintERC1155.address,
            nftMTVSTicket.address,
            token.address,
            treasury.address,
            mkpManager.address,
            250,
            350,
        ]);

        await mtvsManager.unpause();
        await mkpManager.unpause();
    });

    describe("Deployment:", async () => {
        it("Check all address token were set: ", async () => {
            expect(await mkpManager.paymentToken()).to.equal(token.address);
            expect(await mkpManager.treasury()).to.equal(treasury.address);
        });
        it("Check Owner: ", async () => {
            const ownerAddress = await mkpManager.owner();
            expect(ownerAddress).to.equal(owner.address);
        });
    });

    describe("setAdmin function:", async () => {
        it("should revert when caller is not owner: ", async () => {
            await expect(
                mkpManager.connect(user1).setAdmin(user2.address, true)
            ).to.be.revertedWith("Ownable: caller is not the owner");
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

    describe("setTreasury function:", async () => {
        it("should revert when caller is not owner or admin: ", async () => {
            await expect(mkpManager.connect(user1).setTreasury(user2.address)).to.be.revertedWith(
                "Ownable: caller is not an owner or admin"
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

    describe("getListingFee function:", async () => {
        it("should return tuple listingFee: ", async () => {
            expect(await mkpManager.getListingFee(100000)).to.equal(2500);
        });
    });

    describe("getRoyaltyInfo function:", async () => {
        it("should return correct royalInfo: ", async () => {
            await tokenMintERC721.mint(user1.address, mkpManager.address, "this_uri");
            const royalInfos = await mkpManager.getRoyaltyInfo(
                tokenMintERC721.address,
                1,
                1000000000
            );

            expect(royalInfos[0].toString()).to.equal(treasury.address);
            expect(royalInfos[1]).to.equal((1000000000 * 250) / 10000);
        });
    });

    describe("sellAvaiableInMarketplace function:", async () => {
        it("should revert when market Item ID invalid: ", async () => {
            await expect(mkpManager.sellAvaiableInMarketplace(1, 0, ONE_WEEK)).to.be.revertedWith(
                "ERROR: market ID is not exist !"
            );
        });
        it("should revert when price equal to zero: ", async () => {
            await token.mint(user1.address, ONE_ETHER);
            await token.mint(owner.address, ONE_ETHER);
            await token.approve(user1.address, ethers.constants.MaxUint256);
            await token.connect(user1).approve(mtvsManager.address, ethers.constants.MaxUint256);
            await tokenMintERC721.setAdmin(mtvsManager.address, true);
            await tokenMintERC1155.setAdmin(mtvsManager.address, true);
            await mkpManager.setAdmin(mtvsManager.address, true);

            // ERC721

            await mtvsManager.connect(user1).createNFT(0, 1, "this_uri", 0, 0);
            await expect(mkpManager.sellAvaiableInMarketplace(1, 0, ONE_WEEK)).to.be.revertedWith(
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

            // ERC721
            await mtvsManager.connect(user1).createNFT(0, 1, "this_uri", 0, 0);
            await expect(
                mkpManager.sellAvaiableInMarketplace(1, 1000, ONE_WEEK)
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

            // ERC721
            await mtvsManager.connect(user1).createNFT(0, 1, "this_uri", 0, 0);
            const latest_1 = await mkpManager.getLatestMarketItemByTokenId(
                tokenMintERC721.address,
                1
            );

            await mkpManager
                .connect(user1)
                .sellAvaiableInMarketplace(latest_1[0].marketItemId.toString(), 10005, ONE_WEEK);
            const data_ERC721 = await mkpManager.fetchMarketItemsByMarketID(
                latest_1[0].marketItemId.toString()
            );
            expect(data_ERC721.price).to.equal(10005);
            // ERC1155
            await mtvsManager.connect(user1).createNFT(1, 100, "this_uri", 0, 0);
            const latest_2 = await mkpManager.getLatestMarketItemByTokenId(
                tokenMintERC1155.address,
                1
            );
            await mkpManager
                .connect(user1)
                .sellAvaiableInMarketplace(latest_2[0].marketItemId.toString(), 100056, ONE_WEEK);
            const data_ERC1155 = await mkpManager.fetchMarketItemsByMarketID(
                latest_2[0].marketItemId.toString()
            );

            expect(data_ERC1155.price).to.equal(100056);
            expect(data_ERC1155.amount).to.equal(100);
        });
    });

    describe("sell function:", async () => {
        it("should revert when nft contract equal to zero address: ", async () => {
            await expect(
                mkpManager.sell(constants.ZERO_ADDRESS, 0, 100, 100, ONE_WEEK)
            ).to.be.revertedWith("ERROR: invalid address !");
        });
        it("should revert when amount equal to zero: ", async () => {
            await expect(
                mkpManager.sell(tokenMintERC721.address, 0, 0, 100, ONE_WEEK)
            ).to.be.revertedWith("ERROR: amount must be greater than zero !");
        });
        it("should revert when gross sale value equal to zero: ", async () => {
            await expect(
                mkpManager.sell(tokenMintERC721.address, 0, 100, 0, ONE_WEEK)
            ).to.be.revertedWith("ERROR: amount must be greater than zero !");
        });
        it("should revert ERROR: NFT address is compatible !", async () => {
            await token.mint(user1.address, ONE_ETHER);

            await token
                .connect(user1)
                .approve(tokenMintERC721.address, ethers.constants.MaxUint256);

            const blockNumAfter = await ethers.provider.getBlockNumber();
            const blockAfter = await ethers.provider.getBlock(blockNumAfter);
            const current = blockAfter.timestamp;

            await expect(
                mkpManager.connect(user1).sell(treasury.address, 1, 1, 1000, current + ONE_WEEK)
            ).to.be.revertedWith("ERROR: NFT address is compatible !");
        });
        it("should sell success : ", async () => {
            await token.mint(user1.address, ONE_ETHER);

            await token
                .connect(user1)
                .approve(tokenMintERC721.address, ethers.constants.MaxUint256);

            await tokenMintERC721.connect(user1).buy("this_uri");

            await tokenMintERC721.connect(user1).approve(mkpManager.address, 1);
            const blockNumAfter = await ethers.provider.getBlockNumber();
            const blockAfter = await ethers.provider.getBlock(blockNumAfter);
            const current = blockAfter.timestamp;

            const tx = await mkpManager
                .connect(user1)
                .sell(tokenMintERC721.address, 1, 1, 1000, current + ONE_WEEK);
            let listener = await tx.wait();
            let event = listener.events.find(x => x.event == "MarketItemCreated");
            const marketId = event.args[0].toString();

            const marketInfo = await mkpManager.getLatestMarketItemByTokenId(
                tokenMintERC721.address,
                marketId
            );
            expect(marketInfo[0].price.toString()).to.equal("1000");
        });
    });

    describe("cancelSell function:", async () => {
        it("should revert when market ID not exist: ", async () => {
            await expect(mkpManager.cancelSell(123)).to.be.revertedWith(
                "ERROR: market ID is not exist !"
            );
        });
        it("should revert when caller is not seller: ", async () => {
            await token.mint(user1.address, ONE_ETHER);

            await token
                .connect(user1)
                .approve(tokenMintERC721.address, ethers.constants.MaxUint256);

            await tokenMintERC721.connect(user1).buy("this_uri");

            await tokenMintERC721.connect(user1).approve(mkpManager.address, 1);
            const tx = await mkpManager
                .connect(user1)
                .sell(tokenMintERC721.address, 1, 1, 1000, ONE_WEEK);
            let listener = await tx.wait();
            let event = listener.events.find(x => x.event == "MarketItemCreated");
            const marketId = event.args[0].toString();

            await expect(mkpManager.cancelSell(marketId)).to.be.revertedWith(
                "ERROR: you are not the seller !"
            );
        });
        it("should cancel sell success: ", async () => {
            await token.mint(user1.address, "1000000000000000000000000000000");

            await token
                .connect(user1)
                .approve(tokenMintERC721.address, ethers.constants.MaxUint256);
            await token.connect(user1).approve(mkpManager.address, ethers.constants.MaxUint256);
            await tokenMintERC721.connect(user1).buy("this_uri");

            await tokenMintERC721.connect(user1).approve(mkpManager.address, 1);
            const tx = await mkpManager
                .connect(user1)
                .sell(tokenMintERC721.address, 1, 1, 1000, ONE_WEEK);
            let listener = await tx.wait();
            let event = listener.events.find(x => x.event == "MarketItemCreated");
            const marketId = event.args[0].toString();

            await expect(() =>
                mkpManager.connect(user1).cancelSell(marketId)
            ).to.changeTokenBalance(tokenMintERC721, user1, 1);
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

            await token
                .connect(user1)
                .approve(tokenMintERC721.address, ethers.constants.MaxUint256);
            await token.connect(user2).approve(mkpManager.address, ethers.constants.MaxUint256);

            await tokenMintERC721.connect(user1).buy("this_uri");

            await tokenMintERC721.connect(user1).approve(mkpManager.address, 1);

            const blockNumAfter = await ethers.provider.getBlockNumber();
            const blockAfter = await ethers.provider.getBlock(blockNumAfter);
            const current = blockAfter.timestamp;

            const tx = await mkpManager
                .connect(user1)
                .sell(tokenMintERC721.address, 1, 1, ONE_ETHER, current + ONE_WEEK);
            let listener = await tx.wait();
            let event = listener.events.find(x => x.event == "MarketItemCreated");
            const marketId = event.args[0].toString();

            await expect(() => mkpManager.connect(user2).buy(marketId)).to.changeTokenBalance(
                tokenMintERC721,
                user2,
                1
            );
            const valueNotListingFee = multiply(0.025, ONE_ETHER);
            expect(await token.balanceOf(treasury.address)).to.equal(
                add(
                    TOTAL_SUPPLY,
                    add(PRICE, subtract(valueNotListingFee, multiply(valueNotListingFee, 0.025)))
                )
            );
        });
    });

    describe("getLatestMarketItemByTokenId function:", async () => {
        it("should return zero market item: ", async () => {
            const data = await mkpManager.getLatestMarketItemByTokenId(tokenMintERC721.address, 1);

            expect(data[0].marketItemId).to.equal(0);
            expect(data[1]).to.equal(false);
        });
        it("should return latest market item: ", async () => {
            await token.mint(user1.address, ONE_ETHER);
            await token.mint(user2.address, ONE_ETHER);

            await token
                .connect(user1)
                .approve(tokenMintERC721.address, ethers.constants.MaxUint256);
            await token
                .connect(user2)
                .approve(tokenMintERC1155.address, ethers.constants.MaxUint256);

            await token.connect(user1).approve(treasury.address, ethers.constants.MaxUint256);
            await token.connect(user2).approve(treasury.address, ethers.constants.MaxUint256);
            // ERC721
            await tokenMintERC721.connect(user1).buy("this_uri");
            await tokenMintERC721.connect(user1).approve(mkpManager.address, 1);

            let tx = await mkpManager
                .connect(user1)
                .sell(tokenMintERC721.address, 1, 1, 1234, ONE_WEEK);
            let listener = await tx.wait();
            let event = listener.events.find(x => x.event == "MarketItemCreated");
            let marketId = event.args[0].toString();
            const data721 = await mkpManager.getLatestMarketItemByTokenId(
                tokenMintERC721.address,
                1
            );

            expect(data721[0].marketItemId).to.equal(marketId);
            // ERC1155
            await tokenMintERC1155.connect(user2).buy(100, "this_uri");
            await tokenMintERC1155.connect(user2).setApprovalForAll(mkpManager.address, true);

            tx = await mkpManager
                .connect(user2)
                .sell(tokenMintERC1155.address, 1, 100, 4321, ONE_WEEK);
            listener = await tx.wait();
            event = listener.events.find(x => x.event == "MarketItemCreated");
            marketId = event.args[0].toString();
            const data1155 = await mkpManager.getLatestMarketItemByTokenId(
                tokenMintERC1155.address,
                1
            );

            expect(data1155[0].marketItemId).to.equal(marketId);
        });
    });

    describe("fetchAvailableMarketItems function:", async () => {
        it("should return all market items in marketplace: ", async () => {
            await token.mint(user1.address, "100000000000000000000000000000");
            await token.mint(user2.address, "100000000000000000000000000000");

            await token
                .connect(user1)
                .approve(tokenMintERC721.address, ethers.constants.MaxUint256);
            await token
                .connect(user2)
                .approve(tokenMintERC1155.address, ethers.constants.MaxUint256);

            await token.connect(user1).approve(treasury.address, ethers.constants.MaxUint256);
            await token.connect(user2).approve(treasury.address, ethers.constants.MaxUint256);
            // ERC721
            await tokenMintERC721.connect(user1).buy("this_uri");
            await tokenMintERC721.connect(user1).approve(mkpManager.address, 1);
            const blockNumAfter = await ethers.provider.getBlockNumber();
            const blockAfter = await ethers.provider.getBlock(blockNumAfter);
            let current = blockAfter.timestamp;

            let tx = await mkpManager
                .connect(user1)
                .sell(tokenMintERC721.address, 1, 1, 1234, current + ONE_WEEK);
            let listener = await tx.wait();
            let event = listener.events.find(x => x.event == "MarketItemCreated");
            let marketId = event.args[0].toString();
            const data721 = await mkpManager.getLatestMarketItemByTokenId(
                tokenMintERC721.address,
                1
            );

            expect(data721[0].marketItemId).to.equal(marketId);
            // ERC1155
            await tokenMintERC1155.connect(user2).buy(100, "this_uri");
            await tokenMintERC1155.connect(user2).setApprovalForAll(mkpManager.address, true);
            current = blockAfter.timestamp;
            tx = await mkpManager
                .connect(user2)
                .sell(tokenMintERC1155.address, 1, 100, 4321, current + ONE_WEEK);
            listener = await tx.wait();
            event = listener.events.find(x => x.event == "MarketItemCreated");
            marketId = event.args[0].toString();
            const data1155 = await mkpManager.getLatestMarketItemByTokenId(
                tokenMintERC1155.address,
                1
            );

            expect(data1155[0].marketItemId).to.equal(marketId);

            const allData = await mkpManager.fetchAvailableMarketItems();
            expect(allData.length).to.equal(2);
            expect(allData[0].price.toString()).to.equal("1234");
            expect(allData[1].price.toString()).to.equal("4321");
        });
    });

    describe("fetchMarketItemsByMarketID function:", async () => {
        it("should return market item corresponding market ID : ", async () => {
            await token.mint(user1.address, "100000000000000000000000000000");
            await token.mint(user2.address, "100000000000000000000000000000");

            await token
                .connect(user1)
                .approve(tokenMintERC721.address, ethers.constants.MaxUint256);
            await token
                .connect(user2)
                .approve(tokenMintERC1155.address, ethers.constants.MaxUint256);

            await token.connect(user1).approve(treasury.address, ethers.constants.MaxUint256);
            await token.connect(user2).approve(treasury.address, ethers.constants.MaxUint256);
            // ERC721
            await tokenMintERC721.connect(user1).buy("this_uri");
            await tokenMintERC721.connect(user1).approve(mkpManager.address, 1);
            const blockNumAfter = await ethers.provider.getBlockNumber();
            const blockAfter = await ethers.provider.getBlock(blockNumAfter);
            let current = blockAfter.timestamp;

            let tx = await mkpManager
                .connect(user1)
                .sell(tokenMintERC721.address, 1, 1, 1234, current + ONE_WEEK);
            let listener = await tx.wait();
            let event = listener.events.find(x => x.event == "MarketItemCreated");
            let marketId = event.args[0].toString();
            const data721 = await mkpManager.getLatestMarketItemByTokenId(
                tokenMintERC721.address,
                1
            );

            expect(data721[0].marketItemId).to.equal(marketId);
            // check
            const fetchId721 = await mkpManager.fetchMarketItemsByMarketID(marketId);

            expect(fetchId721.price.toString()).to.equal("1234");

            // ERC1155
            await tokenMintERC1155.connect(user2).buy(100, "this_uri");
            await tokenMintERC1155.connect(user2).setApprovalForAll(mkpManager.address, true);
            current = blockAfter.timestamp;
            tx = await mkpManager
                .connect(user2)
                .sell(tokenMintERC1155.address, 1, 100, 4321, current + ONE_WEEK);
            listener = await tx.wait();
            event = listener.events.find(x => x.event == "MarketItemCreated");
            marketId = event.args[0].toString();
            const data1155 = await mkpManager.getLatestMarketItemByTokenId(
                tokenMintERC1155.address,
                1
            );

            expect(data1155[0].marketItemId).to.equal(marketId);

            // check
            const fetchId1155 = await mkpManager.fetchMarketItemsByMarketID(marketId);

            expect(fetchId1155.price.toString()).to.equal("4321");
        });
    });

    describe("fetchMarketItemsByAddress function:", async () => {
        it("should return market item corresponding address: ", async () => {
            await token.mint(user1.address, "100000000000000000000000000000");
            await token.mint(user2.address, "100000000000000000000000000000");

            await token
                .connect(user1)
                .approve(tokenMintERC721.address, ethers.constants.MaxUint256);
            await token
                .connect(user2)
                .approve(tokenMintERC1155.address, ethers.constants.MaxUint256);

            await token.connect(user1).approve(treasury.address, ethers.constants.MaxUint256);
            await token.connect(user2).approve(treasury.address, ethers.constants.MaxUint256);
            // ERC721
            await tokenMintERC721.connect(user1).buy("this_uri");
            await tokenMintERC721.connect(user1).approve(mkpManager.address, 1);
            const blockNumAfter = await ethers.provider.getBlockNumber();
            const blockAfter = await ethers.provider.getBlock(blockNumAfter);
            let current = blockAfter.timestamp;

            let tx = await mkpManager
                .connect(user1)
                .sell(tokenMintERC721.address, 1, 1, 1234, current + ONE_WEEK);
            let listener = await tx.wait();
            let event = listener.events.find(x => x.event == "MarketItemCreated");
            let marketId = event.args[0].toString();
            const data721 = await mkpManager.getLatestMarketItemByTokenId(
                tokenMintERC721.address,
                1
            );

            expect(data721[0].marketItemId).to.equal(marketId);
            // ERC1155
            await tokenMintERC1155.connect(user2).buy(100, "this_uri");
            await tokenMintERC1155.connect(user2).setApprovalForAll(mkpManager.address, true);
            current = blockAfter.timestamp;
            tx = await mkpManager
                .connect(user2)
                .sell(tokenMintERC1155.address, 1, 100, 4321, current + ONE_WEEK);
            listener = await tx.wait();
            event = listener.events.find(x => x.event == "MarketItemCreated");
            marketId = event.args[0].toString();
            const data1155 = await mkpManager.getLatestMarketItemByTokenId(
                tokenMintERC1155.address,
                1
            );

            expect(data1155[0].marketItemId).to.equal(marketId);

            const dataUser1 = await mkpManager.fetchMarketItemsByAddress(user1.address);
            expect(dataUser1[0].price.toString()).to.equal("1234");
            const dataUser2 = await mkpManager.fetchMarketItemsByAddress(user2.address);
            expect(dataUser2[0].price.toString()).to.equal("4321");
        });
    });
});
