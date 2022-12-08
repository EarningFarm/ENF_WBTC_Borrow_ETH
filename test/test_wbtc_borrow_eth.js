const { ethers, waffle, network, upgrades } = require("hardhat");
const { expect, util } = require("chai");
const colors = require("colors");
const { utils } = require("ethers");

const {
  wbtc,
  weth,
  awbtc,
  aave,
  ethOracle,
  wbtcOracle,
  ethLeverage,
  uniSwapV3Router,
  balancerV2Vault,
  uniSwapV2Router,
  curveCRVETH,
  crvUsdcPath,
  crvEthPath,
  ethUsdcPath,
  curve3ETHWBTC,
  curve3WBTCETH,
  aaveOracle,
} = require("../constants/constants");
const { wbtcContract, uniV2FactoryContract, uniV2RouterContract } = require("./externalContracts");

let vault, controller, depositApprover, exchange, uniV2, curve, uniV3, wbtcSS, priceOracle;

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

async function swapWBTC(caller) {
  await uniV2RouterContract(caller).swapExactETHForTokensSupportingFeeOnTransferTokens(
    0,
    [weth, wbtc],
    caller.address,
    200000000000,
    { value: fromEth(2) }
  );
}

describe("ENF Vault test", async () => {
  before(async () => {
    [deployer, alice, bob, carol, david, evan, fiona, treasury] = await ethers.getSigners();

    // Deploy DepositApprover
    console.log("Deploying DepositApprover".green);
    const DepositApprover = await ethers.getContractFactory("DepositApprover");
    depositApprover = await DepositApprover.deploy(wbtc);
    console.log(`DepositApprover deployed at: ${depositApprover.address}\n`);

    // Deploy Vault
    console.log("Deploying Vault".green);
    const Vault = await ethers.getContractFactory("EFVault");
    vault = await upgrades.deployProxy(Vault, [wbtc, "ENF LP", "ENF"]);
    console.log(`Vault deployed at: ${vault.address}\n`);

    // Deploy Controller
    console.log("Deploying Controller".green);
    const Controller = await ethers.getContractFactory("Controller");
    controller = await upgrades.deployProxy(Controller, [vault.address, wbtc, treasury.address, weth]);
    console.log(`Controller deployed at: ${controller.address}\n`);

    // // Deploying Price oracle
    // const PriceOracle = await ethers.getContractFactory("PriceOracle");
    // priceOracle = await PriceOracle.deploy(ethOracle, wbtcOracle);
    // console.log("Price oracle is deployed: ", priceOracle.address);

    // Deploying WBTC SS
    const WBTCSS = await ethers.getContractFactory("WBTCBorrowETH");
    wbtcSS = await upgrades.deployProxy(WBTCSS, [
      wbtc,
      awbtc,
      weth,
      6750,
      aave,
      vault.address,
      controller.address,
      aaveOracle,
      ethLeverage,
      treasury.address,
      1000,
    ]);
    console.log("WBTCSS: ", wbtcSS.address);

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

    /**
     * Set configuration
     */

    // Set DepositSlippage on ALUSD
    await wbtcSS.setDepositSlippage(100);
    console.log("Deposit slippage set");

    // Set WithdrawSlippage on ALUSD
    await wbtcSS.setWithdrawSlippage(100);
    console.log("Withdraw slippage set");

    await wbtcSS.setSwapInfo(uniSwapV3Router, 500);
  });

  it("Vault Deployed", async () => {
    const name = await vault.name();
    const symbol = await vault.symbol();
    const asset = await vault.asset();
    console.log("\tVault info: ", name, symbol, asset);
  });

  // Prepare WBTC before
  it("Swap Ether to wbtc in uniswap V2", async () => {
    // WBTC current amt
    const curWBTC = await wbtcContract(deployer).balanceOf(alice.address);
    console.log(`\tWBTC of Alice: ${toWBTC(curWBTC)}`);

    const pair = await uniV2FactoryContract(deployer).getPair(wbtc, weth);
    console.log(`\tWBTC-ETH pair address: ${pair}`);

    await swapWBTC(alice);
    await swapWBTC(deployer);

    const newWBTC = await wbtcContract(deployer).balanceOf(alice.address);
    console.log(`\tWBTC of Alice: ${toWBTC(newWBTC)}`);
  });

  // Register Wbtc SS
  it("Register Wbtc with non-owner will be reverted", async () => {
    await expect(controller.connect(alice).registerSubStrategy(wbtcSS.address, 100)).to.revertedWith(
      "Ownable: caller is not the owner"
    );
  });

  it("Register Wbtc as 100 alloc point, check total alloc to be 100, ss length to be 1", async () => {
    await controller.connect(deployer).registerSubStrategy(wbtcSS.address, 100);
    const totalAlloc = await controller.totalAllocPoint();
    const ssLength = await controller.subStrategyLength();

    console.log(`\tTotal Alloc: ${totalAlloc.toNumber()}, ssLength: ${ssLength.toNumber()}`);
    expect(totalAlloc).to.equal(100);
    expect(ssLength).to.equal(1);
  });

  it("Register Wbtc will be reverted for duplication", async () => {
    await expect(controller.connect(deployer).registerSubStrategy(wbtcSS.address, 100)).to.revertedWith(
      "ALREADY_REGISTERED"
    );
  });

  ///////////////////////////////////////////////////
  //                 DEPOSIT                       //
  ///////////////////////////////////////////////////
  it("Deposit 0.01 WBTC", async () => {
    // Approve to deposit approver
    await wbtcContract(alice).approve(depositApprover.address, fromWBTC(0.01));

    // Deposit
    await depositApprover.connect(alice).deposit(fromWBTC(0.01));

    // Read Total Assets
    const total = await vault.totalAssets();
    console.log(`\tTotal WBTC Balance: ${toWBTC(total)}`);

    // Read ENF token Mint
    const enf = await vault.balanceOf(alice.address);
    console.log(`\tAlice ENF Balance: ${toEth(enf)}`);
  });

  it("Deposit 0.01 WBTC", async () => {
    // Approve to deposit approver
    await wbtcContract(alice).approve(depositApprover.address, fromWBTC(0.01));

    // Deposit
    await depositApprover.connect(alice).deposit(fromWBTC(0.01));

    // Read Total Assets
    const total = await vault.totalAssets();
    console.log(`\tTotal WBTC Balance: ${toWBTC(total)}`);

    // Read ENF token Mint
    const enf = await vault.balanceOf(alice.address);
    console.log(`\tAlice ENF Balance: ${toEth(enf)}`);
  });

  ///////////////////////////////////////////////////
  //                WITHDRAW                       //
  ///////////////////////////////////////////////////
  // it("Withdraw 0.01 WBTC", async () => {
  //   await vault.connect(alice).withdraw(fromWBTC(0.001), alice.address);
  //   // Read Total Assets
  //   const total = await vault.totalAssets();
  //   console.log(`\tTotal WBTC Balance: ${toWBTC(total)}`);

  //   // Read ENF token Mint
  //   const enf = await vault.balanceOf(alice.address);
  //   console.log(`\tAlice ENF Balance: ${toEth(enf)}`);
  // });

  // it("Withdraw 10 WBTC will be reverted", async () => {
  //   await expect(vault.connect(alice).withdraw(fromWBTC(10), alice.address)).to.revertedWith("EXCEED_TOTAL_DEPOSIT");
  // });

  // it("Deposit 0.1 WBTC", async () => {
  //   // Approve to deposit approver
  //   await wbtcContract(alice).approve(depositApprover.address, fromWBTC(0.1));

  //   // Deposit
  //   await depositApprover.connect(alice).deposit(fromWBTC(0.1));

  //   // Read Total Assets
  //   const total = await vault.totalAssets();
  //   console.log(`\tTotal WBTC Balance: ${toWBTC(total)}`);

  //   // Read ENF token Mint
  //   const enf = await vault.balanceOf(alice.address);
  //   console.log(`\tAlice ENF Balance: ${toEth(enf)}`);
  // });

  ////////////////////////////////////////////////
  //                  HARVEST                   //
  ////////////////////////////////////////////////

  // it("Pass Time and block number", async () => {
  //     await network.provider.send("evm_increaseTime", [3600 * 24 * 60]);
  //     await network.provider.send("evm_mine");
  //     await network.provider.send("evm_mine");
  //     await network.provider.send("evm_mine");
  // })

  // ////////////////////////////////////////////////
  // //              EMERGENCY WITHDRAW            //
  // ////////////////////////////////////////////////
  // it("Emergency Withdraw by non-owner will be reverted", async () => {
  //   await expect(wbtcSS.connect(alice).emergencyWithdraw()).to.be.revertedWith("Ownable: caller is not the owner");
  // });

  // it("Emergency Withdraw", async () => {
  //   // Read Total Assets
  //   let total = await vault.totalAssets();
  //   console.log(`\tTotal WBTC Balance: ${toWBTC(total)}`);
  //   let ownerBal = await wbtcContract(deployer).balanceOf(deployer.address);
  //   console.log(`\tOwner WBTC Balance: ${toWBTC(ownerBal)}`);

  //   await wbtcSS.emergencyWithdraw();

  //   total = await vault.totalAssets();
  //   console.log(`\tTotal WBTC Balance: ${toWBTC(total)}`);
  //   ownerBal = await wbtcContract(deployer).balanceOf(deployer.address);
  //   console.log(`\tOwner WBTC Balance: ${toWBTC(ownerBal)}`);
  // });

  // /////////////////////////////////////////////////
  // //               OWNER DEPOSIT                 //
  // /////////////////////////////////////////////////
  // it("Owner deposit will be reverted", async () => {
  //   await expect(wbtcSS.connect(alice).ownerDeposit(fromWBTC(100))).to.revertedWith("Ownable: caller is not the owner");
  // });

  // it("Owner Deposit", async () => {
  //   // Approve to deposit approver
  //   await wbtcContract(deployer).approve(wbtcSS.address, fromWBTC(0.1));

  //   await wbtcSS.connect(deployer).ownerDeposit(fromWBTC(0.1));

  //   // Read Total Assets
  //   const total = await wbtcSS.totalAssets(true);
  //   console.log(`\n\tTotal WBTC Balance: ${toWBTC(total)}`);
  // });

  // it("Owner Deposit", async () => {
  //   // Approve to deposit approver
  //   await wbtcContract(deployer).approve(wbtcSS.address, fromWBTC(0.1));

  //   await wbtcSS.connect(deployer).ownerDeposit(fromWBTC(0.1));

  //   // Read Total Assets
  //   const total = await wbtcSS.totalAssets(true);
  //   console.log(`\n\tTotal WBTC Balance: ${toWBTC(total)}`);
  // });

  // // it("Emergency Withdraw", async () => {
  // //   // Read Total Assets
  // //   let total = await vault.totalAssets();
  // //   console.log(`\tTotal WBTC Balance: ${toWBTC(total)}`);
  // //   let ownerBal = await wbtcContract(deployer).balanceOf(deployer.address);
  // //   console.log(`\tOwner WBTC Balance: ${toWBTC(ownerBal)}`);

  // //   await wbtcSS.emergencyWithdraw();

  // //   total = await vault.totalAssets();
  // //   console.log(`\tTotal WBTC Balance: ${toWBTC(total)}`);
  // //   ownerBal = await wbtcContract(deployer).balanceOf(deployer.address);
  // //   console.log(`\tOwner WBTC Balance: ${toWBTC(ownerBal)}`);
  // // });

  // it("Harvest", async () => {
  //   // Read Total Assets
  //   let total = await vault.totalAssets();
  //   console.log(`\tTotal WBTC Balance: ${toWBTC(total)}`);

  //   await wbtcSS.harvest();

  //   total = await vault.totalAssets();
  //   console.log(`\tTotal WBTC Balance: ${toWBTC(total)}`);
  // });

  // it("Harvest", async () => {
  //   // Read Total Assets
  //   let total = await vault.totalAssets();
  //   console.log(`\tTotal WBTC Balance: ${toWBTC(total)}`);

  //   await wbtcSS.harvest();

  //   total = await vault.totalAssets();
  //   console.log(`\tTotal WBTC Balance: ${toWBTC(total)}`);
  // });

  it("Raise Actual LTV", async () => {
    // calculate LTV
    let collateral = await wbtcSS.getCollateral();
    let debt = await wbtcSS.getDebt();
    console.log("LTV: ", debt / collateral);

    await wbtcSS.setMLR(6900);
    await wbtcSS.raiseLTV();

    // calculate LTV
    collateral = await wbtcSS.getCollateral();
    debt = await wbtcSS.getDebt();
    console.log("LTV: ", debt / collateral);
  });

  it("Reduce Actual LTV", async () => {
    // calculate LTV
    let collateral = await wbtcSS.getCollateral();
    let debt = await wbtcSS.getDebt();
    console.log("LTV: ", debt / collateral);

    await wbtcSS.setMLR(6750);
    await wbtcSS.reduceLTV();

    // calculate LTV
    collateral = await wbtcSS.getCollateral();
    debt = await wbtcSS.getDebt();
    console.log("LTV: ", debt / collateral);
  });
});
