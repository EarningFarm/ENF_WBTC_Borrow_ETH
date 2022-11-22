// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import "./interfaces/IWeth.sol";
import "./interfaces/IAave.sol";
import "./interfaces/IAavePriceOracle.sol";
import "./interfaces/IEthLeverage.sol";
import "../interfaces/ISubStrategy.sol";
import "../interfaces/IVault.sol";
import "../interfaces/IExchange.sol";
import "../interfaces/IRouter.sol";
import "../utils/TransferHelper.sol";

contract WBTCBorrowETH is OwnableUpgradeable, ISubStrategy {
    using SafeMath for uint256;

    // Sub Strategy name
    string public constant poolName = "WBTC_Borrow_ETH V3";

    // Controller address
    address public controller;

    // Vault address
    address public vault;

    // ETH Leverage address
    address public ethLeverage;

    // Exchange address
    address public exchange;

    // Price oracle address
    address public priceOracle;

    // Constant magnifier
    uint256 public constant magnifier = 10000;

    // Harvest Gap
    uint256 public override harvestGap;

    // Latest Harvest
    uint256 public override latestHarvest;

    // WETH Address
    address public weth;

    // AWBTC Address
    address public awbtc;

    // WBTC Address
    address public wbtc;

    // aave address
    address public aave;

    // Slippages for deposit and withdraw
    uint256 public depositSlippage;
    uint256 public withdrawSlippage;

    // Max Deposit
    uint256 public override maxDeposit;

    // Last Earn Block
    uint256 public lastEarnBlock;

    // Block rate
    uint256 public blockRate;

    // Max Loan Ratio
    uint256 public mlr;

    // WBTC decimal
    uint256 public constant wbtcDecimal = 1e8;

    // ETH decimal
    uint256 public constant ethDecimal = 1e18;

    // WBTC-ETH Swap path
    address[] public wbtcEthRouters;
    bytes32[] public wbtcEthIndexes;

    // ETH-WBTC Swap path
    address[] public ethWbtcRouters;
    bytes32[] public ethWbtcIndexes;

    // Fee Ratio
    uint256 public feeRatio;

    // Fee Collector
    address public feePool;

    event OwnerDeposit(uint256 lpAmount);

    event EmergencyWithdraw(uint256 amount);

    event SetController(address controller);

    event SetVault(address vault);

    event SetExchange(address exchange);

    event SetDepositSlippage(uint256 depositSlippage);

    event SetWithdrawSlippage(uint256 withdrawSlippage);

    event SetHarvestGap(uint256 harvestGap);

    event SetMaxDeposit(uint256 maxDeposit);

    event SetMLR(uint256 oldMlr, uint256 newMlr);

    event LTVUpdate(uint256 oldDebt, uint256 oldCollateral, uint256 newDebt, uint256 newCollateral);

    function initialize(
        address _wbtc,
        address _awbtc,
        address _weth,
        uint256 _mlr,
        address _aave,
        address _vault,
        address _controller,
        address _exchange,
        address _priceOracle,
        address _ethLeverage,
        address _feePool,
        uint256 _feeRatio
    ) public initializer {
        __Ownable_init();

        mlr = _mlr;
        wbtc = _wbtc;
        awbtc = _awbtc;
        weth = _weth;
        aave = _aave;

        vault = _vault;
        controller = _controller;
        exchange = _exchange;
        priceOracle = _priceOracle;
        ethLeverage = _ethLeverage;

        feePool = _feePool;
        feeRatio = _feeRatio;

        // Set Max Deposit as max uin256
        maxDeposit = type(uint256).max;
    }

    receive() external payable {}

    /**
        Only controller can call
     */
    modifier onlyController() {
        require(controller == _msgSender(), "ONLY_CONTROLLER");
        _;
    }

    //////////////////////////////////////////
    //          VIEW FUNCTIONS              //
    //////////////////////////////////////////

    /**
        External view function of total WBTC deposited in Covex Booster
     */
    function totalAssets(bool fetch) external view override returns (uint256) {
        return _totalAssets();
    }

    /**
        Internal view function of total WBTC deposited
    */
    function _totalAssets() internal view returns (uint256) {
        // console.log("Bals: ", getCollateral(), getDebt(), _totalETH());
        uint256 ethBal = getCollateral() - getDebt() + _totalETH();
        console.log("ETH Bal: ", ethBal);

        uint256 price = IAavePriceOracle(priceOracle).getAssetPrice(wbtc);
        console.log("Price: ", price);

        return (ethBal * 1e8) / price;
    }

    /**
        Internal view function of total WBTC collateralized
    */
    function _collateralInWBTC() internal view returns (uint256) {
        uint256 price = IAavePriceOracle(priceOracle).getAssetPrice(wbtc);
        console.log("Price: ", price);

        return (getCollateral() * 1e8) / price;
    }

    /**
        Internal view function of total ETH assets
     */
    function _totalETH() internal view returns (uint256) {
        uint256 lpBal = IERC20(ethLeverage).balanceOf(address(this));
        uint256 totalETH = IEthLeverage(ethLeverage).convertToAssets(lpBal);
        // console.log("Total ETH: ", totalETH);
        return totalETH;
    }

    /**
        Deposit function of WBTC
     */
    function deposit(uint256 _amount) external override onlyController returns (uint256) {
        uint256 deposited = _deposit(_amount);
        return deposited;
    }

    /**
        Deposit internal function
     */
    function _deposit(uint256 _amount) internal returns (uint256) {
        // Get Prev Deposit Amt
        uint256 prevAmt = _totalAssets();

        // Check Max Deposit
        require(prevAmt + _amount <= maxDeposit, "EXCEED_MAX_DEPOSIT");

        uint256 wbtcAmt = IERC20(wbtc).balanceOf(address(this));
        require(wbtcAmt >= _amount, "INSUFFICIENT_ETH_TRANSFER");

        // Get WBTC Collateral
        uint256 wbtcCol = getCollateral();
        console.log("WBTC: ", wbtcCol);

        // Deposit WBTC
        IERC20(wbtc).approve(aave, 0);
        IERC20(wbtc).approve(aave, _amount);
        IAave(aave).deposit(wbtc, _amount, address(this), 0);
        console.log(
            "WBTC: ",
            getCollateral(),
            (getCollateral() * 1e18) / (IAavePriceOracle(priceOracle).getAssetPrice(wbtc))
        );

        if (getCollateral() == 0) {
            IAave(aave).setUserUseReserveAsCollateral(wbtc, true);
        }

        // Calculate ETH amount to borrow
        uint256 ethToBorrow;
        uint256 price = IAavePriceOracle(priceOracle).getAssetPrice(wbtc);
        if (wbtcCol == 0) {
            console.log("Price: ", price);
            ethToBorrow = (price * mlr * wbtcAmt) / magnifier / wbtcDecimal;
        } else {
            uint256 ethDebt = getDebt();
            ethToBorrow = (ethDebt * wbtcAmt * price) / wbtcCol / wbtcDecimal;
        }
        console.log("ETH To Borrow: ", ethToBorrow);

        // Borrow ETH from AAVE
        IAave(aave).borrow(weth, ethToBorrow, 2, 0, address(this));

        uint256 ethAmt = IERC20(weth).balanceOf(address(this));
        IWeth(weth).withdraw(ethAmt);
        console.log("ETH Amount: ", ethAmt);

        // Deposit to ETH Leverage SS
        IEthLeverage(ethLeverage).deposit{value: ethAmt}(ethAmt, address(this));

        // Get new total assets amount
        uint256 newAmt = _totalAssets();

        console.log("Prev Amt: ", prevAmt, newAmt);
        // Deposited amt
        uint256 deposited = newAmt - prevAmt;
        uint256 minOutput = (_amount * (magnifier - depositSlippage)) / magnifier;

        require(deposited >= minOutput, "DEPOSIT_SLIPPAGE_TOO_BIG");

        return deposited;
    }

    /**
        Withdraw function of WBTC
     */
    function withdraw(uint256 _amount) external override onlyController returns (uint256) {
        uint256 withdrawn = _withdraw(_amount);
        return withdrawn;
    }

    function _withdraw(uint256 _amount) internal returns (uint256) {
        // Get Prev Deposit Amt
        uint256 prevAmt = _totalAssets();
        require(_amount <= prevAmt, "INSUFFICIENT_ASSET");

        // Calculate how much eth to be withdrawn from Leverage SS
        uint256 ethWithdraw = (_totalETH() * _amount) / prevAmt;
        console.log("ETH Withdraw: ", ethWithdraw);

        uint256 ethBefore = address(this).balance;

        // Withdraw ETH from ETH Leverage
        IEthLeverage(ethLeverage).withdraw(ethWithdraw, address(this));

        uint256 ethWithdrawn = address(this).balance - ethBefore;
        console.log("ETH Withdrawn: ", ethWithdrawn);

        // Withdraw WBTC from AAVE
        uint256 ethDebt = (getDebt() * _amount) / prevAmt;
        console.log("ETH repay: ", ethDebt);

        uint256 ethToRepay;
        if (ethWithdrawn >= ethDebt) {
            ethToRepay = ethDebt;
            _swap(ethWbtcRouters, ethWbtcIndexes, ethWithdrawn - ethToRepay);
        } else {
            ethToRepay = ethWithdrawn;
        }

        // Deposit WETH
        TransferHelper.safeTransferETH(weth, ethToRepay);
        // Approve WETH
        IERC20(weth).approve(aave, 0);
        IERC20(weth).approve(aave, ethToRepay);

        // Repay ETH to AAVE
        IAave(aave).repay(weth, ethToRepay, 2, address(this));

        uint256 wbtcBefore = IERC20(wbtc).balanceOf(address(this));

        IAave(aave).withdraw(wbtc, (_amount * ethToRepay) / ethDebt, address(this));

        uint256 withdrawn = IERC20(wbtc).balanceOf(address(this)) - wbtcBefore;

        uint256 minOutput = (_amount * (magnifier - withdrawSlippage)) / magnifier;

        require(withdrawn >= minOutput, "WITHDRAW_SLIPPAGE_TOO_BIG");

        TransferHelper.safeTransferToken(wbtc, controller, withdrawn);
        console.log("Withdrawn: ", withdrawn);

        return withdrawn;
    }

    function _swap(
        address[] memory _routers,
        bytes32[] memory _indexes,
        uint256 amount
    ) internal {
        require(exchange != address(0), "EXCHANGE_NOT_SET");

        // Swap fromToken to toToken for deposit
        for (uint256 i = 0; i < _indexes.length; i++) {
            // If index of path is not registered, revert it
            require(_indexes[i] != 0, "NON_REGISTERED_PATH");

            // Get fromToken Address
            address fromToken = IRouter(_routers[i]).pathFrom(_indexes[i]);
            // Get toToken Address
            address toToken = IRouter(_routers[i]).pathTo(_indexes[i]);

            if (amount == 0) continue;

            if (fromToken == weth) {
                IExchange(exchange).swapExactETHInput{value: amount}(toToken, _routers[i], _indexes[i], amount);
            } else {
                // Approve fromToken to Exchange
                IERC20(fromToken).approve(exchange, 0);
                IERC20(fromToken).approve(exchange, amount);

                // Call Swap on exchange
                IExchange(exchange).swapExactTokenInput(fromToken, toToken, _routers[i], _indexes[i], amount);
            }
        }
    }

    function getBalance(address _asset, address _account) internal view returns (uint256) {
        if (address(_asset) == address(0) || address(_asset) == weth) return address(_account).balance;
        else return IERC20(_asset).balanceOf(_account);
    }

    /**
        Harvest reward
     */
    function harvest() external override onlyOwner {
        // Get ETH Debt
        uint256 ethDebt = getDebt();
        // // For testing
        // uint256 ethDebt = 0;
        // Get ETH Current balance
        uint256 ethAsset = _totalETH();
        console.log("ethAsset: ", ethAsset);

        require(ethAsset > ethDebt, "NOTHING_TO_HARVEST");
        uint256 feeAmt = ((ethAsset - ethDebt) * feeRatio) / magnifier;
        console.log("Fee Amt: ", feeAmt);

        uint256 feePoolBal = IERC20(vault).balanceOf(feePool);
        uint256 totalEF = IERC20(vault).totalSupply();
        console.log("ENF: ", feePoolBal, totalEF);

        if (totalEF == 0) return;

        feeAmt = feeAmt - ((feeAmt * feePoolBal) / (totalEF));
        console.log("feeAmt: ", feeAmt);

        uint256 mintAmt = (feeAmt * totalEF) / (ethAsset - feeAmt);
        console.log("Mint: ", mintAmt);
        // Mint EF token to fee pool
        IVault(vault).mint(mintAmt, feePool);
    }

    /**
        Raise LTV
     */
    function raiseLTV(uint256 lt) public onlyOwner {
        uint256 e = getDebt();
        uint256 st = getCollateral();

        require(e * magnifier < st * mlr, "NO_NEED_TO_RAISE");

        uint256 x = (st * mlr - (e * magnifier)) / (magnifier - mlr);
        uint256 y = (st * lt) / magnifier - e - 1;

        if (x > y) {
            x = y;
        }

        IAave(aave).borrow(weth, x, 2, 0, address(this));
        uint256 wethAmt = IERC20(weth).balanceOf(address(this));
        IWeth(weth).withdraw(wethAmt);

        // Swap ETH to STETH
        _swap(ethWbtcRouters, ethWbtcIndexes, wethAmt);

        // Deposit STETH to AAVE
        uint256 wbtcBal = IERC20(wbtc).balanceOf(address(this));
        IERC20(wbtc).approve(aave, 0);
        IERC20(wbtc).approve(aave, wbtcBal);

        IAave(aave).deposit(wbtc, wbtcBal, address(this), 0);

        emit LTVUpdate(e, st, getDebt(), getCollateral());
    }

    /**
        Reduce LTV
     */
    function reduceLTV() public onlyOwner {
        uint256 e = getDebt();
        uint256 st = getCollateral();

        require(e * magnifier > st * mlr, "NO_NEED_TO_REDUCE");

        uint256 x = (e * magnifier - st * mlr) / (magnifier - mlr);

        IAave(aave).withdraw(wbtc, x, address(this));

        uint256 wbtcAmt = IERC20(wbtc).balanceOf(address(this));
        _swap(wbtcEthRouters, wbtcEthIndexes, wbtcAmt);

        uint256 toSend = address(this).balance;
        TransferHelper.safeTransferETH(weth, toSend);

        uint256 wethBal = IERC20(weth).balanceOf(address(this));
        // Approve WETH to AAVE
        IERC20(weth).approve(aave, 0);
        IERC20(weth).approve(aave, wethBal);

        // Repay WETH to aave
        IAave(aave).repay(weth, wethBal, 2, address(this));
    }

    /**
        Emergency Withdraw 
     */
    function emergencyWithdraw() public onlyOwner {
        uint256 total = _collateralInWBTC();
        console.log("Total: ", total);
        if (total == 0) return;

        console.log("Total ETH: ", _totalETH());
        IEthLeverage(ethLeverage).withdraw(_totalETH(), address(this));
        uint256 ethWithdrawn = address(this).balance;
        console.log("ETH Withdrawn: ", ethWithdrawn);

        // Repay ETH
        uint256 totalDebt = getDebt();
        console.log("Total Debt: ", totalDebt);

        uint256 ethToRepay;
        if (ethWithdrawn >= totalDebt) {
            ethToRepay = totalDebt;
            _swap(ethWbtcRouters, ethWbtcIndexes, ethWithdrawn - ethToRepay);
        } else {
            ethToRepay = ethWithdrawn;
        }

        // Deposit WETH
        TransferHelper.safeTransferETH(weth, ethToRepay);
        // Approve WETH
        IERC20(weth).approve(aave, 0);
        IERC20(weth).approve(aave, ethToRepay);

        // Repay ETH to AAVE
        IAave(aave).repay(weth, ethToRepay, 2, address(this));
        console.log("Debt: ", getDebt());

        // Withdraw WBTC
        uint256 amount = (total * ethToRepay) / totalDebt;

        console.log("Amount: ", amount);
        IAave(aave).withdraw(wbtc, amount, address(this));

        uint256 wbtcAmt = IERC20(wbtc).balanceOf(address(this));
        TransferHelper.safeTransfer(wbtc, owner(), wbtcAmt);

        emit EmergencyWithdraw(total);
    }

    /**
        Check withdrawable status of required amount
     */
    function withdrawable(uint256 _amount) external view override returns (uint256) {
        // Get Current Deposit Amt
        uint256 total = _totalAssets();

        // If requested amt is bigger than total asset, return false
        if (_amount > total) return total;
        // Todo Have to check withdrawable amount
        else return _amount;
    }

    /**
        Deposit by owner not issueing any ENF token
     */
    function ownerDeposit(uint256 _amount) public onlyOwner {
        // Transfer token from owner
        TransferHelper.safeTransferFrom(wbtc, owner(), address(this), _amount);

        _deposit(_amount);

        emit OwnerDeposit(_amount);
    }

    function getCollateral() public view returns (uint256) {
        (uint256 c, , , , , ) = IAave(aave).getUserAccountData(address(this));
        return c;
    }

    function getDebt() public view returns (uint256) {
        //decimal 18
        (, uint256 d, , , , ) = IAave(aave).getUserAccountData(address(this));
        return d;
    }

    //////////////////////////////////////////////////
    //               SET CONFIGURATION              //
    //////////////////////////////////////////////////

    /**
        Set Controller
     */
    function setController(address _controller) public onlyOwner {
        require(_controller != address(0), "INVALID_ADDRESS");
        controller = _controller;

        emit SetController(controller);
    }

    /**
        Set Vault
     */
    function setVault(address _vault) public onlyOwner {
        require(_vault != address(0), "INVALID_ADDRESS");
        vault = _vault;

        emit SetVault(vault);
    }

    /**
        Set Fee Pool
     */
    function setFeePool(address _feePool) public onlyOwner {
        require(_feePool != address(0), "INVALID_ADDRESS");
        feePool = _feePool;

        emit SetController(feePool);
    }

    /**
        Set Deposit Slipage
     */
    function setDepositSlippage(uint256 _slippage) public onlyOwner {
        require(_slippage < magnifier, "INVALID_SLIPPAGE");

        depositSlippage = _slippage;

        emit SetDepositSlippage(depositSlippage);
    }

    /**
        Set Withdraw Slipage
     */
    function setWithdrawSlippage(uint256 _slippage) public onlyOwner {
        require(_slippage < magnifier, "INVALID_SLIPPAGE");

        withdrawSlippage = _slippage;

        emit SetWithdrawSlippage(withdrawSlippage);
    }

    /**
        Set Harvest Gap
     */
    function setHarvestGap(uint256 _harvestGap) public onlyOwner {
        require(_harvestGap > 0, "INVALID_HARVEST_GAP");
        harvestGap = _harvestGap;

        emit SetHarvestGap(harvestGap);
    }

    /**
        Set Max Deposit
     */
    function setMaxDeposit(uint256 _maxDeposit) public onlyOwner {
        require(_maxDeposit > 0, "INVALID_MAX_DEPOSIT");
        maxDeposit = _maxDeposit;

        emit SetMaxDeposit(maxDeposit);
    }

    /**
        Set Exchange
     */
    function setExchange(address _exchange) public onlyOwner {
        require(_exchange != address(0), "INVALID_ADDRESS");
        exchange = _exchange;

        emit SetExchange(exchange);
    }

    /**
        Set MLR
     */
    function setMLR(uint256 _mlr) public onlyOwner {
        require(_mlr > 0 && _mlr < magnifier, "INVALID_RATE");

        uint256 oldMlr = mlr;
        mlr = _mlr;

        emit SetMLR(oldMlr, _mlr);
    }

    /**
        Set Swap Routers
     */
    function setSwapPath(
        address[] memory _wbtcEthRouters,
        bytes32[] memory _wbtcEthIndexes,
        address[] memory _ethWbtcRouters,
        bytes32[] memory _ethWbtcIndexes
    ) public onlyOwner {
        wbtcEthRouters = _wbtcEthRouters;
        wbtcEthIndexes = _wbtcEthIndexes;
        ethWbtcRouters = _ethWbtcRouters;
        ethWbtcIndexes = _ethWbtcIndexes;
    }
}
