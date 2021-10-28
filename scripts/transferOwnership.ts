import { run, ethers } from "hardhat";
import { TransferOwnershipTaskArgs } from "../tasks/transferOwnership";

async function transferOwner() {
  console.log("Transferring owner");
  const taskArgs: TransferOwnershipTaskArgs = {
    newOwner: "0x94cb5C277FCC64C274Bd30847f0821077B231022",
    useMultisig: true,
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
