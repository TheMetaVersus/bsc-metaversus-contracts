const hre = require("hardhat");
const fs = require("fs");
const ethers = hre.ethers;
const upgrades = hre.upgrades;
async function main() {
  //Loading accounts
  const accounts = await ethers.getSigners();
  const owner = accounts[0];

  // Loading contract factory
  const Admin = await ethers.getContractFactory("Admin");
  // Deploy contracts
  console.log(
    "========================================================================================="
  );
  console.log("DEPLOY CONTRACTS");
  console.log(
    "========================================================================================="
  );

  const admin = await upgrades.deployProxy(Admin, [owner.address]);
  await admin.deployed();

  console.log(
    "========================================================================================="
  );
  console.log("DEPLOY DONE");
  console.log(
    "========================================================================================="
  );

  const contractAddresses = {
    admin: admin.address
  };
  console.log("contract Address:", contractAddresses);
  await fs.writeFileSync("contracts.json", JSON.stringify(contractAddresses));
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
