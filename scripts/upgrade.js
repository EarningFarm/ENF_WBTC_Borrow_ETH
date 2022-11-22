const { ethers, upgrades } = require("hardhat");
const { upgardeContract, verifyUpgradeable } = require("./utils");

async function main() {
  const [deployer] = await ethers.getSigners();

  const alusd = "0xB9D1dc019FD2f716732E97E2af42D292711BaA01";
  const lusd = "0x0F97afE1aedFc6B89DE66950296E130cA814B010";
  const aave = "0x83AAa7c3e8d3Aab641489C1aA6df22878fA93AB2";
  const compound = "0xBF84828177a6D1c2e14D1469d29d864C6e89AFF7";
  const tri = "0xBC6394e2f7C11Acdbb99545e46fc6F6878D94827";

  // const vault = "0xc0Bb1650A8eA5dDF81998f17B5319afD656f4c11";

  await upgardeContract(deployer, tri, "Tri");
  // await verifyUpgradeable(lusd);
  // await upgardeContract(deployer, vault, "Exchange");
}

main();
