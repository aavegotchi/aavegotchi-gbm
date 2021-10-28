/* global ethers hre task */

import { task } from "hardhat/config";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { NonceManager } from "@ethersproject/experimental";
// @ts-ignore
import chalk from "chalk";
import auctionConfig from "../auction.config";
import { gasPrice } from "../helpers/auctionHelpers";
import { AuctionPreset } from "../types";
import { Contract } from "@ethersproject/contracts";
import { BigNumber } from "@ethersproject/bignumber";
import { request } from "graphql-request";
import { SettingsFacet } from "../typechain";

export interface MassRegisterERC721TaskArgs {
  gbmDiamondAddress: string;
  deployer: string;
  tokenContractAddress: string;
  tokenIds: string;
  preset: AuctionPreset;
}

task("massRegisterERC721", "Mass registers ERC721 in auction")
  .addParam("gbmDiamondAddress")
  .addParam("deployer")
  .addParam("tokenContractAddress", "The contract address of the token")
  .addParam("preset")
  .addParam("tokenIds", "Comma-separated string of tokenIDs")
  .setAction(
    async (
      taskArgs: MassRegisterERC721TaskArgs,
      hre: HardhatRuntimeEnvironment
    ) => {
      const preset = taskArgs.preset;
      const deployer = taskArgs.deployer;

      //transfer ownership to multisig
      const ownershipFacet = await hre.ethers.getContractAt(
        "OwnershipFacet",
        taskArgs.gbmDiamondAddress
      );

      const currentOwner = await ownershipFacet.owner();
      console.log("owner", currentOwner);

      if (currentOwner !== deployer) {
        throw new Error(
          `Current owner ${currentOwner} does not match deployer ${deployer}`
        );
      }

      let testing = ["hardhat", "localhost"].includes(hre.network.name);
      let nonceManagedSigner;

      if (testing) {
        await hre.network.provider.request({
          method: "hardhat_impersonateAccount",
          params: [deployer],
        });
        const signer = await hre.ethers.provider.getSigner(deployer);

        nonceManagedSigner = new NonceManager(signer);
        console.log("Deploying Account: " + deployer + "\n---");
      } else {
        const accounts = await hre.ethers.getSigners();
        const account = await accounts[0].getAddress();
        nonceManagedSigner = new NonceManager(accounts[0]);
        console.log("Deploying Account: " + account + "\n---");
      }

      console.log(
        `${chalk.cyan.underline(
          hre.network.name
        )} network testing with ${chalk.red.underline(preset)} preset!`
      );

      const gbm = await hre.ethers.getContractAt(
        "GBMFacet",
        taskArgs.gbmDiamondAddress,
        nonceManagedSigner
      );
      const settingsFacet = (await hre.ethers.getContractAt(
        "SettingsFacet",
        taskArgs.gbmDiamondAddress,
        nonceManagedSigner
      )) as SettingsFacet;

      const initiatorInfo = await settingsFacet.getInitiatorInfo();
      console.log(
        "start time:",
        new Date(Number(initiatorInfo.startTime.toString()) * 1000)
      );
      console.log(
        "end time:",
        new Date(Number(initiatorInfo.endTime.toString()) * 1000)
      );

      console.log("Bid Multiplier:", initiatorInfo.bidMultiplier.toString());

      const presetInfo = auctionConfig.auctionPresets[preset];

      if (
        initiatorInfo.bidMultiplier.toString() !==
          presetInfo.bidMultiplier.toString() ||
        initiatorInfo.startTime.toString() !==
          presetInfo.startTime.toString() ||
        initiatorInfo.endTime.toString() !== presetInfo.endTime.toString()
      ) {
        console.log(
          `Setting Preset for ${chalk.red(
            preset
          )} with begin time of ${new Date(
            Number(presetInfo.startTime.toString()) * 1000
          )} and end time of ${new Date(
            Number(presetInfo.endTime.toString()) * 1000
          )}`
        );

        const tx = await settingsFacet.setInitiatorInfo(presetInfo, {
          gasPrice: gasPrice,
        });

        await tx.wait();
      } else {
        console.log(`Preset is already set for ${chalk.red(preset)}, LFG!`);
      }

      //Change this to correct preset
      if (
        initiatorInfo.bidMultiplier.toString() !==
        auctionConfig.auctionPresets[preset].bidMultiplier.toString()
      ) {
        console.log("Presets were not uploaded correctly! Exiting");
        process.exit(1);
      } else {
        await deployAuction(
          taskArgs.tokenIds.split(","),
          preset,
          taskArgs.tokenContractAddress,
          nonceManagedSigner,
          taskArgs.gbmDiamondAddress,
          deployer,
          gbm,
          hre
        );
      }
    }
  );

