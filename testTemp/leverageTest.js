const { ethers, waffle, network, upgrades } = require("hardhat");
const { expect, util } = require("chai");
const colors = require("colors");
const { utils } = require("ethers");

let ethLeverageTest;

function fromEth(num) {
  return utils.parseEther(num.toString());
}

describe("ETH Leverage test", async () => {
  before(async () => {
    [deployer, alice, bob, carol, david, evan, fiona, treasury] = await ethers.getSigners();

    const ETHLeverageTest = await ethers.getContractFactory("ETHLeverageTest");
    ethLeverageTest = await ETHLeverageTest.deploy();

    console.log("ETH Leverage Test deployed: ", ethLeverageTest.address);
  });

  it("Deposit", async () => {
    await ethLeverageTest.deposit(fromEth(1), { value: fromEth(1) });
  });
});
