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

    // Deploy Exchange
    console.log("Deploying Exchange".green);
    const Exchange = await ethers.getContractFactory("Exchange");
    exchange = await upgrades.deployProxy(Exchange, [weth, controller.address]);

    // Deploy routers
    console.log("\nDeploying Uni V2 Router".green);
    const UniV2 = await ethers.getContractFactory("UniswapV2");
    uniV2 = await UniV2.deploy(weth, exchange.address);
    console.log("Uni V2 is deployed: ", uniV2.address);

    console.log("\nDeploying Uni V3 Router".green);
    const UniV3 = await ethers.getContractFactory("UniswapV3");
    uniV3 = await UniV3.deploy(uniSwapV3Router, exchange.address, weth);
    console.log("Uni V3 is deployed: ", uniV3.address);

    console.log("\nDeploying Balancer".green);
    const Balancer = await ethers.getContractFactory("BalancerV2");
    balancer = await Balancer.deploy(balancerV2Vault, exchange.address, weth);
    console.log("Balancer V2 is Deployed: ", balancer.address);

    console.log("\nDeploying Curve".green);
    const Curve = await ethers.getContractFactory("Curve");
    curve = await Curve.deploy(weth, exchange.address);
    console.log("Curve is deployed: ", curve.address);

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
      exchange.address,
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

    // Set CRV-WBTC to exchange
    await uniV2.addPath(uniSwapV2Router, crvUsdcPath);

    // Set CRV-WBTC to exchange
    await uniV2.addPath(uniSwapV2Router, crvEthPath);

    // Set CRV-WBTC to exchange
    await uniV2.addPath(uniSwapV2Router, ethUsdcPath);

    // Set CRV-WBTC to CURVE
    await curve.addCurvePool(...curveCRVETH);

    console.log("\nDeploying Curve3Pool".green);
    const Curve3Pool = await ethers.getContractFactory("Curve3Pool");
    curve3Pool = await Curve3Pool.deploy(weth, exchange.address);
    console.log("Curve3Pool deployed: ", curve3Pool.address);

    await curve3Pool.addCurvePool(...curve3ETHWBTC);
    await curve3Pool.addCurvePool(...curve3WBTCETH);
    const index0 = curve3Pool.getPathIndex(...curve3ETHWBTC);
    const index1 = curve3Pool.getPathIndex(...curve3WBTCETH);

    // Set Routers to exchange
    await exchange.listRouter(uniV2.address);
    await exchange.listRouter(curve.address);
    await exchange.listRouter(curve3Pool.address);
    // await exchange.listRouter(balancerBatch.address);
    await exchange.listRouter(uniV3.address);
    await exchange.setSwapCaller(wbtcSS.address, true);

    await wbtcSS.setSwapPath([curve3Pool.address], [index1], [curve3Pool.address], [index0]);
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
  it("Withdraw 0.01 WBTC", async () => {
    await vault.connect(alice).withdraw(fromWBTC(0.01), alice.address);
    // Read Total Assets
    const total = await vault.totalAssets();
    console.log(`\tTotal WBTC Balance: ${toWBTC(total)}`);

    // Read ENF token Mint
    const enf = await vault.balanceOf(alice.address);
    console.log(`\tAlice ENF Balance: ${toEth(enf)}`);
  });

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

  ////////////////////////////////////////////////
  //              EMERGENCY WITHDRAW            //
  ////////////////////////////////////////////////
  it("Emergency Withdraw by non-owner will be reverted", async () => {
    await expect(wbtcSS.connect(alice).emergencyWithdraw()).to.be.revertedWith("Ownable: caller is not the owner");
  });

  it("Emergency Withdraw", async () => {
    // Read Total Assets
    let total = await vault.totalAssets();
    console.log(`\tTotal WBTC Balance: ${toWBTC(total)}`);
    let ownerBal = await wbtcContract(deployer).balanceOf(deployer.address);
    console.log(`\tOwner WBTC Balance: ${toWBTC(ownerBal)}`);

    await wbtcSS.emergencyWithdraw();

    total = await vault.totalAssets();
    console.log(`\tTotal WBTC Balance: ${toWBTC(total)}`);
    ownerBal = await wbtcContract(deployer).balanceOf(deployer.address);
    console.log(`\tOwner WBTC Balance: ${toWBTC(ownerBal)}`);
  });

  /////////////////////////////////////////////////
  //               OWNER DEPOSIT                 //
  /////////////////////////////////////////////////
  it("Owner deposit will be reverted", async () => {
    await expect(wbtcSS.connect(alice).ownerDeposit(fromWBTC(100))).to.revertedWith("Ownable: caller is not the owner");
  });

  it("Owner Deposit", async () => {
    // Approve to deposit approver
    await wbtcContract(deployer).approve(wbtcSS.address, fromWBTC(0.1));

    await wbtcSS.connect(deployer).ownerDeposit(fromWBTC(0.1));

    // Read Total Assets
    const total = await wbtcSS.totalAssets(true);
    console.log(`\n\tTotal WBTC Balance: ${toWBTC(total)}`);
  });

  it("Owner Deposit", async () => {
    // Approve to deposit approver
    await wbtcContract(deployer).approve(wbtcSS.address, fromWBTC(0.1));

    await wbtcSS.connect(deployer).ownerDeposit(fromWBTC(0.1));

    // Read Total Assets
    const total = await wbtcSS.totalAssets(true);
    console.log(`\n\tTotal WBTC Balance: ${toWBTC(total)}`);
  });

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

  it("Harvest", async () => {
    // Read Total Assets
    let total = await vault.totalAssets();
    console.log(`\tTotal WBTC Balance: ${toWBTC(total)}`);

    await wbtcSS.harvest();

    total = await vault.totalAssets();
    console.log(`\tTotal WBTC Balance: ${toWBTC(total)}`);
  });

  it("Harvest", async () => {
    // Read Total Assets
    let total = await vault.totalAssets();
    console.log(`\tTotal WBTC Balance: ${toWBTC(total)}`);

    await wbtcSS.harvest();

    total = await vault.totalAssets();
    console.log(`\tTotal WBTC Balance: ${toWBTC(total)}`);
  });
});
