import { run } from "hardhat";
import { auction1 } from "../../data/auction1";
import { MassRegisterERC721TaskArgs } from "../../tasks/massRegisterERC721";

async function deployKovanAuction() {
  const taskArgs: MassRegisterERC721TaskArgs = {
    deployer: "0x94cb5C277FCC64C274Bd30847f0821077B231022",
    gbmDiamondAddress: "0xf757a7B19A077c87Dd3330f2c948609bEEde59ca",
    tokenContractAddress: "0xFAefD30Af8E86d3d8D22fa5caEFD48fAA2Fa8E21",
    tokenIds: auction1.slice(0, 1).join(","),
    preset: "medium",
  };

  await run("massRegisterERC721", taskArgs);
}

deployKovanAuction()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

exports.grantXP = deployKovanAuction;
