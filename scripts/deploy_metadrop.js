const hre = require("hardhat");
const ethers = hre.ethers;
const upgrades = hre.upgrades;
const contract = require("../contracts.json");
const contractVerify = require("../contracts-verify.json");

async function main() {
  // Loading contract factory.
  const MetaDrop = await ethers.getContractFactory("MetaDrop");

  // Deploy contracts
  console.log(
    "========================================================================================="
  );
  console.log("DEPLOY CONTRACTS");
  console.log(
    "========================================================================================="
  );

  const metaDrop = await upgrades.deployProxy(MetaDrop, [
    contract.admin,
    (process.env.DEFAULT_SERVICE_NUMERATOR = 100000)
  ]);

  await metaDrop.deployed();
  console.log("MetaDrop deployed in:", metaDrop.address);

  const metaDropVerify = await upgrades.erc1967.getImplementationAddress(
    metaDrop.address
  );
  console.log("MetaDrop verify deployed in:", metaDropVerify);

  const contractAddresses = {
    ...contract,
    metaDrop: metaDrop.address
  };
  console.log("contract Address:", contractAddresses);
  await fs.writeFileSync("contracts.json", JSON.stringify(contractAddresses));

  const contractAddresses_verify = {
    ...contractVerify,
    metaDrop: metaDropVerify
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
