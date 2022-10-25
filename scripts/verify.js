const hre = require("hardhat");
const contracts = require("../contracts.json");

async function main() {
  try {
    await hre.run("verify:verify", {
      address: contracts.admin
    });
  } catch (err) {
    console.log("err :>> ", err);
  }
  try {
    await hre.run("verify:verify", {
      address: contracts.treasury
    });
  } catch (err) {
    console.log("err :>> ", err);
  }
  try {
    await hre.run("verify:verify", {
      address: contracts.usd
    });
  } catch (err) {
    console.log("err :>> ", err);
  }
  try {
    await hre.run("verify:verify", {
      address: contracts.mtvs
    });
  } catch (err) {
    console.log("err :>> ", err);
  }

  try {
    await hre.run("verify:verify", {
      address: contracts.tokenMintERC721
    });
  } catch (err) {
    console.log("err :>> ", err);
  }

  try {
    await hre.run("verify:verify", {
      address: contracts.tokenMintERC1155
    });
  } catch (err) {
    console.log("err :>> ", err);
  }

  try {
    await hre.run("verify:verify", {
      address: contracts.mtvsManager
    });
  } catch (err) {
    console.log("err :>> ", err);
  }

  try {
    await hre.run("verify:verify", {
      address: contracts.mkpManager
    });
  } catch (err) {
    console.log("err :>> ", err);
  }

  try {
    await hre.run("verify:verify", {
      address: contracts.staking
    });
  } catch (err) {
    console.log("err :>> ", err);
  }

  try {
    await hre.run("verify:verify", {
      address: contracts.poolFactory
    });
  } catch (err) {
    console.log("err :>> ", err);
  }
  try {
    await hre.run("verify:verify", {
      address: contracts.metaDrop
    });
  } catch (err) {
    console.log("err :>> ", err);
  }
  try {
    await hre.run("verify:verify", {
      address: contracts.orderManager
    });
  } catch (err) {
    console.log("err :>> ", err);
  }
  try {
    await hre.run("verify:verify", {
      address: contracts.metaCitizen
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
