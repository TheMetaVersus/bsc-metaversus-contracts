const hre = require("hardhat");
const fs = require("fs");
const ethers = hre.ethers;
const upgrades = hre.upgrades;

async function main() {
  //Loading accounts
  const accounts = await ethers.getSigners();
  const addresses = accounts.map(item => item.address);
  const admin = addresses[0];

  // Loading contract factory.
  const MTVS = await ethers.getContractFactory("MTVS");
  const Treasury = await ethers.getContractFactory("Treasury");
  const TokenMintERC721 = await ethers.getContractFactory("TokenMintERC721");
  const TokenMintERC1155 = await ethers.getContractFactory("TokenMintERC1155");

  const MTVSManager = await ethers.getContractFactory("MetaversusManager");
  const MkpManager = await ethers.getContractFactory("MarketPlaceManager");
  const Staking = await ethers.getContractFactory("StakingPool");
  const PoolFactory = await ethers.getContractFactory("PoolFactory");
  // Deploy contracts
  console.log(
    "========================================================================================="
  );
  console.log("DEPLOY CONTRACTS");
  console.log(
    "========================================================================================="
  );

  const treasury = await upgrades.deployProxy(Treasury, [admin]);
  await treasury.deployed();

  const mtvs = await upgrades.deployProxy(MTVS, [
    admin,
    "Metaversus Token",
    "MTVS",
    process.env.TOTAL_SUPPLY,
    treasury.address
  ]);
  await mtvs.deployed();
  console.log("mtvs deployed in:", mtvs.address);
  console.log(
    "========================================================================================="
  );

  const tokenMintERC721 = await upgrades.deployProxy(TokenMintERC721, [
    admin,
    "NFT Metaversus",
    "nMTVS",
    treasury.address,
    250
  ]);
  await tokenMintERC721.deployed();
  console.log("tokenMintERC721 deployed in:", tokenMintERC721.address);
  console.log(
    "========================================================================================="
  );

  const tokenMintERC1155 = await upgrades.deployProxy(TokenMintERC1155, [
    admin,
    treasury.address,
    250
  ]);
  await tokenMintERC1155.deployed();
  console.log("tokenMintERC1155 deployed in:", tokenMintERC1155.address);
  console.log(
    "========================================================================================="
  );

  const mkpManager = await upgrades.deployProxy(MkpManager, [
    admin,
    mtvs.address,
    treasury.address
  ]);
  await mkpManager.deployed();
  console.log("mkpManager deployed in:", mkpManager.address);
  console.log(
    "========================================================================================="
  );

  const mtvsManager = await upgrades.deployProxy(MTVSManager, [
    admin,
    tokenMintERC721.address,
    tokenMintERC1155.address,
    mtvs.address,
    treasury.address,
    mkpManager.address,
    process.env.CREATE_FEE
  ]);
  await mtvsManager.deployed();
  console.log("mtvsManager deployed in:", mtvsManager.address);
  console.log(
    "========================================================================================="
  );

  // const staking30d = await upgrades.deployProxy(Staking, [
  //   admin,
  //   mtvs.address,
  //   mtvs.address,
  //   mkpManager.address,
  //   process.env.REWARD_RATE_30_DAY,
  //   process.env.POOL_DURATION_30_DAY,
  //   process.env.PANCAKE_ROUTER,
  //   process.env.BUSD_TOKEN
  // ]);
  // await staking30d.deployed();
  // console.log("staking30d deployed in:", staking30d.address);

  // const staking60d = await upgrades.deployProxy(Staking, [
  //   admin,
  //   mtvs.address,
  //   mtvs.address,
  //   mkpManager.address,
  //   process.env.REWARD_RATE_60_DAY,
  //   process.env.POOL_DURATION_60_DAY,
  //   process.env.PANCAKE_ROUTER,
  //   process.env.BUSD_TOKEN
  // ]);
  // await staking60d.deployed();
  // console.log("staking60d deployed in:", staking60d.address);

  // const staking90d = await upgrades.deployProxy(Staking, [
  //   admin,
  //   mtvs.address,
  //   mtvs.address,
  //   mkpManager.address,
  //   process.env.REWARD_RATE_90_DAY,
  //   process.env.POOL_DURATION_90_DAY,
  //   process.env.PANCAKE_ROUTER,
  //   process.env.BUSD_TOKEN
  // ]);
  // await staking90d.deployed();
  // console.log("staking90d deployed in:", staking90d.address);

  // Factory Pool
  const staking = await Staking.deploy();
  console.log("staking template deployed in:", staking.address);
  const poolFactory = await upgrades.deployProxy(PoolFactory, [
    staking.address
  ]);
  await poolFactory.deployed();
  console.log("PoolFactory deployed in:", poolFactory.address);

  const tx_pool30d = await poolFactory.create(
    admin,
    mtvs.address,
    mtvs.address,
    mkpManager.address,
    process.env.REWARD_RATE_30_DAY,
    process.env.POOL_DURATION_30_DAY,
    process.env.PANCAKE_ROUTER,
    process.env.BUSD_TOKEN
  );

  await tx_pool30d.wait();

  const tx_pool60d = await poolFactory.create(
    admin,
    mtvs.address,
    mtvs.address,
    mkpManager.address,
    process.env.REWARD_RATE_60_DAY,
    process.env.POOL_DURATION_60_DAY,
    process.env.PANCAKE_ROUTER,
    process.env.BUSD_TOKEN
  );

  await tx_pool60d.wait();
  const tx_pool90d = await poolFactory.create(
    admin,
    mtvs.address,
    mtvs.address,
    mkpManager.address,
    process.env.REWARD_RATE_90_DAY,
    process.env.POOL_DURATION_90_DAY,
    process.env.PANCAKE_ROUTER,
    process.env.BUSD_TOKEN
  );

  await tx_pool90d.wait();

  const all = await poolFactory.getAllPool();
  console.log(all);

  console.log(
    "========================================================================================="
  );

  console.log("VERIFY ADDRESSES");
  console.log(
    "========================================================================================="
  );
  const treasuryVerify = await upgrades.erc1967.getImplementationAddress(
    treasury.address
  );
  console.log("treasuryVerify deployed in:", treasuryVerify);
  console.log(
    "========================================================================================="
  );
  const mtvsVerify = await upgrades.erc1967.getImplementationAddress(
    mtvs.address
  );
  console.log("mtvsVerify deployed in:", mtvsVerify);
  console.log(
    "========================================================================================="
  );
  const tokenMintERC721Verify = await upgrades.erc1967.getImplementationAddress(
    tokenMintERC721.address
  );
  console.log("tokenMintERC721Verify deployed in:", tokenMintERC721Verify);
  console.log(
    "========================================================================================="
  );
  const tokenMintERC1155Verify = await upgrades.erc1967.getImplementationAddress(
    tokenMintERC1155.address
  );
  console.log("tokenMintERC1155Verify deployed in:", tokenMintERC1155Verify);
  console.log(
    "========================================================================================="
  );
  const mtvsManagerVerify = await upgrades.erc1967.getImplementationAddress(
    mtvsManager.address
  );
  console.log("mtvsManagerVerify deployed in:", mtvsManagerVerify);
  console.log(
    "========================================================================================="
  );
  const mkpManagerVerify = await upgrades.erc1967.getImplementationAddress(
    mkpManager.address
  );
  console.log("mkpManagerVerify deployed in:", mkpManagerVerify);
  console.log(
    "========================================================================================="
  );
  // const staking30dVerify = await upgrades.erc1967.getImplementationAddress(
  //   staking30d.address
  // );
  // console.log("staking30dVerify deployed in:", staking30dVerify);
  // console.log(
  //   "========================================================================================="
  // );
  // const staking60dVerify = await upgrades.erc1967.getImplementationAddress(
  //   staking60d.address
  // );
  // console.log("staking60dVerify deployed in:", staking60dVerify);
  // console.log(
  //   "========================================================================================="
  // );
  // const staking90dVerify = await upgrades.erc1967.getImplementationAddress(
  //   staking90d.address
  // );
  // console.log("staking90dVerify deployed in:", staking90dVerify);
  console.log(
    "========================================================================================="
  );
  const poolFactoryVerify = await upgrades.erc1967.getImplementationAddress(
    poolFactory.address
  );
  console.log("poolFactoryVerify deployed in:", poolFactoryVerify);
  console.log(
    "========================================================================================="
  );
  const contractAddresses = {
    admin: admin,
    treasury: treasury.address,
    mtvs: mtvs.address,
    tokenMintERC721: tokenMintERC721.address,
    tokenMintERC1155: tokenMintERC1155.address,
    mtvsManager: mtvsManager.address,
    mkpManager: mkpManager.address,
    staking30d: all[0]["poolAddress"],
    staking60d: all[1]["poolAddress"],
    staking90d: all[2]["poolAddress"],
    staking: staking.address,
    poolFactory: poolFactory.address
  };
  console.log("contract Address:", contractAddresses);
  await fs.writeFileSync("contracts.json", JSON.stringify(contractAddresses));

  const contractAddresses_verify = {
    admin: admin,
    treasury: treasuryVerify,
    mtvs: mtvsVerify,
    tokenMintERC721: tokenMintERC721Verify,
    tokenMintERC1155: tokenMintERC1155Verify,
    mtvsManager: mtvsManagerVerify,
    mkpManager: mkpManagerVerify,
    // staking30d: staking30dVerify,
    // staking60d: staking60dVerify,
    // staking90d: staking90dVerify,
    staking: staking.address,
    poolFactory: poolFactoryVerify
  };

  await fs.writeFileSync(
    "contracts-verify.json",
    JSON.stringify(contractAddresses_verify)
  );
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
