const hre = require("hardhat");
const contracts = require("../contracts.json");

async function main() {
  // Verify contracts
  console.log(
    "========================================================================================="
  );
  console.log("VERIFY CONTRACTS");
  console.log(
    "========================================================================================="
  );

  try {
    await hre.run("verify:verify", {
      address: contracts.mtvs,
      constructorArguments: [
        "Metaversus Token",
        "MTVS",
        process.env.TOTAL_SUPPLY,
        contracts.treasury
      ]
    });
  } catch (err) {
    console.log("err :>> ", err);
  }

  for (key in contracts)
    await hre
      .run("verify:verify", {
        address: contracts[key]
      })
      .catch(console.log);
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
