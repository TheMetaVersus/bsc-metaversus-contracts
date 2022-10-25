const hre = require("hardhat");
const fs = require("fs");
const ethers = hre.ethers;
const upgrades = hre.upgrades;
const { getImplementationAddress } = require("@openzeppelin/upgrades-core");
const provider = ethers.provider;
const contracts = require("../contracts.json");
const contractVerifies = require("../contracts-verify.json");

async function main() {
  const data = [
    {
      key: "mkpManager",
      name: "MarketPlaceManager"
    },
    {
      key: "collectionFactory",
      name: "CollectionFactory"
    }
  ];

  console.log(
    "=================================================================="
  );
  console.log("UPGRADE CONTRACTS");
  console.log(
    "=================================================================="
  );

  // Upgrading
  await Promise.all(
    data.map(async ({ key, name }) => {
      const ContractFactory = await ethers.getContractFactory(name);
      const contractProxy = await upgrades.upgradeProxy(
        contracts[key],
        ContractFactory
      );
      console.log(`${name} upgraded to:`, contractProxy.address);

      contractVerifies[key] = await getImplementationAddress(
        provider,
        contractProxy.address
      );
      console.log(
        `${name} current implementation address:`,
        contractVerifies[key]
      );
      console.log(
        "=================================================================="
      );
    })
  );

  await fs.writeFileSync(
    "contracts-verify.json",
    JSON.stringify(contractVerifies)
  );

  console.log("Upgrade done");
  console.log("Waiting for 10 seconds before verifying contract...");

  await new Promise(resolve => {
    setTimeout(async () => {
      // Verify contract
      console.log(
        "=================================================================="
      );
      console.log("VERIFY UPGRADE CONTRACTS");
      console.log(
        "=================================================================="
      );

      await Promise.all(
        data.map(({ key }) =>
          hre
            .run("verify:verify", {
              address: contracts[key]
            })
            .catch(console.log)
        )
      );

      resolve("Verify done");
    }, 5000);
  });
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
