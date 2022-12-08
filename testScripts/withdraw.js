const { ethers } = require("hardhat");
const { utils } = require("ethers");

const { usdcContract, vaultContract, wbtcContract } = require("../test/externalContracts");
const address = require("../scripts/address.json");
const vault = address["ENF Vault address"];

function toEth(num) {
  return utils.formatEther(num);
}

function toWBTC(num) {
  return utils.formatUnits(num, 8);
}

function fromEth(num) {
  return utils.parseEther(num.toString());
}

function fromWBTC(num) {
  return utils.parseUnits(num.toString(), 8);
}

async function main() {
  const [deployer] = await ethers.getSigners();

  let curUSDC = await wbtcContract(deployer).balanceOf(deployer.address);
  console.log(`\tUSDC of Alice: ${toWBTC(curUSDC)}`);

  // withdraw
  await vaultContract(deployer, vault).withdraw(fromWBTC(0.001), deployer.address);

  curUSDC = await wbtcContract(deployer).balanceOf(deployer.address);
  console.log(`\tUSDC of Alice: ${toWBTC(curUSDC)}`);
}

main();
