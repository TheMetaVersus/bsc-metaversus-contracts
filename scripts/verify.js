const hre = require("hardhat");
const contracts = require("../contracts-verify.json");

async function main() {
  try {
    await hre.run("verify:verify", {
      address: contracts.mtvs,
      contract: "contracts/Token/MTVS.sol:MTVS"
    });
  } catch (err) {
    console.log("err :>> ", err);
  }

  try {
    await hre.run("verify:verify", {
      address: contracts.tokenMintERC721,
      contract: "contracts/Token/tokenMintERC721.sol:tokenMintERC721"
    });
  } catch (err) {
    console.log("err :>> ", err);
  }

  try {
    await hre.run("verify:verify", {
      address: contracts.tokenMintERC1155,
      contract: "contracts/Token/tokenMintERC1155.sol:tokenMintERC1155"
    });
  } catch (err) {
    console.log("err :>> ", err);
  }

  try {
    await hre.run("verify:verify", {
      address: contracts.nftMTVSTicket,
      contract: "contracts/Token/nftMTVSTicket.sol:nftMTVSTicket"
    });
  } catch (err) {
    console.log("err :>> ", err);
  }

  try {
    await hre.run("verify:verify", {
      address: contracts.mtvsManager,
      contract: "contracts/Marketplace/MetaversusManager.sol:MetaversusManager"
    });
  } catch (err) {
    console.log("err :>> ", err);
  }

  try {
    await hre.run("verify:verify", {
      address: contracts.mkpManager,
      contract:
        "contracts/Marketplace/MarketplaceManager.sol:MarketPlaceManager"
    });
  } catch (err) {
    console.log("err :>> ", err);
  }

  try {
    await hre.run("verify:verify", {
      address: contracts.staking,
      contract: "contracts/StakingPool/StakingPool.sol:StakingPool"
    });
  } catch (err) {
    console.log("err :>> ", err);
  }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
