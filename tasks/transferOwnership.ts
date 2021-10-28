/* global ethers hre task */

import { task } from "hardhat/config";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { PopulatedTransaction } from "@ethersproject/contracts";

import {
  maticDiamondAddress,
  maticDiamondUpgrader,
} from "../scripts/helperFunctions";
import { sendToGnosisSafe } from "../scripts/libraries/multisig/multisig";
import { OwnershipFacet } from "../typechain";

export interface TransferOwnershipTaskArgs {
  newOwner: string;
  useMultisig: boolean;
}

task("transferOwnership", "Mass registers ERC721 in auction")
  .addParam("newOwner")
  .addFlag("useMultisig")

  .setAction(
    async (
      taskArgs: TransferOwnershipTaskArgs,
      hre: HardhatRuntimeEnvironment
    ) => {
      const newAddress = taskArgs.newOwner;
      const useMultisig = taskArgs.useMultisig;

      const accounts = await hre.ethers.getSigners();

      //transfer ownership to multisig
      const ownershipFacet = (await hre.ethers.getContractAt(
        "OwnershipFacet",
        maticDiamondAddress
      )) as OwnershipFacet;

      const currentOwner = await ownershipFacet.owner();
      console.log("owner", currentOwner);

      if (useMultisig) {
        console.log("Sending to multisig");
        const tx: PopulatedTransaction =
          await ownershipFacet.populateTransaction.transferOwnership(
            newAddress
          );

        await sendToGnosisSafe(hre, maticDiamondUpgrader, tx, accounts[0]);
      }
    }
  );
