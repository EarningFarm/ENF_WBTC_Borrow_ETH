const { ethers } = require("hardhat");
const { utils } = require("ethers");

const { usdcContract, depositApproverContract, wbtcContract } = require("../test/externalContracts");
const address = require("../scripts/address.json");
const depositApprover = address["DepositApprover address"];

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

  const curWBTC = await wbtcContract(deployer).balanceOf(deployer.address);
  console.log(`\tWBTC of Alice: ${toWBTC(curWBTC)}`);

  // Approve to deposit approver
  await wbtcContract(deployer).approve(depositApprover, fromWBTC(0.01));

  // Deposit
  await depositApproverContract(deployer, depositApprover).deposit(fromWBTC(0.01));
}

main();
