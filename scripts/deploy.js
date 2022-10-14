const hre = require("hardhat");
const fs = require("fs");
const ethers = hre.ethers;
const upgrades = hre.upgrades;
async function main() {
  //Loading accounts
  const accounts = await ethers.getSigners();
  const addresses = accounts.map(item => item.address);
  const owner = addresses[0];

  // Loading contract factory.
  const USD = await ethers.getContractFactory("USD");
  const MTVS = await ethers.getContractFactory("MTVS");
  const Treasury = await ethers.getContractFactory("Treasury");
  const MetaCitizen = await ethers.getContractFactory("MetaCitizen");
  const TokenMintERC721 = await ethers.getContractFactory("TokenMintERC721");
  const TokenMintERC1155 = await ethers.getContractFactory("TokenMintERC1155");
  const TokenERC721 = await ethers.getContractFactory("TokenERC721");
  const TokenERC1155 = await ethers.getContractFactory("TokenERC1155");

  const CollectionFactory = await ethers.getContractFactory(
    "CollectionFactory"
  );
  const MTVSManager = await ethers.getContractFactory("MetaversusManager");
  const MkpManager = await ethers.getContractFactory("MarketPlaceManager");
  const Staking = await ethers.getContractFactory("StakingPool");
  const PoolFactory = await ethers.getContractFactory("PoolFactory");
  const MetaDrop = await ethers.getContractFactory("MetaDrop");
  // Deploy contracts
  console.log(
    "========================================================================================="
  );
  console.log("DEPLOY CONTRACTS");
  console.log(
    "========================================================================================="
  );

  const Admin = await ethers.getContractFactory("Admin");
  const admin = await upgrades.deployProxy(Admin, [owner]);
  await admin.deployed();
  console.log("admin deployed in:", admin.address);
  console.log(
    "========================================================================================="
  );
  const treasury = await upgrades.deployProxy(Treasury, [admin.address]);
  await treasury.deployed();

  console.log("treasury deployed in:", treasury.address);
  console.log(
    "========================================================================================="
  );
  const mtvs = await upgrades.deployProxy(MTVS, [
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

  const mkpManager = await upgrades.deployProxy(MkpManager, [admin.address]);
  await mkpManager.deployed();

  console.log("mkpManager deployed in:", mkpManager.address);
  console.log(
    "========================================================================================="
  );

  // Factory Pool
  const staking = await Staking.deploy();
  console.log("staking template deployed in:", staking.address);
  console.log(
    "========================================================================================="
  );
  const poolFactory = await upgrades.deployProxy(PoolFactory, [
    staking.address,
    admin.address
  ]);
  await poolFactory.deployed();
  console.log("PoolFactory deployed in:", poolFactory.address);
  console.log(
    "========================================================================================="
  );
  const tx_pool30d = await poolFactory.create(
    mtvs.address,
    mtvs.address,
    mkpManager.address,
    process.env.REWARD_RATE_30_DAY,
    process.env.POOL_DURATION_30_DAY,
    process.env.PANCAKE_ROUTER,
    process.env.BUSD_TOKEN,
    process.env.EACA_AGGREGATOR_BUSD_USD_TESTNET
  );

  await tx_pool30d.wait();
  let all = await poolFactory.getAllPool();
  console.log("Pool 30 days deployed", all[0]["poolAddress"]);
  console.log(
    "========================================================================================="
  );
  const tx_pool60d = await poolFactory.create(
    mtvs.address,
    mtvs.address,
    mkpManager.address,
    process.env.REWARD_RATE_60_DAY,
    process.env.POOL_DURATION_60_DAY,
    process.env.PANCAKE_ROUTER,
    process.env.BUSD_TOKEN,
    process.env.EACA_AGGREGATOR_BUSD_USD_TESTNET
  );

  await tx_pool60d.wait();
  all = await poolFactory.getAllPool();
  console.log("Pool 60 days deployed", all[1]["poolAddress"]);
  console.log(
    "========================================================================================="
  );
  const tx_pool90d = await poolFactory.create(
    mtvs.address,
    mtvs.address,
    mkpManager.address,
    process.env.REWARD_RATE_90_DAY,
    process.env.POOL_DURATION_90_DAY,
    process.env.PANCAKE_ROUTER,
    process.env.BUSD_TOKEN,
    process.env.EACA_AGGREGATOR_BUSD_USD_TESTNET
  );

  await tx_pool90d.wait();
  all = await poolFactory.getAllPool();
  console.log("Pool 90 days deployed", all[2]["poolAddress"]);
  console.log(
    "========================================================================================="
  );

  const usd = await upgrades.deployProxy(USD, [
    admin.address,
    "USD Token Test",
    "USD",
    process.env.TOTAL_SUPPLY,
    treasury.address
  ]);
  await usd.deployed();
  console.log("usd deployed in:", usd.address);
  console.log(
    "========================================================================================="
  );
  // Set permitted token
  let tx = await admin.setPermittedPaymentToken(process.env.ZERO_ADDRESS, true);
  await tx.wait();
  tx = await admin.setPermittedPaymentToken(mtvs.address, true);
  await tx.wait();
  tx = await admin.setPermittedPaymentToken(usd.address, true);
  await tx.wait();

  const metaCitizen = await upgrades.deployProxy(MetaCitizen, [
    mtvs.address,
    process.env.MINT_FEE,
    admin.address
  ]);
  await metaCitizen.deployed();

  console.log("metaCitizen deployed in:", metaCitizen.address);
  console.log(
    "========================================================================================="
  );
  const tokenMintERC721 = await upgrades.deployProxy(TokenMintERC721, [
    "NFT Metaversus",
    "nMTVS",
    250,
    admin.address
  ]);
  await tokenMintERC721.deployed();

  console.log("tokenMintERC721 deployed in:", tokenMintERC721.address);
  console.log(
    "========================================================================================="
  );

  const tokenMintERC1155 = await upgrades.deployProxy(TokenMintERC1155, [
    250,
    admin.address
  ]);
  await tokenMintERC1155.deployed();

  console.log("tokenMintERC1155 deployed in:", tokenMintERC1155.address);
  console.log(
    "========================================================================================="
  );

  const tokenERC721 = await TokenERC721.deploy();
  console.log("TokenERC721 template deployed in:", tokenERC721.address);
  console.log(
    "========================================================================================="
  );
  const tokenERC1155 = await TokenERC1155.deploy();
  console.log("TokenERC1155 template deployed in:", tokenERC1155.address);
  console.log(
    "========================================================================================="
  );
  const metaDrop = await upgrades.deployProxy(MetaDrop, [
    admin.address,
    (process.env.DEFAULT_SERVICE_NUMERATOR = 100000)
  ]);

  await metaDrop.deployed();
  console.log("MetaDrop deployed in:", metaDrop.address);
  console.log(
    "========================================================================================="
  );
  const collectionFactory = await upgrades.deployProxy(CollectionFactory, [
    tokenERC721.address,
    tokenERC1155.address,
    admin.address,
    admin.address,
    metaDrop.address
  ]);

  await collectionFactory.deployed();
  console.log("CollectionFactory deployed in:", collectionFactory.address);
  console.log(
    "========================================================================================="
  );
  const mtvsManager = await upgrades.deployProxy(MTVSManager, [
    tokenMintERC721.address,
    tokenMintERC1155.address,
    mtvs.address,
    mkpManager.address,
    collectionFactory.address,
    admin.address
  ]);
  await mtvsManager.deployed();
  console.log("mtvsManager deployed in:", mtvsManager.address);
  console.log(
    "========================================================================================="
  );

  const OrderManager = await ethers.getContractFactory("OrderManager");
  const orderManager = await upgrades.deployProxy(OrderManager, [
    mkpManager.address,
    admin.address
  ]);
  await orderManager.deployed();
  console.log("OrderManager deployed in:", orderManager.address);
  console.log(
    "========================================================================================="
  );
  console.log("VERIFY ADDRESSES");
  console.log(
    "========================================================================================="
  );
  const adminVerify = await upgrades.erc1967.getImplementationAddress(
    admin.address
  );
  console.log("Admin verify deployed in:", adminVerify);
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
  const usdVerify = await upgrades.erc1967.getImplementationAddress(
    usd.address
  );
  console.log("usdVerify deployed in:", usdVerify);
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
  const metaCitizenVerify = await upgrades.erc1967.getImplementationAddress(
    metaCitizen.address
  );
  console.log("metaCitizenVerify deployed in:", metaCitizenVerify);
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
  const collectionFactoryVerify = await upgrades.erc1967.getImplementationAddress(
    collectionFactory.address
  );
  console.log("CollectionFactory verify deployed in:", collectionFactoryVerify);
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
  const poolFactoryVerify = await upgrades.erc1967.getImplementationAddress(
    poolFactory.address
  );
  console.log("poolFactoryVerify deployed in:", poolFactoryVerify);
  console.log(
    "========================================================================================="
  );
  const metaDropVerify = await upgrades.erc1967.getImplementationAddress(
    metaDrop.address
  );
  console.log("MetaDrop verify deployed in:", metaDropVerify);
  console.log(
    "========================================================================================="
  );
  const orderManagerVerify = await upgrades.erc1967.getImplementationAddress(
    orderManager.address
  );
  console.log("OrderManager verify deployed in:", orderManagerVerify);
  console.log(
    "========================================================================================="
  );
  // Preparation
  tx = await admin.setAdmin(mtvsManager.address, true);
  await tx.wait();
  console.log("setAdmin done !");
  tx = await mkpManager.setMetaversusManager(mtvsManager.address);
  await tx.wait();
  console.log("setMetaversusManager done !");
  tx = await mkpManager.setOrderManager(orderManager.address);
  await tx.wait();
  console.log("setOrderManager done !");
  tx = await collectionFactory.setMetaversusManager(mtvsManager.address);
  await tx.wait();
  console.log("setMetaversusManager done !");

  const contractAddresses = {
    admin: admin.address,
    mtvs: mtvs.address,
    treasury: treasury.address,
    tokenMintERC721: tokenMintERC721.address,
    tokenMintERC1155: tokenMintERC1155.address,
    tokenERC721: tokenERC721.address,
    tokenERC1155: tokenERC1155.address,
    mtvsManager: mtvsManager.address,
    mkpManager: mkpManager.address,
    staking30d: all[0]["poolAddress"],
    staking60d: all[1]["poolAddress"],
    staking90d: all[2]["poolAddress"],
    staking: staking.address,
    poolFactory: poolFactory.address,
    collectionFactory: collectionFactory.address,
    metaDrop: metaDrop.address,
    orderManager: orderManager.address,
    metaCitizen: metaCitizen.address
  };
  console.log("contract Address:", contractAddresses);
  await fs.writeFileSync("contracts.json", JSON.stringify(contractAddresses));

  const contractAddresses_verify = {
    admin: adminVerify,
    treasury: treasuryVerify,
    mtvs: mtvsVerify,
    tokenMintERC721: tokenMintERC721Verify,
    tokenMintERC1155: tokenMintERC1155Verify,
    tokenERC721: tokenERC721.address,
    tokenERC1155: tokenERC1155.address,
    mtvsManager: mtvsManagerVerify,
    mkpManager: mkpManagerVerify,
    staking: staking.address,
    poolFactory: poolFactoryVerify,
    collectionFactory: collectionFactoryVerify,
    metaDrop: metaDropVerify,
    orderManager: orderManagerVerify,
    metaCitizen: metaCitizenVerify
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
