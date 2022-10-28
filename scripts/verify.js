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
