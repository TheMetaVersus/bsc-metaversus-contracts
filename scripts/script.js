const { ethers, Wallet, Contract } = require("ethers");

const mkpManagerABI = require("../artifacts/contracts/Marketplace/MarketplaceManager.sol/MarketPlaceManager.json");

let provider = ethers.getDefaultProvider(
  "https://data-seed-prebsc-1-s1.binance.org:8545/"
);

let walletPK = `0xf52c711fa24e38284f7e90e3d1d19633932c4012a849c45b0c790dfc1d2ef0b7`;

const wallet = new Wallet(walletPK, provider);

const mkpManager = new Contract(
  "0xD8A3EBC195D18b7bb70716B53C2807e2eC46B7fD",
  mkpManagerABI.abi,
  wallet
);

const main = async () => {
  const data = await mkpManager.fetchAvailableMarketItems();
  console.log("all market items: ", data);
};

// Run the arbitrage and output the result or error
main();
//   .then(console.log)
//   .catch(console.error);
