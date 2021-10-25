//@ts-ignore
import hardhat, { run, ethers } from "hardhat";
import {
  convertFacetAndSelectorsToString,
  DeployUpgradeTaskArgs,
  FacetsAndAddSelectors,
} from "../../tasks/deployUpgrade";
import { GBMFacet__factory } from "../../typechain";
import { GBMFacetInterface } from "../../typechain/GBMFacet";
import { maticDiamondAddress, maticDiamondUpgrader } from "../helperFunctions";

export async function deployUpgrade() {
  const facets: FacetsAndAddSelectors[] = [
    {
      facetName: "GBMFacet",
      addSelectors: [
        "function updatePlayerRewardsAddress(address _newAddress) external",
      ],
      removeSelectors: [],
    },
  ];

  const joined = convertFacetAndSelectorsToString(facets);

  let iface: GBMFacetInterface = new ethers.utils.Interface(
    GBMFacet__factory.abi
  ) as GBMFacetInterface;

  const newAddress = "0x48eA1d45142fC645fDcf78C133Ac082eF159Fe14";

  const calldata = iface.encodeFunctionData("updatePlayerRewardsAddress", [
    newAddress,
  ]);

  const args: DeployUpgradeTaskArgs = {
    diamondUpgrader: maticDiamondUpgrader,
    diamondAddress: maticDiamondAddress,
    facetsAndAddSelectors: joined,
    useLedger: true,
    useMultisig: true,
    initAddress: maticDiamondAddress,
    initCalldata: calldata,
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
