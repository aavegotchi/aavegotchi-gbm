//@ts-ignore
import hardhat, { run, ethers } from "hardhat";
// @ts-ignore
import moment from "moment";
// @ts-ignore
import chalk from "chalk";
import { createLogger, format, transports } from "winston";
import auctionConfig from "../auction.config";
import { NonceManager } from "@ethersproject/experimental";
import { Contract, BigNumber, utils } from "ethers";
import { request } from "graphql-request";
import { AuctionPreset } from "../types";
const { h2tokenIds } = require("../data/h2tokenIds");

const startAt = moment().format("YYYY-MM-DD_HH-mm-ss");
const filename = `logs/${hardhat.network.name}/${auctionConfig.id}/${startAt}.log.json`;
const logger = createLogger({
  level: "info",
  // @ts-ignore
  format: format.combine(format.timestamp(), format.prettyPrint(format.json())),
  defaultMeta: { service: auctionConfig.id },
  transports: [
    new transports.File({
      filename: filename,
    }),
  ],
});
logger.on("finish", () => {
  process.exit(0);
});

const gasPrice = 50000000000;

async function prepareAuction(preset: AuctionPreset) {
  const itemManager = "0x8D46fd7160940d89dA026D59B2e819208E714E82";

  let gbm: Contract;
  let gbmInitiator: Contract;
  let gbmAddress: string;
  // let erc721: Contract;

  let testing = ["hardhat"].includes(hardhat.network.name);
  let nonceManagedSigner;

  if (testing) {
    await hardhat.network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [itemManager],
    });
    const signer = await ethers.provider.getSigner(itemManager);

    nonceManagedSigner = new NonceManager(signer);
    console.log("Deploying Account: " + itemManager + "\n---");
  } else {
    const accounts = await ethers.getSigners();
    const account = await accounts[0].getAddress();
    nonceManagedSigner = new NonceManager(accounts[0]);
    console.log("Deploying Account: " + account + "\n---");
  }

  console.log(
    `${chalk.cyan.underline(
      hardhat.network.name
    )} network testing with ${chalk.red.underline(preset)} preset!`
  );

  const diamondAddress = "0xa44c8e0eCAEFe668947154eE2b803Bd4e6310EFe";

  gbm = await ethers.getContractAt(
    "GBMFacet",
    diamondAddress,
    nonceManagedSigner
  );
  gbmInitiator = await ethers.getContractAt(
    "SettingsFacet",
    diamondAddress,
    nonceManagedSigner
  );

  gbmAddress = diamondAddress; //gbm.address;
  // console.log("GBM deployed to:", gbmAddress);

  logger.info({
    config: auctionConfig,
  });

  //Begin Auctions

  console.log(`Setting Preset for ${chalk.red(preset)}`);
  const presetInfo = auctionConfig.auctionPresets[preset];
  const tx = await gbmInitiator.setInitiatorInfo(presetInfo, {
    gasPrice: gasPrice,
  });

  await tx.wait();

  const initiatorInfo = await gbmInitiator.getInitiatorInfo();
  console.log(
    "start time:",
    new Date(Number(initiatorInfo.startTime.toString()) * 1000)
  );
  console.log(
    "end time:",
    new Date(Number(initiatorInfo.endTime.toString()) * 1000)
  );

  console.log("Bid Multiplier:", initiatorInfo.bidMultiplier.toString());

  //Change this to correct preset
  if (
    initiatorInfo.bidMultiplier.toString() !==
    auctionConfig.auctionPresets[preset].bidMultiplier.toString()
  ) {
    console.log("Presets were not uploaded correctly! Exiting");
    process.exit(1);
  } else {
    await deployAuction(
      preset,
      nonceManagedSigner,
      gbmAddress,
      itemManager,
      gbm
    );
  }
}

prepareAuction("high")
  .then(() => process.exit(1))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

exports.deploy = prepareAuction;
