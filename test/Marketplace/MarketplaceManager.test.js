const { expect } = require("chai");
const { upgrades, ethers } = require("hardhat");

describe("Marketplace Manager:", () => {
    beforeEach(async () => {
        MAX_LIMIT =
            "115792089237316195423570985008687907853269984665640564039457584007913129639935";
        TOTAL_SUPPLY = "1000000000000000000000000000000";
        ZERO_ADDR = "0x0000000000000000000000000000000000000000";
        PRICE = "1000000000000000000";
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
            450,
        ]);

        await mkpManager.setMtvsManager(mtvsManager.address);
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

    describe("isAdmin function:", async () => {
        it("should return whether caller is admin or not: ", async () => {
            await mkpManager.setAdmin(user2.address, true);
            expect(await mkpManager.isAdmin(user2.address)).to.equal(true);

            await mkpManager.setAdmin(user2.address, false);
            expect(await mkpManager.isAdmin(user2.address)).to.equal(false);
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
            const feeInfo = await mkpManager.getListingFee();
            expect(feeInfo[0]).to.equal(2500);
            expect(feeInfo[1]).to.equal(100000);
        });
    });

    describe("getRoyaltyInfo function:", async () => {
        it("should return correct royalInfo: ", async () => {
            await tokenMintERC721.mint(user1.address, "this_uri");
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
        it("should revert when price equal to zero: ", async () => {
            await expect(mkpManager.sellAvaiableInMarketplace(1, 0)).to.be.revertedWith(
                "ERROR: amount must be greater than zero !"
            );
        });
        it("should revert when caller is not owner: ", async () => {
            await expect(mkpManager.sellAvaiableInMarketplace(1, 1000)).to.be.revertedWith(
                "ERROR: sender is not owner this NFT"
            );
        });
        it("should sell success and return marketItemId: ", async () => {
            await token.mint(user1.address, "10000000000000000");
            await token.mint(owner.address, "1000000000000000000");
            await token.approve(user1.address, MAX_LIMIT);
            await token.connect(user1).approve(mtvsManager.address, MAX_LIMIT);
            await tokenMintERC721.setAdmin(mtvsManager.address, true);
            await tokenMintERC1155.setAdmin(mtvsManager.address, true);
            await mkpManager.setAdmin(mtvsManager.address, true);
            await mtvsManager.connect(user1).createNFT(0, 1, "this_uri");
            // ERC721
            const latest_1 = await mkpManager.getLatestMarketItemByTokenId(
                tokenMintERC721.address,
                1
            );
            await mkpManager
                .connect(user1)
                .sellAvaiableInMarketplace(latest_1[0].marketItemId.toString(), 10005);
            const data_ERC721 = await mkpManager.fetchMarketItemsByMarketID(
                latest_1[0].marketItemId.toString()
            );
            expect(data_ERC721.price).to.equal(10005);
            // ERC1155
            await mtvsManager.connect(user1).createNFT(1, 100, "this_uri");
            const latest_2 = await mkpManager.getLatestMarketItemByTokenId(
                tokenMintERC1155.address,
                1
            );
            await mkpManager
                .connect(user1)
                .sellAvaiableInMarketplace(latest_2[0].marketItemId.toString(), 100056);
            const data_ERC1155 = await mkpManager.fetchMarketItemsByMarketID(
                latest_2[0].marketItemId.toString()
            );
            expect(data_ERC1155.price).to.equal(100056);
            expect(data_ERC1155.amount).to.equal(100);
        });
    });

    describe("sell function:", async () => {
        it("should revert when nft contract equal to zero address: ", async () => {});
        it("should revert when amount equal to zero: ", async () => {});
        it("should revert when gross sale value equal to zero: ", async () => {});
        it("should sell success and return marketItemId: ", async () => {});
    });

    describe("cancelSell function:", async () => {
        it("should revert when nft contract equal to zero address: ", async () => {});
        it("should revert when market ID not exist: ", async () => {});
        it("should revert when caller is not seller: ", async () => {});
    });

    describe("buy function:", async () => {
        it("should revert when nft contract equal to zero address: ", async () => {});
        it("should buy success: ", async () => {});
    });

    describe("updateCreateNFT function:", async () => {
        it("should revert when nft contract equal to zero address: ", async () => {});
        it("should revert when owner address equal to zero address: ", async () => {});
        it("should revert when amount equal to zero: ", async () => {});
        it("should revert when price equal to zero: ", async () => {});
        it("should revert when NFT address is compatible: ", async () => {});
        it("should update success: ", async () => {});
    });

    describe("getLatestMarketItemByTokenId function:", async () => {
        it("should return latest market item: ", async () => {});
    });

    describe("fetchAvailableMarketItems function:", async () => {
        it("should return all market items in marketplace: ", async () => {});
    });

    describe("fetchMarketItemsByMarketID function:", async () => {
        it("should return market item corresponding market ID : ", async () => {});
    });

    describe("fetchMarketItemsByAddress function:", async () => {
        it("should return market item corresponding address: ", async () => {});
    });
});
