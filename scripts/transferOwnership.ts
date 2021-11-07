import { run, ethers } from "hardhat";
import { TransferOwnershipTaskArgs } from "../tasks/transferOwnership";

async function transferOwner() {
  const newOwner = "0x22262f6e7969CE2bA58238f33e717C36060F33B4";

  console.log("Transferring owner to:", newOwner);
  const taskArgs: TransferOwnershipTaskArgs = {
    newOwner: newOwner,
    useMultisig: false,
  };

  await run("transferOwnership", taskArgs);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
if (require.main === module) {
  transferOwner()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

exports.deployDiamond = transferOwner;
