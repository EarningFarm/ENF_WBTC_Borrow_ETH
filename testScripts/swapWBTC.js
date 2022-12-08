const { ethers } = require("hardhat");
const { utils } = require("ethers");

const {
  wbtcContract,
  uniV2RouterContract,
  uniV2FactoryContract,
  alusdC,
  wbtcContractontract,
} = require("../test/externalContracts");
const constants = require("../constants/constants");

function toEth(num) {
  return utils.formatEther(num);
}

function toWBTC(num) {
  return utils.formatUnits(num, 8);
}

function fromEth(num) {
  return utils.parseEther(num.toString());
}

function fromUSDC(num) {
  return utils.parseUnits(num.toString(), 6);
}

async function swapWBTC(caller) {
  await uniV2RouterContract(caller).swapExactETHForTokens(
    0,
    [constants.weth, constants.wbtc],
    caller.address,
    100000000000,
    { value: fromEth(1) }
  );
}

async function main() {
  const [deployer] = await ethers.getSigners();

  const curWBTC = await wbtcContract(deployer).balanceOf(deployer.address);
  console.log(`\tWBTV of Alice: ${toWBTC(curWBTC)}`);

  await swapWBTC(deployer);
}

main();
