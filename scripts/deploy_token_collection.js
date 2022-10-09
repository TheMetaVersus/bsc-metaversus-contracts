const hre = require("hardhat");
const ethers = hre.ethers;
const contract = require("../contracts.json");

async function main() {
  // Loading contract factory.
  const TokenERC721 = await ethers.getContractFactory("TokenERC721");
  const TokenERC1155 = await ethers.getContractFactory("TokenERC1155");

  // Deploy contracts
  console.log("=======================================================");
  console.log("DEPLOY CONTRACTS");
  console.log("=======================================================");

  const tokenERC721 = await TokenERC721.deploy();
  console.log("TokenERC721 template deployed in:", tokenERC721.address);

  const tokenERC1155 = await TokenERC1155.deploy();
  console.log("TokenERC1155 template deployed in:", tokenERC1155.address);

  const contractAddresses = {
    ...contract,
    tokenERC721: tokenERC721.address,
    tokenERC1155: tokenERC1155.address
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
