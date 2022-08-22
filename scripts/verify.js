const hre = require("hardhat");
const contracts = require("../contracts-verify.json");

async function main() {
  try {
    await hre.run("verify:verify", {
      address: contracts.treasury,
      contract: "contracts/Token/Treasury.sol:Treasury"
    });
  } catch (err) {
    console.log("err :>> ", err);
  }
  try {
    await hre.run("verify:verify", {
      address: contracts.mtvs,
      contract: "contracts/Token/MTVS.sol:MTVS"
    });
  } catch (err) {
    console.log("err :>> ", err);
  }

  // try {
  //   await hre.run("verify:verify", {
  //     address: contracts.tokenMintERC721,
  //     contract: "contracts/Token/TokenMintERC721.sol:TokenMintERC721"
  //   });
  // } catch (err) {
  //   console.log("err :>> ", err);
  // }

  try {
    await hre.run("verify:verify", {
      address: contracts.tokenMintERC1155,
      contract: "contracts/Token/TokenMintERC1155.sol:TokenMintERC1155"
    });
  } catch (err) {
    console.log("err :>> ", err);
  }

  // try {
  //   await hre.run("verify:verify", {
  //     address: contracts.nftMTVSTicket,
  //     contract: "contracts/Token/NFTMTVSTicket.sol:NFTMTVSTicket"
  //   });
  // } catch (err) {
  //   console.log("err :>> ", err);
  // }

  // try {
  //   await hre.run("verify:verify", {
  //     address: contracts.mtvsManager,
  //     contract: "contracts/Marketplace/MetaversusManager.sol:MetaversusManager"
  //   });
  // } catch (err) {
  //   console.log("err :>> ", err);
  // }

  // try {
  //   await hre.run("verify:verify", {
  //     address: contracts.mkpManager,
  //     contract:
  //       "contracts/Marketplace/MarketplaceManager.sol:MarketPlaceManager"
  //   });
  // } catch (err) {
  //   console.log("err :>> ", err);
  // }

  // try {
  //   await hre.run("verify:verify", {
  //     address: contracts.staking30d,
  //     contract: "contracts/StakingPool/StakingPool.sol:StakingPool"
  //   });
  // } catch (err) {
  //   console.log("err :>> ", err);
  // }

  // try {
  //   await hre.run("verify:verify", {
  //     address: contracts.staking60d,
  //     contract: "contracts/StakingPool/StakingPool.sol:StakingPool"
  //   });
  // } catch (err) {
  //   console.log("err :>> ", err);
  // }

  // try {
  //   await hre.run("verify:verify", {
  //     address: contracts.staking90d,
  //     contract: "contracts/StakingPool/StakingPool.sol:StakingPool"
  //   });
  // } catch (err) {
  //   console.log("err :>> ", err);
  // }

  // try {
  //   await hre.run("verify:verify", {
  //     address: contracts.staking,
  //     contract: "contracts/StakingPool/StakingPool.sol:StakingPool"
  //   });
  // } catch (err) {
  //   console.log("err :>> ", err);
  // }

  // try {
  //   await hre.run("verify:verify", {
  //     address: contracts.poolFactory,
  //     contract: "contracts/StakingPool/PoolFactory.sol:PoolFactory"
  //   });
  // } catch (err) {
  //   console.log("err :>> ", err);
  // }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