async function deployAuction(
  tokenIds: string[],
  preset: "none" | "low" | "medium" | "high" | "degen" | "test",
  tokenContractAddress: string,
  nonceManagedSigner: NonceManager,
  gbmAddress: string,
  deployer: string,
  gbm: Contract,
  hre: HardhatRuntimeEnvironment
) {
  let totalGasUsed: BigNumber = hre.ethers.BigNumber.from("0");

  console.log("Deploying auctions for ids:", tokenIds.join(","));

  const erc721 = await hre.ethers.getContractAt(
    "ERC721Generic",
    tokenContractAddress,
    nonceManagedSigner
  );

  const approval = await erc721.isApprovedForAll(deployer, gbmAddress);

  const balanceOf = await erc721?.balanceOf(deployer);
  console.log("Deployer address balance:", balanceOf.toString());

  if (!approval) {
    console.log("Setting approval");
    const tx = await erc721?.setApprovalForAll(gbmAddress, true, {
      gasPrice: gasPrice,
    });
    await tx.wait();
  } else {
    console.log("Approved to transfer!:");
  }

  console.log(
    `[${chalk.cyan(hre.network.name)} ${chalk.yellow(
      auctionConfig.id
    )}] Creating auctions for ${preset.toUpperCase()} Preset:
      AMOUNT: ${chalk.yellow(auctionConfig.auctionTokenCounts[preset])}
      TYPE: ${chalk.yellow("ERC" + auctionConfig.ercType)}
      START_AT: ${chalk.yellow(auctionConfig.initialIndex)}
      END_AT: ${chalk.yellow(
        auctionConfig.initialIndex +
          auctionConfig.auctionTokenCounts[preset] -
          1
      )}`
  );

  //   let promises = [];

  const query = `
    {first1000: auctions(first:1000, where:{type:"erc721", incentivePreset:"${preset}", contractAddress:"${tokenContractAddress}"}) {
      id
      tokenId
    }
    first2000: auctions(skip:1000, first:1000, where:{type:"erc721", incentivePreset:"${preset}", contractAddress:"${tokenContractAddress}"}) {
      id
      tokenId
    }
    first3000: auctions(skip: 2000, first:1000, where:{type:"erc721", incentivePreset:"${preset}", contractAddress:"${tokenContractAddress}"}) {
      id
      tokenId
    }
    first4000: auctions(skip: 3000, first:1000, where:{type:"erc721", incentivePreset:"${preset}", contractAddress:"${tokenContractAddress}"}) {
      id
      tokenId
    }
    first5000: auctions(skip: 4000, first:1000, where:{type:"erc721", incentivePreset:"${preset}", contractAddress:"${tokenContractAddress}"}) {
      id
      tokenId
    }
  }
    `;
  //  const url =
  // "https://aavegotchi2.stakesquid-frens.gq/subgraphs/id/QmRJbPF5W1ujDUUZymmeYu4Xo7xfSP6gmi8NHDbX99pDDL";

  const url =
    "https://api.thegraph.com/subgraphs/name/aavegotchi/aavegotchi-gbm-v2-kovan";

  const response = await request(url, query);

  // console.log("response:", response);

  let deployed: string[] = [];
  response.first1000.forEach((auctionObj: any) => {
    deployed.push(auctionObj.tokenId);
  });

  response.first2000.forEach((auctionObj: any) => {
    deployed.push(auctionObj.tokenId);
  });

  response.first3000.forEach((auctionObj: any) => {
    deployed.push(auctionObj.tokenId);
  });

  response.first4000.forEach((auctionObj: any) => {
    deployed.push(auctionObj.tokenId);
  });

  console.log("Already deployed:", deployed.length);

  console.log(
    `${chalk.red(preset)} preset has ${tokenIds.length} tokens to mint.`
  );

  let sent = 0;

  //filter out the deployed tokenIds from the preset
  let filteredTokenIds = tokenIds.filter((tokenId: string) => {
    return !deployed.includes(tokenId.toString());
  });

  let remaining = filteredTokenIds.length - sent;

  console.log("filtered token ids:", filteredTokenIds);

  //   filteredTokenIds = [];

  /*
  while (remaining > 0) {
    if (remaining < auctionSteps) auctionSteps = remaining;

    console.log("remaining:", remaining);

    let finalTokenIds: string[] = filteredTokenIds.slice(
      sent,
      sent + auctionSteps
    );
    if (finalTokenIds.length > 0) {
        */
  console.log(
    `Creating Auctions for ${tokenIds.toString()} with GBM address: ${gbmAddress} for token contract address: ${tokenContractAddress}`
  );

  try {
    const r = await gbm.registerMassERC721Each(
      gbmAddress,
      true,
      tokenContractAddress,
      tokenIds,
      { gasPrice: gasPrice }
    );

    console.log("tx hash:", r.hash);

    await r.wait();

    console.log(
      `Created auctions for ${tokenIds.toString()}, using ${r.gasLimit.toString()} gas`
    );
  } catch (error) {
    console.log("error:", error);
  }

  //   totalGasUsed = totalGasUsed.add(r.gasLimit);

  //   promises.push(r);

  //   sent += auctionSteps;
  //   remaining -= auctionSteps;

  /*
      logger.info({
        tx: {
          hash: r.hash,
          from: r.from,
          to: r.to,
          nonce: r.nonce,
          chainId: r.chainId,
          networkId: hardhat.network.name,
        },
        params: {
          gbmAddress: gbmAddress,
          useDefault: true,
          erc721address: erc721address,
          tokenIds: tokenIds.slice(sent, sent + auctionSteps),
        },
      });
    } else {
      throw "That's it!";
    }
    */

  //     }

  //   await Promise.all(promises);

  /*  console.log(
    `[${chalk.green`✅`}] Completed! Log at ${chalk.yellow(filename)}`
  );
  */

  console.log("Used Gas:", totalGasUsed.toString());
}
