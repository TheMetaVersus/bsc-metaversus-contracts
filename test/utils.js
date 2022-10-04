const Big = require("big.js");
const { subtract, compareTo } = require("js-big-decimal");
const { MerkleTree } = require("merkletreejs");
const keccak256 = require("keccak256");

const skipTime = async seconds => {
  await network.provider.send("evm_increaseTime", [seconds]);
  await network.provider.send("evm_mine");
};

const setTime = async time => {
  await network.provider.send("evm_setNextBlockTimestamp", [time]);
  await network.provider.send("evm_mine");
};

const getProfit = (pool, days, deposedCash, round) => {
  return Big((pool + 2) ** (1 / 365))
    .pow(days)
    .minus(1)
    .times(deposedCash)
    .round(round ? round : 18)
    .toString();
};

const getProfitRoot = (pool, days, deposedCash, round) => {
  return Big((pool + 2) ** (1 / 365))
    .pow(days)
    .times(deposedCash)
    .round(round ? round : 18)
    .toString();
};

const skipBlock = async blockNumber => {
  for (let index = 0; index < blockNumber; index++) {
    await hre.ethers.provider.send("evm_mine");
  }
};

const getCurrentBlock = async () => {
  const latestBlock = await hre.ethers.provider.getBlock("latest");
  return latestBlock.number;
};

const acceptable = (expected, actual, eps) => {
  return compareTo(eps, subtract(expected, actual).replace("-", "")) !== -1;
};

const getCurrentTime = async () => {
  const blockNumber = await hre.ethers.provider.getBlockNumber();
  const block = await hre.ethers.provider.getBlock(blockNumber);
  return block.timestamp;
};

const generateMerkleTree = accounts => {
  const leaves = [user1.address, user2.address].map(value => keccak256(value));
  return new MerkleTree(leaves, keccak256, { sort: true });
};

const generateLeaf = account => {
  return keccak256(account);
};

module.exports = {
  skipTime,
  setTime,
  getProfit,
  getProfitRoot,
  skipBlock,
  getCurrentBlock,
  acceptable,
  getCurrentTime,
  generateMerkleTree,
  generateLeaf
};
