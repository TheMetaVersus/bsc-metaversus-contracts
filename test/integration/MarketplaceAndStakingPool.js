const { deployMockContract } = require("@ethereum-waffle/mock-contract");
const { constants } = require("@openzeppelin/test-helpers");
const { ZERO_ADDRESS } = require("@openzeppelin/test-helpers/src/constants");
const { expect } = require("chai");
const { upgrades, ethers } = require("hardhat");
const { multiply, add, subtract } = require("js-big-decimal");
const { getCurrentTime, skipTime } = require("../utils");
const { MerkleTree } = require("merkletreejs");
const keccak256 = require("keccak256");
const aggregator_abi = require("../../artifacts/@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol/AggregatorV3Interface.json");
const PRICE = ethers.utils.parseEther("1");
const ONE_ETHER = ethers.utils.parseEther("1");
const ONE_WEEK = 604800;
const USD_TOKEN = "0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56";
const REWARD_RATE = 15854895992; // 50 % APY
const poolDuration = 9 * 30 * 24 * 60 * 60; // 9 months
const OVER_AMOUNT = ethers.utils.parseEther("1000000");
const ONE_MILLION_ETHER = ethers.utils.parseEther("1000000");
const ONE_YEAR = 31104000;
const TOTAL_SUPPLY = ethers.utils.parseEther("1000000000000");

const abi = [
  {
    inputs: [
      { internalType: "uint256", name: "amountIn", type: "uint256" },
      { internalType: "address[]", name: "path", type: "address[]" }
    ],
    name: "getAmountsOut",
    outputs: [
      { internalType: "uint256[]", name: "amounts", type: "uint256[]" }
    ],
    stateMutability: "view",
    type: "function"
  }
];

