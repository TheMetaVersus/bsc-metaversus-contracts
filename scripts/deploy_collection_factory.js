const hre = require("hardhat");
const ethers = hre.ethers;
const upgrades = hre.upgrades;

async function main() {
  //Loading accounts
  const accounts = await ethers.getSigners();
  const addresses = accounts.map(item => item.address);
  const admin = addresses[0];

  const tokenERC721 = "0xA9A1E0617c7607940B45D2052a5Dedc1a5f20DF3"; // testnet = 0xA9A1E0617c7607940B45D2052a5Dedc1a5f20DF3; mainnet = ;
  const tokenERC1155 = "0xC492b1eeA6dE03CeaF02cb139a2d794a35234DE6"; // testnet = 0xC492b1eeA6dE03CeaF02cb139a2d794a35234DE6; mainnet = ;
  // const adminValidate = "0x65D752d6DDB57a688561F92acc6b6b43e8Ff420c"; // testnet = 0x65D752d6DDB57a688561F92acc6b6b43e8Ff420c; mainnet = ;

  // Loading contract factory.
  const CollectionFactory = await ethers.getContractFactory("CollectionFactory");
  // Deploy contracts
  console.log("=======================================================");
  console.log("DEPLOY CONTRACTS");
  console.log("=======================================================");

  const Admin = await ethers.getContractFactory("Admin");
  // Deploy contracts
  console.log(
    "========================================================================================="
  );
  console.log("DEPLOY CONTRACTS");
  console.log(
    "========================================================================================="
  );

  const adminValidate = await upgrades.deployProxy(Admin, [admin]);
  await adminValidate.deployed();

  console.log("adminValidate: ", adminValidate.address);

  // Factory
  const collectionFactory = await upgrades.deployProxy(CollectionFactory, [
    tokenERC721, tokenERC1155, adminValidate.address
  ]);

  await collectionFactory.deployed();
  console.log("CollectionFactory deployed in:", collectionFactory.address);

  const collectionFactoryVerify = await upgrades.erc1967.getImplementationAddress(
    collectionFactory.address
  );
  console.log("CollectionFactory verify deployed in:", collectionFactoryVerify);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
