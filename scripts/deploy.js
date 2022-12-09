const { ethers } = require("hardhat");
const fs = require("fs");
const { yellow, cyan } = require("colors");

const { deployContract, deployUpgradeable, verifyContract, verifyUpgradeable } = require("./utils");
const constants = require("../constants/constants");
const { treasury } = require("./config");

async function main() {
  const [deployer] = await ethers.getSigners();

  /////////////////////////////////////////
  //             DEPLOYING               //
  /////////////////////////////////////////

  console.log("\nDeploying Contracts\n".yellow);

  // Deploying Deposit Approver
  const depositApprover = await deployContract(deployer, "DepositApprover", [constants.wbtc]);

  // Deploy Vault
  const vault = await deployUpgradeable(deployer, "EFVault", [
    constants.wbtc,
    "ENF WBTC BORROW ETH LP",
    "ENF_WBTC_BORROW_ETH",
  ]);

  // Deploying Controller
  const controller = await deployUpgradeable(deployer, "Controller", [
    vault.address,
    constants.wbtc,
    treasury,
    constants.weth,
  ]);

  // Deploying WBTC SS
  const wbtcSS = await deployUpgradeable(deployer, "WBTCBorrowETH", [
    constants.wbtc,
    constants.awbtc,
    constants.weth,
    6750,
    constants.aave,
    vault.address,
    controller.address,
    constants.aaveOracle,
    constants.ethLeverage,
    treasury,
    1000,
  ]);

  /**
   * Wiring Contracts with each other
   */

  // Set Vault on deposit approver
  await depositApprover.setVault(vault.address);
  console.log("Deposit Approver set Vault");

  // Set deposit approver to vault
  await vault.setDepositApprover(depositApprover.address);
  console.log("Vault set deposit approver");

  // Set Controller to vault
  await vault.setController(controller.address);
  console.log("Controller set Vault");

  // Set Substrategy to vault
  await vault.setSubStrategy(wbtcSS.address);

  await controller.registerSubStrategy(wbtcSS.address, 100);

  /**
   * Set configuration
   */

  // Set DepositSlippage on ALUSD
  await wbtcSS.setDepositSlippage(100);
  console.log("Deposit slippage set");

  // Set WithdrawSlippage on ALUSD
  await wbtcSS.setWithdrawSlippage(100);
  console.log("Withdraw slippage set");

  await wbtcSS.setSwapInfo(constants.uniSwapV3Router, 500);

  // Output deployed address result
  const deployLog = [
    {
      Label: "DepositApprover address",
      Info: depositApprover.address,
    },
    {
      Label: "ENF Vault address",
      Info: vault.address,
    },
    {
      Label: "Controller address",
      Info: controller.address,
    },
    {
      Label: "WBTC SS address",
      Info: wbtcSS.address,
    },
  ];

  console.table(deployLog);

  // Save data to json
  const data = {};
  for (let i = 0; i < deployLog.length; i++) {
    data[deployLog[i].Label] = deployLog[i].Info;
  }
  fs.writeFileSync("./scripts/address.json", JSON.stringify(data));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
