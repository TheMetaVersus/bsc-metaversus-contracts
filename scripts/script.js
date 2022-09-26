const { ethers, Wallet, Contract } = require("ethers");
const contract = require("../contracts.json");
const mkpManagerABI = require("../artifacts/contracts/Marketplace/MarketplaceManager.sol/MarketPlaceManager.json");
const mtvsManagerABI = require("../artifacts/contracts/Marketplace/MetaversusManager.sol/MetaversusManager.json");
let provider = new ethers.providers.JsonRpcProvider(
  "https://data-seed-prebsc-1-s1.binance.org:8545/"
);

let walletPK = `${process.env.DEPLOY_ACCOUNT}`;

const wallet = new Wallet(walletPK, provider);

const mkpManager = new Contract(contract.mkpManager, mkpManagerABI.abi, wallet);

const mtvsManager = new Contract(
  contract.mtvsManager,
  mtvsManagerABI.abi,
  wallet
);

const createNFT = async (
  nftType,
  amount,
  uri,
  price,
  startTime,
  endTime,
  paymentToken
) => {
  await mtvsManager.createNFT(
    nftType,
    amount,
    uri,
    price,
    startTime,
    endTime,
    paymentToken
  );
};
const main = async () => {
  const startTime = new Date.now() / 1000;
  const endTime = startTime + 86400; // 1 days
  const paymentToken = "0x0000000000000000000000000000000000000000";
  // create NFT mint and Sale
  await mtvsManager.createNFT(
    1,
    1000,
    "uri",
    ethers.utils.parseEther("1"),
    startTime,
    endTime,
    paymentToken
  );
};

// Run the arbitrage and output the result or error
main();
//   .then(console.log)
//   .catch(console.error);
