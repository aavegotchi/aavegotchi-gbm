//@ts-ignore
import { ethers, run } from "hardhat";
import {
  convertFacetAndSelectorsToString,
  DeployUpgradeTaskArgs,
  FacetsAndAddSelectors,
} from "../../tasks/deployUpgrade";

import { maticDiamondAddress, maticDiamondUpgrader } from "../helperFunctions";

export async function deployUpgrade() {
  const facets: FacetsAndAddSelectors[] = [
    {
      facetName: "GBMFacet",
      addSelectors: [
        // "function claim(uint256 _auctionId) external",
        // "function registerAnAuctionToken(address _tokenContract,uint256 _tokenId,bytes4 _tokenKind,bool _useInitiator) external",
        "function registerAnAuctionTokenSecondaryMarket(uint256 _contractID, uint256 _tokenId,bytes4 _tokenKind,uint256 _tokenAmount,uint256 _auctionPresetID) external",
        "function cancelAuction(uint256 _auctionID) external",
        "function secondaryMarketTokenContract(uint256 _contractID, address _tokenContract) external",
        "function setAuctionPresets(uint256 _auctionPresetID, uint256 _startTime,uint256 _endTime,uint256 _hammerTimeDuration,uint256 _bidDecimals,uint256 _stepMin,  uint256 _incMin, uint256 _incMax, uint256 _bidMultiplier) external",
        "function getAuctionPresets(uint256 _auctionPresetID) public view returns(uint256 _startTime,uint256 _endTime,uint256 _hammerTimeDuration,uint256 _bidDecimals,uint256 _stepMin,uint256 _incMin,uint256 _incMax,uint256 _bidMultiplier)",
        "function getAuctionID(address _contract, uint256 _tokenID, uint256 _tokenIndex,bytes4 _tokenKind) external returns (uint256)",
      ],
      removeSelectors: [],
    },
  ];

  const joined = convertFacetAndSelectorsToString(facets);

  const args: DeployUpgradeTaskArgs = {
    diamondUpgrader: maticDiamondUpgrader,
    diamondAddress: maticDiamondAddress,
    facetsAndAddSelectors: joined,
    useLedger: false,
    useMultisig: false,
    initAddress: ethers.constants.AddressZero,
    initCalldata: "0x",
  };

  await run("deployUpgrade", args);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
if (require.main === module) {
  deployUpgrade()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
