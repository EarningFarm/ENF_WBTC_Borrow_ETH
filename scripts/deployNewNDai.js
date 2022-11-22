const { ethers } = require("hardhat");
const { utils } = require("ethers");
const { deployUpgradeable, deployContract } = require("./utils");

function toEth(num) {
  return utils.formatEther(num);
}

function toUSDC(num) {
  return utils.formatUnits(num, 6);
}

function fromEth(num) {
  return utils.parseEther(num.toString());
}

function fromUSDC(num) {
  return utils.parseUnits(num.toString(), 6);
}

async function main() {
  const [deployer] = await ethers.getSigners();

  // Deploying Notional

  const cDai = await deployContract(deployer, "CDai", []);
  console.log("CDai: ", cDai.address);
}

main();
