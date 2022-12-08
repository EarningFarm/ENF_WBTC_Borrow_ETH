const { ethers, upgrades } = require("hardhat");
const { upgardeContract, verifyUpgradeable } = require("./utils");

async function main() {
  const [deployer] = await ethers.getSigners();

  const wbtcSS = "0x6F9679BdF5F180a139d01c598839a5df4860431b";

  await upgardeContract(deployer, wbtcSS, "WBTCBorrowETH");
}

main();