describe("Marketplace interact with Staking Pool:", () => {
  before(async () => {
    const accounts = await ethers.getSigners();
    owner = accounts[0];
    user1 = accounts[1];
    user2 = accounts[2];
    user3 = accounts[3];

    Admin = await ethers.getContractFactory("Admin");
    admin = await upgrades.deployProxy(Admin, [owner.address]);

    Treasury = await ethers.getContractFactory("Treasury");
    treasury = await upgrades.deployProxy(Treasury, [admin.address]);

    PANCAKE_ROUTER = await deployMockContract(owner, abi);
    AGGREGATOR = await deployMockContract(owner, aggregator_abi.abi);
    await PANCAKE_ROUTER.mock.getAmountsOut.returns([
      ONE_ETHER,
      multiply(500, ONE_ETHER)
    ]);

    await AGGREGATOR.mock.latestRoundData.returns(1, 1, 1, 1, 1);

    Token = await ethers.getContractFactory("MTVS");
    token = await upgrades.deployProxy(Token, [
      user1.address,
      "Metaversus Token",
      "MTVS",
      TOTAL_SUPPLY,
      treasury.address,
      admin.address
    ]);

    USD = await ethers.getContractFactory("USD");
    usd = await upgrades.deployProxy(USD, [
      user1.address,
      "USD Token",
      "USD",
      TOTAL_SUPPLY,
      treasury.address
    ]);

    TokenMintERC721 = await ethers.getContractFactory("TokenMintERC721");
    tokenMintERC721 = await upgrades.deployProxy(TokenMintERC721, [
      "NFT Metaversus",
      "nMTVS",
      treasury.address,
      250,
      admin.address
    ]);

    TokenMintERC1155 = await ethers.getContractFactory("TokenMintERC1155");
    tokenMintERC1155 = await upgrades.deployProxy(TokenMintERC1155, [
      treasury.address,
      250,
      admin.address
    ]);

    NftTest = await ethers.getContractFactory("NftTest");
    nftTest = await upgrades.deployProxy(NftTest, [
      "NFT test",
      "NFT",
      token.address,
      treasury.address,
      250,
      PRICE,
      admin.address
    ]);

    MkpManager = await ethers.getContractFactory("MarketPlaceManager");
    mkpManager = await upgrades.deployProxy(MkpManager, [
      treasury.address,
      admin.address
    ]);

    OrderManager = await ethers.getContractFactory("OrderManager");
    orderManager = await upgrades.deployProxy(OrderManager, [
      mkpManager.address,
      admin.address
    ]);

    TokenERC721 = await ethers.getContractFactory("TokenERC721");
    tokenERC721 = await TokenERC721.deploy();
    TokenERC1155 = await ethers.getContractFactory("TokenERC1155");
    tokenERC1155 = await TokenERC1155.deploy();

    CollectionFactory = await ethers.getContractFactory("CollectionFactory");
    collectionFactory = await upgrades.deployProxy(CollectionFactory, [
      tokenERC721.address,
      tokenERC1155.address,
      admin.address,
      ZERO_ADDRESS,
      ZERO_ADDRESS
    ]);

    MTVSManager = await ethers.getContractFactory("MetaversusManager");
    mtvsManager = await upgrades.deployProxy(MTVSManager, [
      tokenMintERC721.address,
      tokenMintERC1155.address,
      token.address,
      treasury.address,
      mkpManager.address,
      collectionFactory.address,
      admin.address
    ]);

    Staking = await ethers.getContractFactory("StakingPool");
    staking = await upgrades.deployProxy(Staking, [
      token.address,
      token.address,
      mkpManager.address,
      REWARD_RATE,
      poolDuration,
      PANCAKE_ROUTER.address,
      USD_TOKEN,
      AGGREGATOR.address,
      admin.address
    ]);

    CURRENT = await getCurrentTime();
    await admin.setAdmin(mtvsManager.address, true);
    await mtvsManager.setPause(false);
    await staking.setPause(false);
    await orderManager.setPause(false);
    await mkpManager.setOrderManager(orderManager.address);
  });

  describe("Setup: Set permitted tokens => Set start time for staking pool", () => {
    it("Set permitted tokens", async () => {
      expect(await admin.isPermittedPaymentToken(token.address)).to.equal(
        false
      );
      expect(await admin.isPermittedPaymentToken(usd.address)).to.equal(false);
      expect(
        await admin.isPermittedPaymentToken(constants.ZERO_ADDRESS)
      ).to.equal(false);

      await admin.setPermittedPaymentToken(token.address, true);
      await admin.setPermittedPaymentToken(usd.address, true);
      await admin.setPermittedPaymentToken(constants.ZERO_ADDRESS, true);

      expect(await admin.isPermittedPaymentToken(token.address)).to.equal(true);
      expect(await admin.isPermittedPaymentToken(usd.address)).to.equal(true);
      expect(
        await admin.isPermittedPaymentToken(constants.ZERO_ADDRESS)
      ).to.equal(true);
    });

    it("Set start time for staking pool", async () => {
      await staking.setStartTime(CURRENT);

      expect(await staking.startTime()).to.equal(CURRENT);
    });

    it("Buy NFT in marketplace to stake MTVS token", async () => {
      const current = await getCurrentTime();
      const leaves = [user1.address, user2.address].map(value =>
        keccak256(value)
      );
      merkleTree = new MerkleTree(leaves, keccak256, { sort: true });

      await token
        .connect(user2)
        .approve(mtvsManager.address, ONE_MILLION_ETHER);
      const rootHash = merkleTree.getHexRoot();
      await mtvsManager
        .connect(user2)
        .createNFT(
          0,
          1,
          "this_uri",
          1000,
          current + 10,
          current + 1000000,
          token.address,
          rootHash
        );
      await skipTime(1000);

      const leaf = keccak256(user1.address);
      const proof = merkleTree.getHexProof(leaf);
      await token.mint(user1.address, ONE_ETHER.mul(1000));
      await token.connect(user1).approve(orderManager.address, ONE_ETHER);
      await orderManager.connect(user1).buy(1, proof);
      await token.connect(user1).approve(staking.address, ONE_MILLION_ETHER);
      await token.connect(user3).approve(staking.address, ONE_MILLION_ETHER);
      await staking.connect(user1).stake(ONE_ETHER);
      // User3 cannot allow to stake because don't buy anything
      await expect(staking.connect(user3).stake(ONE_ETHER)).to.be.reverted;
    });
  });
});
