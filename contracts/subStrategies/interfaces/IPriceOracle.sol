// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface IPriceOracle {
    function getAssetPrice() external view returns (uint256);
}
