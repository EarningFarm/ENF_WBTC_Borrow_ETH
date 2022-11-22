const { ethers } = require("hardhat");
const { utils } = require("ethers");

const { curveCRVETH, ethUsdcPath, uniSwapV2Router } = require("../constants/constants");
const constants = require("../constants/constants");

const {
  usdcContract,
  controllerContract,
  curveExchange,
  uniV2Exchange,
  vaultContract,
} = require("../test/externalContracts");

const address = require("./v3_address.json");
const { deployUpgradeable, deployContract } = require("./utils");

const vault = address["ENF Vault address"];
const controller = address["Controller address"];
const exchange = address["Exchange address"];
const curve = address["Curve address"];
const uniV2 = address["Uniswap V2"];
const uniV3 = address["Uniswap V3"];
const balancer = address["Balancer Address"];
const balancerBatch = address["Balancer Batch Address"];
// const cDai = address["CDAI address"];

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

  // // Deploying Exchange
  // const exchange = await deployUpgradeable(deployer, "Exchange", [constants.weth, controller]);
  // await exchange.listRouter(uniV2);
  // await exchange.listRouter(uniV3);
  // await exchange.listRouter(balancer);
  // await exchange.listRouter(balancerBatch);
  // await exchange.listRouter(curve);

  // // Deploying Curve3Pool
  // const curve3 = await deployContract(deployer, "Curve3Pool", [constants.weth, exchange.address]);
  // await curve3.addCurvePool(...constants.curve3ETHUSDC);

  // Deploying Curve
  const curve = await deployContract(deployer, "Curve", [constants.weth, exchange]);

  // Set CRV-USDC to CURVE
  await curve.addCurvePool(...curveCRVETH);
  await curve.addCurvePool(...constants.curveUSDCDAI);
  await curve.addCurvePool(...constants.curveDAIUSDC);

  const indexDai = await curve.getPathIndex(...constants.curveUSDCDAI);
  const indexUSDC = await curve.getPathIndex(...constants.curveDAIUSDC);
  console.log("Dai: ", indexDai);
  console.log("USDC: ", indexUSDC);
  // await exchange.listRouter(curve3.address);

  // Deploying Notional

  // const cDai = await deployUpgradeable(deployer, "CDai", [
  //   constants.usdc,
  //   constants.dai,
  //   controller,
  //   constants.notionalProxy,
  //   constants.note,
  //   constants.nDai,
  //   constants.daiCurrencyId,
  //   exchange,
  // ]);

  // // Set DepositSlippage on ALUSD
  // await cDai.setDepositSlippage(100);
  // console.log("Deposit slippage set");

  // // Set WithdrawSlippage on ALUSD
  // await cDai.setWithdrawSlippage(100);
  // console.log("Withdraw slippage set");

  // await exchange.setSwapCaller(cDai.address, true);
}

main();
