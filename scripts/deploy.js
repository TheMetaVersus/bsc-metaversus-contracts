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
  const NFTMTVSTicket = await ethers.getContractFactory("NFTMTVSTicket");
  const MTVSManager = await ethers.getContractFactory("MetaversusManager");
  const MkpManager = await ethers.getContractFactory("MarketPlaceManager");
  const Staking = await ethers.getContractFactory("StakingPool");
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
    "Vetaversus Token",
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
    mtvs.address,
    treasury.address,
    250,
    process.env.CREATE_FEE
  ]);
  await tokenMintERC721.deployed();
  console.log("tokenMintERC721 deployed in:", tokenMintERC721.address);
  console.log(
    "========================================================================================="
  );

  const tokenMintERC1155 = await upgrades.deployProxy(TokenMintERC1155, [
    admin,
    "uri",
    mtvs.address,
    treasury.address,
    250,
    process.env.CREATE_FEE
  ]);
  await tokenMintERC1155.deployed();
  console.log("tokenMintERC1155 deployed in:", tokenMintERC1155.address);
  console.log(
    "========================================================================================="
  );

  const nftMTVSTicket = await upgrades.deployProxy(NFTMTVSTicket, [
    admin,
    "NFT Metaversus Ticket",
    "nftMTVS",
    mtvs.address,
    treasury.address,
    250,
    process.env.CREATE_MTVS_NFT_FEE
  ]);
  await nftMTVSTicket.deployed();
  console.log("nftMTVSTicket deployed in:", nftMTVSTicket.address);
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
    nftMTVSTicket.address,
    mtvs.address,
    treasury.address,
    mkpManager.address,
    process.env.CREATE_FEE,
    process.env.CREATE_MTVS_NFT_FEE,
    process.env.TICKET_EVENT_FEE
  ]);
  await mtvsManager.deployed();
  console.log("mtvsManager deployed in:", mtvsManager.address);
  console.log(
    "========================================================================================="
  );

  const staking = await upgrades.deployProxy(Staking, [
    admin,
    mtvs.address,
    mtvs.address,
    nftMTVSTicket.address,
    process.env.REWARD_RATE,
    process.env.POOL_DURATION
  ]);
  await staking.deployed();
  console.log("staking deployed in:", staking.address);

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
  const nftMTVSTicketVerify = await upgrades.erc1967.getImplementationAddress(
    nftMTVSTicket.address
  );
  console.log("nftMTVSTicketVerify deployed in:", nftMTVSTicketVerify);
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
  const stakingVerify = await upgrades.erc1967.getImplementationAddress(
    staking.address
  );
  console.log("stakingVerify deployed in:", stakingVerify);
  console.log(
    "========================================================================================="
  );
  const contractAddresses = {
    admin: admin,
    treasury: treasury.address,
    mtvs: mtvs.address,
    tokenMintERC721: tokenMintERC721.address,
    tokenMintERC1155: tokenMintERC1155.address,
    nftMTVSTicket: nftMTVSTicket.address,
    mtvsManager: mtvsManager.address,
    mkpManager: mkpManager.address,
    staking: staking.address
  };

  await fs.writeFileSync("contracts.json", JSON.stringify(contractAddresses));

  const contractAddresses_verify = {
    admin: admin,
    treasury: treasuryVerify,
    mtvs: mtvsVerify,
    tokenMintERC721: tokenMintERC721Verify,
    tokenMintERC1155: tokenMintERC1155Verify,
    nftMTVSTicket: nftMTVSTicketVerify,
    mtvsManager: mtvsManagerVerify,
    mkpManager: mkpManagerVerify,
    staking: stakingVerify
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
