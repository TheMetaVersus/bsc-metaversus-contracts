const hre = require("hardhat");
const ethers = hre.ethers;
const upgrades = hre.upgrades;
const contract = require("../contracts.json");
const contractVerify = require("../contracts-verify.json");

async function main() {
  const MTVSManager = await ethers.getContractFactory("MetaversusManager");
  // Deploy contracts
  console.log(
    "========================================================================================="
  );
  console.log("DEPLOY CONTRACTS");
  console.log(
    "========================================================================================="
  );

  const mtvsManager = await upgrades.deployProxy(MTVSManager, [
    contract.tokenMintERC721,
    contract.tokenMintERC1155,
    contract.mtvs,
    mkpManager.address,
    contract.collectionFactory,
    contract.admin
  ]);
  await mtvsManager.deployed();
  console.log("mtvsManager deployed in:", mtvsManager.address);
  console.log(
    "========================================================================================="
  );

  const mtvsManagerVerify = await upgrades.erc1967.getImplementationAddress(
    mtvsManager.address
  );
  console.log("mtvsManagerVerify deployed in:", mtvsManagerVerify);

  const contractAddresses = {
    ...contract,
    mtvsManager: mtvsManager.address
  };
  console.log("contract Address:", contractAddresses);
  await fs.writeFileSync("contracts.json", JSON.stringify(contractAddresses));

  const contractAddresses_verify = {
    ...contractVerify,
    mtvsManager: mtvsManagerVerify
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
