const hre = require("hardhat");
const ethers = hre.ethers;
const upgrades = hre.upgrades;
const contract = require("../contracts.json");
const contractVerify = require("../contracts-verify.json");

async function main() {
  //Loading accountscontract
  const accounts = await ethers.getSigners();
  const addresses = accounts.map(item => item.address);
  const owner = addresses[0];

  // Loading contract factory.
  const CollectionFactory = await ethers.getContractFactory(
    "CollectionFactory"
  );
  // Deploy contracts
  console.log(
    "========================================================================================="
  );
  console.log("DEPLOY CONTRACTS");
  console.log(
    "========================================================================================="
  );

  // Factory
  const collectionFactory = await upgrades.deployProxy(CollectionFactory, [
    contract.tokenERC721,
    contract.tokenERC1155,
    contract.admin,
    contract.admin,
    contract.metaDrop
  ]);

  await collectionFactory.deployed();
  console.log("CollectionFactory deployed in:", collectionFactory.address);

  const collectionFactoryVerify = await upgrades.erc1967.getImplementationAddress(
    collectionFactory.address
  );
  console.log("CollectionFactory verify deployed in:", collectionFactoryVerify);

  const contractAddresses = {
    ...contract,
    collectionFactory: collectionFactory.address
  };
  console.log("contract Address:", contractAddresses);
  await fs.writeFileSync("contracts.json", JSON.stringify(contractAddresses));

  const contractAddresses_verify = {
    ...contractVerify,
    collectionFactory: collectionFactoryVerify
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
