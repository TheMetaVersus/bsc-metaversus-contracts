const { ethers, Wallet, Contract } = require("ethers");
const contract = require("../contracts.json");
const mkpManagerABI = require("../artifacts/contracts/Marketplace/MarketplaceManager.sol/MarketPlaceManager.json");
const mtvsManagerABI = require("../artifacts/contracts/Marketplace/MetaversusManager.sol/MetaversusManager.json");
const orderManagerABI = require("../artifacts/contracts/Marketplace/Order.sol/OrderManager.json");
const { abi } = require("./error.js");
let provider = new ethers.providers.JsonRpcProvider(
  "https://data-seed-prebsc-1-s1.binance.org:8545/"
);

let walletPK = `${process.env.DEPLOY_ACCOUNT}`;

const wallet = new Wallet(walletPK, provider);

// const mkpManager = new Contract(contract.mkpManager, mkpManagerABI.abi, wallet);
const orderManager = new Contract(
  contract.orderManager,
  orderManagerABI.abi,
  wallet
);

async function main() {
  try {
    await orderManager.makeWalletOrder(
      ethers.constants.AddressZero,
      0,
      "0x1696a1e6129f8ab8ff14b0395054d9bae8cbadb4",
      ethers.constants.AddressZero,
      1,
      1,
      1666791846
    );
  } catch (err) {
    const start_index = err.message.indexOf("0x");
    const end_index = err.message.indexOf("}}");
    const error_data = err.message.substring(start_index, end_index - 2);

    const _interface = new ethers.utils.Interface(abi);
    for (let i = 0; i < abi.length; i++) {
      try {
        const decoded = _interface.decodeFunctionData(
          _interface.functions[`${abi[i].slice(9)}`],
          error_data
        );
        console.log(`${abi[i].slice(9)}:`, decoded);
      } catch (err) {}
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
