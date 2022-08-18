const { ethers, Wallet, Contract } = require("ethers");

// const mkpManagerABI = require("../artifacts/contracts/Marketplace/MarketplaceManager.sol/MarketPlaceManager.json");

let provider = new ethers.providers.JsonRpcProvider(
  "https://data-seed-prebsc-1-s1.binance.org:8545/"
);

let walletPK = `b7cd559ad9762a7930399023a28e8ec11a10b71e0264a23082334fe29a7d0ced`;

const wallet = new Wallet(walletPK, provider);

// const mkpManager = new Contract(
//   "0xf645c0fe03d5f3c11f0d88854CBC54277C2004e8",
//   mkpManagerABI.abi,
//   wallet
// );

const abi = [
  {
    inputs: [
      { internalType: "uint256", name: "amountIn", type: "uint256" },
      { internalType: "address[]", name: "path", type: "address[]" }
    ],
    name: "getAmountsOut",
    outputs: [
      { internalType: "uint256[]", name: "amounts", type: "uint256[]" }
    ],
    stateMutability: "view",
    type: "function"
  }
];

const dexRouter = new Contract(
  "0xD99D1c33F9fC3444f8101754aBC46c52416550D1",
  abi,
  wallet
);

const getTokenPriceFromPancakeRouter = async (tokenA, tokenB) => {
  return (
    await dexRouter.getAmountsOut("1000000000000000000", [tokenA, tokenB])
  )[1];
};
const main = async () => {
  // const data = await mkpManager.fetchAvailableMarketItems();
  // console.log("all market items: ", data);
  const tokenIn = "0x99133A25338B76BACAd646922023517B4014cAb8";
  const tokenOut = "0xeD24FC36d5Ee211Ea25A80239Fb8C4Cfd80f12Ee"; // BUSD

  const price = await getTokenPriceFromPancakeRouter(tokenIn, tokenOut);
  console.log("Price MTVS tokekn is", ethers.utils.formatEther(price));
};

// Run the arbitrage and output the result or error
main();
//   .then(console.log)
//   .catch(console.error);
