const { ethers, upgrades } = require("hardhat");
const { upgardeContract, verifyUpgradeable } = require("./utils");

async function main() {
  const [deployer] = await ethers.getSigners();

  const wbtcSS = "0x22F505099c3d54c0ee3dC44ad080b6E375B6E4E4";

  await upgardeContract(deployer, wbtcSS, "WBTCBorrowETH");
}

main();
