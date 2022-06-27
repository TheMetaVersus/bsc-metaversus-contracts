const chai = require("chai");
const { expect } = require("chai");
const { upgrades } = require("hardhat");
const { solidity } = require("ethereum-waffle");
const { constants } = require("@openzeppelin/test-helpers");
const Big = require("big.js");
const { skipTime } = require("../utils");

chai.use(solidity);
const { add, subtract, multiply, divide } = require("js-big-decimal");
const bigDecimal = require("js-big-decimal");
describe("NFTMTVSTicket:", () => {
  beforeEach(async () => {
    MAX_LIMIT =
      "115792089237316195423570985008687907853269984665640564039457584007913129639935";
    TOTAL_SUPPLY = "1000000000000000000000000000000";
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

    NFTMTVSTicket = await ethers.getContractFactory("NFTMTVSTicket");
    nftMTVSTicket = await upgrades.deployProxy(NFTMTVSTicket, [
      owner.address,
      "NFT Metaversus Ticket",
      "nftMTVS",
      token.address,
      treasury.address,
      250,
    ]);

    await nftMTVSTicket.deployed();
  });

  describe("Deployment:", async () => {
    it("Check name, symbol and default state: ", async () => {
      const name = await nftMTVSTicket.name();
      const symbol = await nftMTVSTicket.symbol();
      expect(name).to.equal("NFT Metaversus Ticket");
      expect(symbol).to.equal("nftMTVS");
    });
    it("Check tokenURI: ", async () => {
      const tokenURI = await nftMTVSTicket._tokenUri(0);

      expect(tokenURI).to.equal("");

      await nftMTVSTicket.mint(user1.address);
      const URI = "this_is_uri_1";
      const tx = await nftMTVSTicket.setTokenURI(URI, 0);
      await tx.wait();
      const newURI = await nftMTVSTicket._tokenUri(0);

      expect(newURI).to.equal(URI);
    });
    it("Check Owner: ", async () => {
      const ownerAddress = await nftMTVSTicket.owner();
      expect(ownerAddress).to.equal(owner.address);
    });
  });

  describe("isAdmin function:", async () => {
    it("should return whether caller is admin or not: ", async () => {
      await nftMTVSTicket.setAdmin(user2.address, true);
      expect(await nftMTVSTicket.isAdmin(user2.address)).to.equal(true);

      await nftMTVSTicket.setAdmin(user2.address, false);
      expect(await nftMTVSTicket.isAdmin(user2.address)).to.equal(false);
    });
  });

  describe("setAdmin function:", async () => {
    it("should revert when caller is not owner: ", async () => {
      await expect(
        nftMTVSTicket.connect(user1).setAdmin(user2.address, true)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });
    it("should set admin success: ", async () => {
      await nftMTVSTicket.setAdmin(user2.address, true);
      expect(await nftMTVSTicket.isAdmin(user2.address)).to.equal(true);

      await nftMTVSTicket.setAdmin(user1.address, false);
      expect(await nftMTVSTicket.isAdmin(user1.address)).to.equal(false);

      await nftMTVSTicket.setAdmin(user2.address, false);
      expect(await nftMTVSTicket.isAdmin(user2.address)).to.equal(false);
    });
  });

  describe("setTreasury function:", async () => {
    it("should revert when caller is not owner: ", async () => {
      await expect(
        nftMTVSTicket.connect(user1).setTreasury(user2.address)
      ).to.be.revertedWith("Ownable: caller is not an owner or admin");
    });
    it("should set treasury success: ", async () => {
      await nftMTVSTicket.setTreasury(treasury.address);
      expect(await nftMTVSTicket.treasury()).to.equal(treasury.address);

      await nftMTVSTicket.setTreasury(user1.address);
      expect(await nftMTVSTicket.treasury()).to.equal(user1.address);

      await nftMTVSTicket.setTreasury(treasury.address);
      expect(await nftMTVSTicket.treasury()).to.equal(treasury.address);
    });
  });

  describe("buy function:", async () => {
    it("should buy success: ", async () => {
      await token.mint(user1.address, 70000000);
      await token.approve(user1.address, 70000000);
      await token.connect(user1).approve(nftMTVSTicket.address, 70000000);

      await nftMTVSTicket.connect(user1).buy("this_uri");
      expect(await nftMTVSTicket.balanceOf(user1.address)).to.equal(1);
      expect(await nftMTVSTicket.tokenURI(0)).to.equal("this_uri" + ".json");
    });
  });

  describe("mint function:", async () => {
    it("should mint success: ", async () => {
      await token.mint(owner.address, 70000000);
      await token.approve(owner.address, 70000000);
      await token.connect(owner).approve(nftMTVSTicket.address, 70000000);

      await nftMTVSTicket.mint(user2.address);
      expect(await nftMTVSTicket.balanceOf(user2.address)).to.equal(1);
    });
  });
});
