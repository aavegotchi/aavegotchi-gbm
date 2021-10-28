import { run } from "hardhat";
import { auction1 } from "../../data/auction1";
import { MassRegisterERC721TaskArgs } from "../../tasks/massRegisterERC721";
import { maticDiamondAddress } from "../helperFunctions";

async function registerERC721Auctions() {
  const maxProcess = 1;

  const batches = Math.floor(auction1.length / maxProcess);
  console.log("batches:", batches);

  let currentBatch = 0;

  for (let index = 0; index < batches; index++) {
    const tokenIds = auction1
      .slice(maxProcess * currentBatch, maxProcess * currentBatch + maxProcess)
      .join(",");

    const taskArgs: MassRegisterERC721TaskArgs = {
      deployer: "0x94cb5C277FCC64C274Bd30847f0821077B231022",
      gbmDiamondAddress: maticDiamondAddress,
      tokenContractAddress: "0x1D0360BaC7299C86Ec8E99d0c1C9A95FEfaF2a11",
      tokenIds: tokenIds,
      preset: "medium",
    };

    await run("massRegisterERC721", taskArgs);

    currentBatch++;
  }
}

registerERC721Auctions()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

exports.grantXP = registerERC721Auctions;
